import { describe, expect, test } from 'vitest'
import { officerAssignedTemplate } from '../../src/templates/email/officerAssigned.js'
import { organizerApplicationDeclinedTemplate } from '../../src/templates/email/organizerApplicationDeclined.js'
import { organizerInviteLinkTemplate } from '../../src/templates/email/organizerInviteLink.js'

// Everything below is user- or admin-supplied text that ends up in an HTML email.
const PAYLOAD = '<script>alert("x")</script><img src=x onerror=alert(1)>'

function expectEscaped(html) {
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('<img src=x')
  expect(html).toContain('&lt;script&gt;')
}

describe('officerAssignedTemplate', () => {
  test('names the organization and position and links to the workspace', () => {
    const html = officerAssignedTemplate({
      studentName: 'Ada Lovelace',
      organizationName: 'Computing Society',
      position: 'President',
      workspaceUrl: 'https://votrix.test/organizer',
    })
    expect(html).toContain('Hello Ada Lovelace,')
    expect(html).toContain('Computing Society')
    expect(html).toContain('President')
    expect(html).toContain('href="https://votrix.test/organizer"')
    expect(html).toMatch(/recorded under your name/i)
  })

  test('escapes the student name, organization and position', () => {
    expectEscaped(officerAssignedTemplate({ studentName: PAYLOAD, organizationName: PAYLOAD, position: PAYLOAD, workspaceUrl: 'https://x.test' }))
  })

  test('copes with missing optional names', () => {
    const html = officerAssignedTemplate({ studentName: null, organizationName: null, position: 'Aide', workspaceUrl: 'https://x.test' })
    expect(html).toContain('Hello,')
    expect(html).toContain('an organization')
  })
})

describe('organizerInviteLinkTemplate', () => {
  test('contains the one-time link and expiry', () => {
    const html = organizerInviteLinkTemplate({ applyUrl: 'https://votrix.test/organizer/apply/abc', expiresAt: '2030-01-01T00:00:00.000Z', note: 'Welcome' })
    expect(html).toContain('https://votrix.test/organizer/apply/abc')
    expect(html).toContain('Welcome')
    expect(html).toMatch(/expires/i)
  })

  test('escapes the admin’s note and the URL', () => {
    expectEscaped(organizerInviteLinkTemplate({ applyUrl: 'https://x.test/?a=<script>alert("x")</script>', expiresAt: null, note: PAYLOAD }))
  })

  test('works without a note', () => {
    expect(organizerInviteLinkTemplate({ applyUrl: 'https://x.test', expiresAt: null, note: null })).not.toContain('border-left')
  })
})

describe('organizerApplicationDeclinedTemplate', () => {
  test('shows the reason to the applicant', () => {
    const html = organizerApplicationDeclinedTemplate({ organizerName: 'Ada', reason: 'Certificates unreadable' })
    expect(html).toContain('Hello Ada,')
    expect(html).toContain('Certificates unreadable')
  })

  test('escapes the applicant name and the admin’s reason', () => {
    expectEscaped(organizerApplicationDeclinedTemplate({ organizerName: PAYLOAD, reason: PAYLOAD }))
  })
})
