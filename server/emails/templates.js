export function passwordReset({ username = 'Player', actionUrl = '#', title = 'Reset your password', intro = 'Click the button below to reset your password.', buttonLabel = 'Reset Password' } = {}) {
  const html = `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif;">
    <h2>${title}</h2>
    <p>Hi ${username},</p>
    <p>${intro}</p>
    <p><a href="${actionUrl}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;">${buttonLabel}</a></p>
  </body></html>`
  return { html }
}

export function passwordReminder({ username = 'Player', actionUrl = '#', title = 'Password reminder', intro = 'Use the link below to reset your password.', buttonLabel = 'Reset Password' } = {}) {
  const html = `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif;">
    <h2>${title}</h2>
    <p>Hi ${username},</p>
    <p>${intro}</p>
    <p><a href="${actionUrl}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;">${buttonLabel}</a></p>
  </body></html>`
  return { html }
}

export function emailChangeConfirm({ username = 'Player', newEmail = 'player@example.com', actionUrl = '#', title = 'Confirm your new email', intro = 'Click to confirm your new email address.', buttonLabel = 'Confirm Email' } = {}) {
  const html = `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif;">
    <h2>${title}</h2>
    <p>Hi ${username},</p>
    <p>${intro}</p>
    <p>New email: <strong>${newEmail}</strong></p>
    <p><a href="${actionUrl}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;">${buttonLabel}</a></p>
  </body></html>`
  return { html }
}

export function passwordChangedNotice({ username = 'Player', supportUrl = '#', title = 'Your password was changed', intro = 'If this wasn\'t you, contact support immediately.' } = {}) {
  const html = `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif;">
    <h2>${title}</h2>
    <p>Hi ${username},</p>
    <p>${intro}</p>
    <p>Support: <a href="${supportUrl}">${supportUrl}</a></p>
  </body></html>`
  return { html }
}
