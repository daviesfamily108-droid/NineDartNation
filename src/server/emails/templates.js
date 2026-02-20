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
  iconEmoji = '&#127919;',
  accentColor = '#4f46e5',
}) {
  const brand = { primary: '#4f46e5', accent: '#a855f7', bg: '#0b1120', card: '#111827', cardBorder: '#1e293b', text: '#f1f5f9', sub: '#cbd5e1', muted: '#94a3b8' }
  const safeAction = String(actionUrl || '#')
  const year = new Date().getFullYear()
  const btnColor = accentColor || brand.primary
  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>${heading}</title>
    <!--[if mso]>
    <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
    <![endif]-->
    <style>
      .preheader{display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0}
      body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
      table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
      img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none}
      @media only screen and (max-width:620px){
        .email-container{width:100%!important;max-width:100%!important}
        .fluid{width:100%!important;max-width:100%!important;height:auto!important}
        .stack-col{display:block!important;width:100%!important;max-width:100%!important}
        .center-on-narrow{text-align:center!important;display:block!important;margin-left:auto!important;margin-right:auto!important}
        .card-pad{padding-left:20px!important;padding-right:20px!important}
      }
      @media (prefers-color-scheme: light){
        .wrap{background:#f8fafc!important}
        .card{background:#ffffff!important;border-color:#e2e8f0!important}
        .card-text{color:#1e293b!important}
        .card-sub{color:#475569!important}
        .card-muted{color:#64748b!important}
        .footer-text{color:#94a3b8!important}
      }
    </style>
  </head>
  <body style="margin:0;padding:0;word-spacing:normal;background:${brand.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale">
    <span class="preheader">${preheader}${'&#847; &zwnj; &nbsp; '.repeat(40)}</span>
    <div class="wrap" role="article" aria-roledescription="email" aria-label="${heading}" lang="en" style="background:${brand.bg};padding:0">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="margin:auto" class="email-container">
        <!-- Top spacer -->
        <tr><td style="padding:32px 0 0 0">&nbsp;</td></tr>

        <!-- Logo / Brand header -->
        <tr>
          <td style="padding:0 24px">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width:560px;margin:0 auto">
              <tr>
                <td style="text-align:center;padding:0 0 28px 0">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto">
                    <tr>
                      <td style="background:linear-gradient(135deg,${brand.primary},${brand.accent});background-color:${brand.primary};border-radius:14px;padding:12px 32px;text-align:center">
                        <span style="font-size:24px;line-height:1;vertical-align:middle">&#127919;</span>
                        <span style="font-size:17px;font-weight:800;color:#ffffff;letter-spacing:0.2px;vertical-align:middle;padding-left:10px">${heading}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Main card -->
        <tr>
          <td style="padding:0 24px">
            <table class="card" role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width:560px;margin:0 auto;background:${brand.card};border:1px solid ${brand.cardBorder};border-radius:20px;overflow:hidden">
              <!-- Accent gradient bar at top of card -->
              <tr>
                <td style="background:linear-gradient(90deg,${btnColor},${brand.accent});background-color:${btnColor};height:4px;font-size:1px;line-height:1px">&nbsp;</td>
              </tr>
              <!-- Icon circle -->
              <tr>
                <td class="card-pad" style="padding:36px 40px 0 40px;text-align:center">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto">
                    <tr>
                      <td style="width:72px;height:72px;border-radius:50%;background:${btnColor}18;border:2px solid ${btnColor}35;text-align:center;vertical-align:middle;font-size:32px;line-height:72px">${iconEmoji}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <!-- Title -->
              ${title ? `<tr>
                <td class="card-text card-pad" style="padding:24px 40px 0 40px;text-align:center">
                  <h1 style="margin:0;font-size:24px;font-weight:800;line-height:1.3;color:${brand.text};letter-spacing:-0.3px">${title}</h1>
                </td>
              </tr>` : ''}
              <!-- Greeting + intro combined -->
              <tr>
                <td class="card-sub card-pad" style="padding:16px 40px 0 40px;text-align:center;color:${brand.sub};font-size:15px;line-height:1.7">
                  Hi <strong style="color:${brand.text}">${username}</strong>,${intro ? `<br/><span style="color:${brand.sub}">${intro}</span>` : ''}
                </td>
              </tr>
              <!-- Extra content (username box, new email, etc.) -->
              ${extraHtml ? `<tr><td class="card-pad" style="padding:20px 40px 0 40px">${extraHtml}</td></tr>` : ''}
              <!-- CTA button -->
              <tr>
                <td class="card-pad" style="padding:28px 40px 0 40px;text-align:center">
                  <!--[if mso]>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeAction}" style="height:50px;v-text-anchor:middle;width:240px" arcsize="24%" fillcolor="${btnColor}" stroke="f">
                    <w:anchorlock/><center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold">${buttonLabel}</center>
                  </v:roundrect>
                  <![endif]-->
                  <!--[if !mso]><!-->
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto">
                    <tr>
                      <td style="border-radius:12px;background:linear-gradient(135deg,${btnColor},${brand.accent});background-color:${btnColor};box-shadow:0 4px 14px ${btnColor}40">
                        <a href="${safeAction}" target="_blank" style="display:inline-block;padding:16px 48px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;letter-spacing:0.3px;mso-padding-alt:0">${buttonLabel}</a>
                      </td>
                    </tr>
                  </table>
                  <!--<![endif]-->
                </td>
              </tr>
              <!-- Fallback URL -->
              <tr>
                <td class="card-muted card-pad" style="padding:20px 40px 0 40px;text-align:center">
                  <p style="margin:0;font-size:12px;color:${brand.muted};line-height:1.5">If the button doesn&rsquo;t work, copy and paste this link into your browser:</p>
                  <p style="margin:8px 0 0 0;word-break:break-all;font-size:12px;line-height:1.5"><a href="${safeAction}" style="color:${brand.accent};text-decoration:underline">${safeAction}</a></p>
                </td>
              </tr>
              <!-- Extra footer content (expiry notices, support links) -->
              ${footerHtml ? `<tr><td class="card-pad" style="padding:20px 40px 0 40px;text-align:center">${footerHtml}</td></tr>` : ''}
              <!-- Divider -->
              <tr>
                <td class="card-pad" style="padding:28px 40px 0 40px">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr><td style="border-top:1px solid ${brand.cardBorder};font-size:1px;line-height:1px">&nbsp;</td></tr>
                  </table>
                </td>
              </tr>
              <!-- Ignore notice -->
              <tr>
                <td class="card-muted card-pad" style="padding:20px 40px 32px 40px;text-align:center;font-size:12px;line-height:1.6;color:${brand.muted}">
                  If you didn&rsquo;t request this, you can safely ignore this email. No changes have been made to your account.
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:28px 24px 12px 24px">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width:560px;margin:0 auto">
              <tr>
                <td class="footer-text" style="text-align:center;color:${brand.muted};font-size:11px;line-height:1.7">
                  <p style="margin:0">&copy; ${year} Nine Dart Nation. All rights reserved.</p>
                  <p style="margin:8px 0 0 0;color:${brand.muted}">
                    This email was sent because of activity on your Nine Dart Nation account.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Bottom spacer -->
        <tr><td style="padding:0 0 32px 0">&nbsp;</td></tr>
      </table>
    </div>
  </body>
</html>`
  return { html }
}

function passwordReset({ username = 'Player', actionUrl = '#', title = 'Reset Your Password', intro = 'We received a request to reset the password for your account. Click the button below to create a new password. For your security, this link will expire in 30&nbsp;minutes.', buttonLabel = 'Reset Password', expiresMinutes = 30 } = {}) {
  const footerHtml = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 auto"><tr><td style="background:#1e293b;border-radius:10px;padding:12px 16px;text-align:center"><span style="font-size:13px;color:#94a3b8">&#128337; This link is valid for <strong style="color:#f1f5f9">${expiresMinutes} minutes</strong>. After that, you&rsquo;ll need to request a new one.</span></td></tr></table>`
  return renderBase({ preheader: 'Reset your Nine Dart Nation password', heading: 'Nine Dart Nation', title, intro, username, actionUrl, buttonLabel, footerHtml, iconEmoji: '&#128272;', accentColor: '#4f46e5' })
}

function passwordReminder({ username = 'Player', actionUrl = '#', title = 'Password Reset Reminder', intro = 'You recently requested a password reset link but haven&rsquo;t used it yet. If you still need to reset your password, click the button below. This link will expire in 30&nbsp;minutes.', buttonLabel = 'Reset Password', expiresMinutes = 30 } = {}) {
  const footerHtml = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 auto"><tr><td style="background:#1e293b;border-radius:10px;padding:12px 16px;text-align:center"><span style="font-size:13px;color:#94a3b8">&#9200; This link expires in <strong style="color:#f1f5f9">${expiresMinutes} minutes</strong>.</span></td></tr></table>`
  return renderBase({ preheader: 'Password reset reminder - Nine Dart Nation', heading: 'Nine Dart Nation', title, intro, username, actionUrl, buttonLabel, footerHtml, iconEmoji: '&#128273;', accentColor: '#6366f1' })
}

function usernameReminder({ username = 'Player', title = 'Your Username', intro = 'You requested a reminder of your Nine Dart Nation username. Your account details are shown below.', buttonLabel = 'Open Nine Dart Nation', actionUrl = '#' } = {}) {
  const extraHtml = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 auto"><tr><td style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:16px 20px;text-align:center"><p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#64748b;font-weight:700">Your Username</p><p style="margin:0;font-size:20px;font-weight:800;color:#f1f5f9;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Courier New',monospace;letter-spacing:0.5px">${username}</p></td></tr></table>`
  return renderBase({ preheader: 'Your username reminder - Nine Dart Nation', heading: 'Nine Dart Nation', title, intro, username, actionUrl, buttonLabel, extraHtml, iconEmoji: '&#128100;', accentColor: '#8b5cf6' })
}

function emailChangeConfirm({ username = 'Player', newEmail = 'player@example.com', actionUrl = '#', title = 'Confirm Your New Email', intro = 'You&rsquo;ve requested to change the email address associated with your Nine Dart Nation account. Please confirm your new email address by clicking the button below.', buttonLabel = 'Confirm Email Address' } = {}) {
  const extraHtml = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 auto"><tr><td style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:16px 20px;text-align:center"><p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#64748b;font-weight:700">New Email Address</p><p style="margin:0;font-size:16px;font-weight:700;color:#f1f5f9">${newEmail}</p></td></tr></table>`
  return renderBase({ preheader: 'Confirm your new email - Nine Dart Nation', heading: 'Nine Dart Nation', title, intro, username, actionUrl, buttonLabel, extraHtml, iconEmoji: '&#128231;', accentColor: '#0ea5e9' })
}

function passwordChangedNotice({ username = 'Player', supportUrl = '#', title = 'Password Changed Successfully', intro = 'Your Nine Dart Nation account password was changed successfully. If you made this change, no further action is required.' } = {}) {
  const safeSupportUrl = String(supportUrl || '#')
  const footerHtml = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 auto"><tr><td style="background:#450a0a;border:1px solid #7f1d1d;border-radius:10px;padding:14px 16px;text-align:center"><span style="font-size:13px;color:#fca5a5">&#9888;&#65039; <strong>Didn&rsquo;t make this change?</strong> Secure your account immediately and </span><a href="${safeSupportUrl}" style="color:#f87171;font-weight:700;text-decoration:underline;font-size:13px">contact support</a><span style="font-size:13px;color:#fca5a5">.</span></td></tr></table>`
  return renderBase({ preheader: 'Your password was changed - Nine Dart Nation', heading: 'Nine Dart Nation', title, intro, username, actionUrl: safeSupportUrl, buttonLabel: 'Contact Support', footerHtml, iconEmoji: '&#9989;', accentColor: '#10b981' })
}

module.exports = { passwordReset, passwordReminder, usernameReminder, emailChangeConfirm, passwordChangedNotice }
