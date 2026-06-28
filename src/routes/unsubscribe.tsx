import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Loader2, CheckCircle2, AlertCircle, BellOff } from 'lucide-react'

export const Route = createFileRoute('/unsubscribe')({
  head: () => ({
    meta: [
      { title: 'Unsubscribe — Tender Watch' },
      { name: 'robots', content: 'noindex,nofollow' },
    ],
  }),
  component: UnsubscribePage,
})

type State =
  | { kind: 'loading' }
  | { kind: 'valid' }
  | { kind: 'invalid'; message: string }
  | { kind: 'already' }
  | { kind: 'confirming' }
  | { kind: 'done' }
  | { kind: 'error'; message: string }

function UnsubscribePage() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token')
    if (!t) {
      setState({ kind: 'invalid', message: 'Missing unsubscribe token.' })
      return
    }
    setToken(t)
    ;(async () => {
      try {
        const res = await fetch(`/email/unsubscribe?token=${encodeURIComponent(t)}`)
        const data = await res.json()
        if (!res.ok) {
          setState({ kind: 'invalid', message: data?.error ?? 'Invalid or expired link.' })
          return
        }
        if (data.valid === false && data.reason === 'already_unsubscribed') {
          setState({ kind: 'already' })
          return
        }
        if (data.valid) setState({ kind: 'valid' })
        else setState({ kind: 'invalid', message: 'Invalid token.' })
      } catch {
        setState({ kind: 'error', message: 'Could not reach the server.' })
      }
    })()
  }, [])

  const confirm = async () => {
    if (!token) return
    setState({ kind: 'confirming' })
    try {
      const res = await fetch('/email/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) {
        setState({ kind: 'error', message: data?.error ?? 'Something went wrong.' })
        return
      }
      if (data.success || data.reason === 'already_unsubscribed') {
        setState({ kind: 'done' })
      } else {
        setState({ kind: 'error', message: 'Unsubscribe failed.' })
      }
    } catch {
      setState({ kind: 'error', message: 'Network error.' })
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          {state.kind === 'loading' || state.kind === 'confirming' ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : state.kind === 'done' || state.kind === 'already' ? (
            <CheckCircle2 className="h-5 w-5 text-primary" />
          ) : state.kind === 'valid' ? (
            <BellOff className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5 text-destructive" />
          )}
        </div>

        {state.kind === 'loading' && <p className="text-sm text-muted-foreground">Checking link…</p>}

        {state.kind === 'valid' && (
          <>
            <h1 className="text-lg font-semibold">Unsubscribe from tender alerts?</h1>
            <p className="text-sm text-muted-foreground">
              You will no longer receive email notifications about new matching tenders.
            </p>
            <Button onClick={confirm} className="w-full">
              Confirm unsubscribe
            </Button>
          </>
        )}

        {state.kind === 'confirming' && (
          <p className="text-sm text-muted-foreground">Processing…</p>
        )}

        {state.kind === 'done' && (
          <>
            <h1 className="text-lg font-semibold">You're unsubscribed</h1>
            <p className="text-sm text-muted-foreground">
              We won't send you any more tender alert emails.
            </p>
          </>
        )}

        {state.kind === 'already' && (
          <>
            <h1 className="text-lg font-semibold">Already unsubscribed</h1>
            <p className="text-sm text-muted-foreground">
              This email address has already opted out of tender alerts.
            </p>
          </>
        )}

        {state.kind === 'invalid' && (
          <>
            <h1 className="text-lg font-semibold">Link not valid</h1>
            <p className="text-sm text-muted-foreground">{state.message}</p>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">{state.message}</p>
          </>
        )}
      </Card>
    </div>
  )
}
