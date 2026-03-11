import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { requireAdmin } from '@/lib/auth'

interface ReportPayload {
  operation_label: string
  status: string
  duration_seconds: number
  leads_created: number
  leads_updated: number
  leads_enriched: number
  sheet_url?: string
}

function getGmailAuth() {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail OAuth not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.')
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret)
  oauth2.setCredentials({ refresh_token: refreshToken })
  return oauth2
}

function buildHtml(data: ReportPayload): string {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const time = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  })

  const statusColor = data.status === 'completed' ? '#059669' : '#dc2626'
  const statusLabel = data.status === 'completed' ? 'Completed Successfully' : 'Failed'

  const sheetBlock = data.sheet_url
    ? `<tr>
        <td style="padding:28px 32px;text-align:center">
          <a href="${data.sheet_url}" target="_blank" rel="noopener"
             style="display:inline-block;padding:14px 32px;background:#0049B8;color:#ffffff;
                    text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;
                    letter-spacing:0.3px">
            Open Google Sheet &rarr;
          </a>
          <div style="margin-top:10px;font-size:12px;color:#94a3b8">
            Top leads exported with full enrichment data
          </div>
        </td>
      </tr>`
    : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">

  <!-- Header -->
  <tr>
    <td style="background:#0f172a;padding:32px 32px 28px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px">Bay Sentinel</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:4px">Pipeline Report</div>
          </td>
          <td align="right">
            <div style="font-size:11px;color:#64748b">${date}</div>
            <div style="font-size:11px;color:#64748b">${time} PT</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Status Banner -->
  <tr>
    <td style="padding:24px 32px 0">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${data.status === 'completed' ? '#f0fdf4' : '#fef2f2'};border:1px solid ${data.status === 'completed' ? '#bbf7d0' : '#fecaca'};border-radius:8px">
        <tr>
          <td style="padding:16px 20px">
            <div style="font-size:14px;font-weight:700;color:${statusColor}">${statusLabel}</div>
            <div style="font-size:13px;color:#475569;margin-top:2px">${data.operation_label} &bull; ${data.duration_seconds}s</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Metrics -->
  <tr>
    <td style="padding:24px 32px">
      <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px">Results</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="33%" style="text-align:center;padding:16px 8px;background:#f8fafc;border-radius:8px 0 0 8px;border:1px solid #e2e8f0;border-right:none">
            <div style="font-size:28px;font-weight:800;color:#0f172a;line-height:1">${data.leads_updated.toLocaleString()}</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;font-weight:500">Leads Analyzed</div>
          </td>
          <td width="33%" style="text-align:center;padding:16px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-right:none">
            <div style="font-size:28px;font-weight:800;color:#0f172a;line-height:1">${data.leads_enriched.toLocaleString()}</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;font-weight:500">Scores Updated</div>
          </td>
          <td width="33%" style="text-align:center;padding:16px 8px;background:#f8fafc;border-radius:0 8px 8px 0;border:1px solid #e2e8f0">
            <div style="font-size:28px;font-weight:800;color:#0f172a;line-height:1">${data.duration_seconds}s</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;font-weight:500">Duration</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Pipeline Steps -->
  <tr>
    <td style="padding:0 32px 24px">
      <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px">Pipeline Steps</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <tr style="background:#f8fafc">
          <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#475569;border-bottom:1px solid #e2e8f0">Step</td>
          <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#475569;border-bottom:1px solid #e2e8f0" align="right">Status</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9">1. Detect Absentee Owners</td>
          <td style="padding:10px 16px;font-size:12px;color:#059669;font-weight:600;border-bottom:1px solid #f1f5f9" align="right">&#10003; Complete</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9">2. Recompute Distress Scores</td>
          <td style="padding:10px 16px;font-size:12px;color:#059669;font-weight:600;border-bottom:1px solid #f1f5f9" align="right">&#10003; Complete</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;font-size:13px;color:#1e293b">3. Export to Google Sheets</td>
          <td style="padding:10px 16px;font-size:12px;color:#059669;font-weight:600" align="right">&#10003; Complete</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Sheet CTA -->
  ${sheetBlock}

  <!-- Footer -->
  <tr>
    <td style="padding:24px 32px;border-top:1px solid #e2e8f0">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <div style="font-size:11px;color:#94a3b8">Amazing Ventures LLC</div>
          </td>
          <td align="right">
            <div style="font-size:10px;color:#cbd5e1">Built by <a href="https://nextautomation.us" style="color:#0049B8;text-decoration:none">NextAutomation</a></div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

</table>
</td></tr></table>
</body>
</html>`
}

function buildRawEmail(to: string, from: string, subject: string, html: string): string {
  const boundary = 'boundary_' + Date.now()
  const lines = [
    `From: Bay Sentinel <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html).toString('base64'),
    '',
    `--${boundary}--`,
  ]
  return lines.join('\r\n')
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request)

    const body = (await request.json()) as ReportPayload
    if (!body.operation_label || !body.status) {
      return NextResponse.json({ error: 'Missing report data' }, { status: 400 })
    }

    const toAddress = process.env.REPORT_EMAIL_TO || 'lucas@nextautomation.us'
    const fromAddress = process.env.GMAIL_SENDER || 'lucas@nextautomation.us'
    const subject = `Bay Sentinel Report — ${body.operation_label}`
    const html = buildHtml(body)

    const auth = getGmailAuth()
    const gmail = google.gmail({ version: 'v1', auth })

    const raw = buildRawEmail(toAddress, fromAddress, subject, html)
    const encodedMessage = Buffer.from(raw)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    })

    return NextResponse.json({
      sent: true,
      messageId: result.data.id,
      to: toAddress,
    })
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    const msg = thrown instanceof Error ? thrown.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
