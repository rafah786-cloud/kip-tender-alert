import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Tender {
  title: string
  source_label?: string
  organisation?: string | null
  published_at?: string | null
  closing_at?: string | null
  tender_url?: string | null
  matched_keywords?: string[]
}

interface Props {
  tenders?: Tender[]
  totalNew?: number
  dashboardUrl?: string
}

const main: React.CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  color: '#0f172a',
}
const container: React.CSSProperties = { padding: '24px', maxWidth: '600px' }
const h1: React.CSSProperties = { fontSize: '20px', fontWeight: 700, margin: '0 0 4px' }
const sub: React.CSSProperties = { fontSize: '13px', color: '#64748b', margin: '0 0 20px' }
const card: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '14px 16px',
  marginBottom: '10px',
}
const title: React.CSSProperties = { fontSize: '14px', fontWeight: 600, margin: '0 0 4px', lineHeight: 1.4 }
const meta: React.CSSProperties = { fontSize: '12px', color: '#64748b', margin: '2px 0' }
const kw: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '11px',
  background: '#f1f5f9',
  color: '#334155',
  padding: '2px 8px',
  borderRadius: '999px',
  marginRight: '4px',
  marginTop: '6px',
}
const btn: React.CSSProperties = {
  display: 'inline-block',
  background: '#0f172a',
  color: '#ffffff',
  fontSize: '12px',
  padding: '8px 14px',
  borderRadius: '6px',
  textDecoration: 'none',
  marginTop: '8px',
}
const hr: React.CSSProperties = { borderTop: '1px solid #e2e8f0', margin: '24px 0 12px' }
const foot: React.CSSProperties = { fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }

const TenderAlert = ({ tenders = [], totalNew = 0, dashboardUrl = '#' }: Props) => {
  const items = tenders.slice(0, 15)
  return (
    <Html lang="en">
      <Head />
      <Preview>{`${totalNew} new mattress / bedding tender${totalNew === 1 ? '' : 's'} found`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>
            {totalNew} new tender{totalNew === 1 ? '' : 's'} matched
          </Heading>
          <Text style={sub}>
            From central &amp; Kerala government e-procurement portals.
          </Text>

          {items.map((t, i) => (
            <Section key={i} style={card}>
              <Text style={title}>{t.title}</Text>
              {t.organisation && <Text style={meta}>{t.organisation}</Text>}
              {t.source_label && <Text style={meta}>Source: {t.source_label}</Text>}
              {(t.published_at || t.closing_at) && (
                <Text style={meta}>
                  {t.published_at ? `Published: ${t.published_at}` : ''}
                  {t.published_at && t.closing_at ? '  ·  ' : ''}
                  {t.closing_at ? `Closes: ${t.closing_at}` : ''}
                </Text>
              )}
              {t.matched_keywords && t.matched_keywords.length > 0 && (
                <div>
                  {t.matched_keywords.map((k) => (
                    <span key={k} style={kw}>
                      {k}
                    </span>
                  ))}
                </div>
              )}
              {t.tender_url && (
                <Link href={t.tender_url} style={btn}>
                  Open tender
                </Link>
              )}
            </Section>
          ))}

          {totalNew > items.length && (
            <Text style={meta}>
              + {totalNew - items.length} more · open the dashboard to view all.
            </Text>
          )}

          <Link href={dashboardUrl} style={btn}>
            Open dashboard
          </Link>

          <Hr style={hr} />
          <Text style={foot}>
            You're getting this because tender alerts are enabled on Tender Watch.
            To stop these, turn off email alerts in the dashboard or use the
            unsubscribe link below.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: TenderAlert,
  subject: (data: Record<string, any>) =>
    `${data.totalNew ?? 'New'} new mattress / bedding tender${(data.totalNew ?? 0) === 1 ? '' : 's'} matched`,
  displayName: 'Tender Match Alert',
  previewData: {
    totalNew: 2,
    dashboardUrl: 'https://example.com',
    tenders: [
      {
        title: 'Supply of Coir Mattresses to District Hospital',
        source_label: 'Kerala eTenders',
        organisation: 'Directorate of Health Services',
        published_at: '24-Jun-2026',
        closing_at: '10-Jul-2026',
        tender_url: 'https://etenders.kerala.gov.in/',
        matched_keywords: ['coir mattress', 'mattress'],
      },
      {
        title: 'Procurement of Spring Mattresses & Pillows — CRPF Group Centre',
        source_label: 'Central Public Procurement Portal',
        organisation: 'Ministry of Home Affairs',
        published_at: '25-Jun-2026',
        closing_at: '15-Jul-2026',
        tender_url: 'https://eprocure.gov.in/',
        matched_keywords: ['spring mattress', 'pillow'],
      },
    ],
  },
} satisfies TemplateEntry
