import { emailLayout, escapeHtml, buttonHtml } from './layout.js'

export function organizerOnboardingTemplate({ email, loginUrl }) {
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#fff;">Complete your organization profile</h1>
    <p style="margin:0 0 16px;">
      Your VOTRIX organizer account is active. Before you can manage elections, competitions, or polls,
      you need to complete your organization profile.
    </p>
    <p style="margin:0 0 16px;background:#0f172a;border-radius:10px;padding:12px 16px;border:1px solid #334155;">
      Sign in to your account and you will be guided through setting up your profile. You'll need to provide:
    </p>
    <ul style="margin:0 0 20px;padding-left:20px;color:#cbd5e1;">
      <li style="margin-bottom:4px;">Organization name</li>
      <li style="margin-bottom:4px;">Organization type</li>
      <li style="margin-bottom:4px;">Your name</li>
      <li style="margin-bottom:4px;">Your position</li>
    </ul>
    ${buttonHtml(loginUrl, 'Sign in to VOTRIX')}
    <p style="margin:16px 0 0;font-size:13px;color:#94a3b8;">
      Login link: <a href="${escapeHtml(loginUrl)}" style="color:#818cf8;">${escapeHtml(loginUrl)}</a>
    </p>
  `

  return emailLayout({
    title: 'Complete Your VOTRIX Profile',
    preheader: 'Set up your organization profile to get started',
    bodyHtml,
  })
}

