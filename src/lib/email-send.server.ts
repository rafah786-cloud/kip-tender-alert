// Server-only helper: enqueue a transactional email via the email queue.
// Used by background jobs (tender scraper) where there is no user JWT.
// Mirrors the logic in src/routes/lovable/email/transactional/send.ts but
// skips the auth check — call it ONLY from trusted server code.

import * as React from 'react'
import { render } from 'react-email'
import { createClient } from '@supabase/supabase-js'
import { TEMPLATES } from './email-templates/registry'

const SITE_NAME = 'Tender Watch'
const SENDER_DOMAIN = 'notify.zizzmattress.com'
const FROM_DOMAIN = 'notify.zizzmattress.com'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function sendTenderEmail(opts: {
  templateName: string
  recipientEmail: string
  idempotencyKey: string
  templateData: Record<string, any>
}): Promise<{ ok: boolean; reason?: string }> {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    return { ok: false, reason: 'missing_env' }
  }

  const template = TEMPLATES[opts.templateName]
  if (!template) return { ok: false, reason: 'unknown_template' }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const recipient = opts.recipientEmail.trim()
  const normalizedEmail = recipient.toLowerCase()
  const messageId = crypto.randomUUID()

  // Suppression check (fail-closed)
  const { data: suppressed, error: supErr } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle()
  if (supErr) return { ok: false, reason: 'suppression_check_failed' }
  if (suppressed) {
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: opts.templateName,
      recipient_email: recipient,
      status: 'suppressed',
    })
    return { ok: false, reason: 'suppressed' }
  }

  // Unsubscribe token (one per email; reuse unused)
  let unsubscribeToken: string
  const { data: existing } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existing && !existing.used_at) {
    unsubscribeToken = existing.token
  } else if (!existing) {
    unsubscribeToken = generateToken()
    await supabase
      .from('email_unsubscribe_tokens')
      .upsert(
        { token: unsubscribeToken, email: normalizedEmail },
        { onConflict: 'email', ignoreDuplicates: true },
      )
    const { data: stored } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalizedEmail)
      .maybeSingle()
    if (!stored) return { ok: false, reason: 'token_store_failed' }
    unsubscribeToken = stored.token
  } else {
    return { ok: false, reason: 'token_used' }
  }

  // Render template
  const element = React.createElement(template.component, opts.templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject =
    typeof template.subject === 'function'
      ? template.subject(opts.templateData)
      : template.subject

  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: opts.templateName,
    recipient_email: recipient,
    status: 'pending',
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: recipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: 'transactional',
      label: opts.templateName,
      idempotency_key: opts.idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: opts.templateName,
      recipient_email: recipient,
      status: 'failed',
      error_message: enqueueError.message,
    })
    return { ok: false, reason: 'enqueue_failed' }
  }

  return { ok: true }
}
