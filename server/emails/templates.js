function renderBase({
  preheader = '',
  heading = 'Nine Dart Nation',
  title = '',
  intro = '',
  username = 'Player',
  actionUrl = '#',
  buttonLabel = 'Open',
  extraHtml = '',
  footerHtml = '',
}) {
  const brand = { primary: '#4f46e5', accent: '#a855f7', bg: '#0b1220', card: '#0f172a', text: '#e5e7eb', sub: '#94a3b8' }
  const safeAction = String(actionUrl || '#')
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>${heading}</title>
    <style>
      .preheader{display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all}
      @media (prefers-color-scheme: light){
        .wrap{background:#f1f5f9}
        .card{background:#ffffff;color:#0f172a}
        .muted{color:#475569}
        .btn{background:${brand.primary};color:#fff}
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${brand.bg};font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial, sans-serif;color:${brand.text}">
    <span class="preheader">${preheader}</span>
    <div class="wrap" style="padding:24px;background:${brand.bg}">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width:620px;margin:0 auto">
        <tr>
          <td style="padding:8px 0 16px 0;text-align:center;font-weight:800;font-size:22px;color:${brand.text}">🎯 ${heading}</td>
        </tr>
        <tr>
          <td class="card" style="background:${brand.card};border:1px solid #1f2937;border-radius:14px;padding:24px">
            <h1 style="margin:0 0 8px 0;font-size:20px;line-height:1.3;color:${brand.text}">${title}</h1>
            <p style="margin:0 0 12px 0;color:${brand.sub}">Hi <strong style="color:${brand.text}">${username}</strong>,</p>
            ${intro ? `<p style=\"margin:0 0 16px 0;line-height:1.6;color:${brand.text}\">${intro}</p>` : ''}
            ${extraHtml}
            <div style="margin:18px 0">
              <a class="btn" href="${safeAction}" style="display:inline-block;background:${brand.primary};padding:12px 18px;color:#fff;text-decoration:none;border-radius:10px;font-weight:600">${buttonLabel}</a>
            </div>
            <p class="muted" style="margin:6px 0 0 0;font-size:12px;color:${brand.sub}">If the button doesn’t work, copy and paste this URL:</p>
            <p style="word-break:break-all;font-size:12px;margin:4px 0 16px 0"><a href="${safeAction}" style="color:${brand.accent};text-decoration:none">${safeAction}</a></p>
            ${footerHtml}
            <p class="muted" style="margin:12px 0 0 0;color:${brand.sub}">If you didn’t request this, you can safely ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 6px;text-align:center;color:#64748b;font-size:12px">© ${new Date().getFullYear()} Nine Dart Nation</td>
        </tr>
      </table>
    </div>
  </body>
</html>`
  return { html }
}

export function passwordReset({ username = 'Player', actionUrl = '#', title = 'Reset your password', intro = 'We received a request to reset your password. Use the button below to set a new one. This link expires in 30 minutes.', buttonLabel = 'Reset Password', expiresMinutes = 30 } = {}) {
  const footerHtml = `<p style="margin:0;color:#94a3b8;font-size:12px">For security, this link is valid for about ${expiresMinutes} minutes.</p>`
  return renderBase({ preheader: 'Reset your Nine Dart Nation password', heading: 'Nine Dart Nation', title, intro, username, actionUrl, buttonLabel, footerHtml })
}

export function passwordReminder({ username = 'Player', actionUrl = '#', title = 'Password reset link', intro = 'You asked for a password reset link. Use the button below to continue. This link expires in 30 minutes.', buttonLabel = 'Reset Password', expiresMinutes = 30 } = {}) {
  const footerHtml = `<p style="margin:0;color:#94a3b8;font-size:12px">This link will expire in about ${expiresMinutes} minutes.</p>`
  return renderBase({ preheader: 'Password reset link', heading: 'Nine Dart Nation', title, intro, username, actionUrl, buttonLabel, footerHtml })
}

export function usernameReminder({ username = 'Player', title = 'Your username', intro = 'Here’s your username on Nine Dart Nation. If you didn’t request this, you can ignore it.', buttonLabel = 'Open App', actionUrl = '#' } = {}) {
  const extraHtml = `<div style="margin:12px 0 16px 0"><div style="font-size:12px;color:#94a3b8;margin-bottom:6px">Username</div><div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;background:#0b1220;border:1px solid #1f2937;border-radius:10px;padding:10px 12px;display:inline-block;color:#e5e7eb">${username}</div></div>`
  return renderBase({ preheader: 'Your username reminder', heading: 'Nine Dart Nation', title, intro, username, actionUrl, buttonLabel, extraHtml })
}

export function emailChangeConfirm({ username = 'Player', newEmail = 'player@example.com', actionUrl = '#', title = 'Confirm your new email', intro = 'Click the button to confirm your new email address.', buttonLabel = 'Confirm Email' } = {}) {
  const extraHtml = `<p style="margin:0 0 12px 0;color:#94a3b8">New email: <strong style="color:#e5e7eb">${newEmail}</strong></p>`
  return renderBase({ preheader: 'Confirm your email change', heading: 'Nine Dart Nation', title, intro, username, actionUrl, buttonLabel, extraHtml })
}

export function passwordChangedNotice({ username = 'Player', supportUrl = '#', title = 'Your password was changed', intro = 'Your password was just changed. If this wasn’t you, secure your account immediately.' } = {}) {
  const footerHtml = `<p style="margin:0;color:#94a3b8;font-size:12px">Need help? <a href="${String(supportUrl||'#')}" style="color:#a855f7;text-decoration:none">Contact support</a>.</p>`
  return renderBase({ preheader: 'Password changed', heading: 'Nine Dart Nation', title, intro, username, actionUrl: supportUrl, buttonLabel: 'Get Help', footerHtml })
}
