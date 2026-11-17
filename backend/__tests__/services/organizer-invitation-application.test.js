import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeSupabase } from '../helpers/fake-supabase.js'

let fake

vi.mock('../../src/config/database.js', () => ({ getSupabase: () => fake.client }))

vi.mock('../../src/services/mailer.service.js', () => ({
  sendOrganizerInviteLinkEmail: vi.fn(),
  sendOrganizerApplicationDeclinedEmail: vi.fn(),
}))

vi.mock('../../src/services/program.service.js', () => ({
  listActivePrograms: vi.fn(),
}))

vi.mock('../../src/services/certificate-storage.service.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    uploadCertificate: vi.fn(),
    deleteCertificates: vi.fn(),
    getCertificateAccessUrl: vi.fn(),
  }
})

vi.mock('../../src/services/admin-organizer.service.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, createOrganizerAccount: vi.fn() }
})

import {
  sendOrganizerApplicationDeclinedEmail,
  sendOrganizerInviteLinkEmail,
} from '../../src/services/mailer.service.js'
import { listActivePrograms } from '../../src/services/program.service.js'
import {
  deleteCertificates,
  getCertificateAccessUrl,
  uploadCertificate,
} from '../../src/services/certificate-storage.service.js'
import { createOrganizerAccount } from '../../src/services/admin-organizer.service.js'
import {
  claimInvitation,
  createInvitation,
  getUsableInvitationByToken,
  listInvitations,
  resendInvitation,
  revokeInvitation,
} from '../../src/services/organizer-invitation.service.js'
import {
  approveApplication,
  declineApplication,
  getApplication,
  getApplicationFormContext,
  listApplications,
  submitApplication,
} from '../../src/services/organizer-application.service.js'
import { hashToken } from '../../src/utils/crypto.js'

const ADMIN = '00000000-0000-4000-8000-0000000000aa'
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64)])
const goodFile = (name = 'cert.pdf') => ({ buffer: PDF, originalname: name, mimetype: 'application/pdf' })
const goodBody = {
  organizerName: 'Ada Lovelace',
  position: 'President',
  organizationName: 'Computing Society',
  organizationType: 'Co-curricular',
  scopeType: 'scoped',
  programs: ['BSCS'],
}

const tokenOf = (applyUrl) => decodeURIComponent(applyUrl.split('/').pop())
const hoursFromNow = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString()

async function rejection(promise) {
  try {
    await promise
  } catch (err) {
    return err
  }
  throw new Error('expected the promise to reject')
}

async function invite(email = 'ada@example.com') {
  const result = await createInvitation({ email }, ADMIN)
  return { ...result, token: tokenOf(result.applyUrl) }
}

beforeEach(() => {
  fake = createFakeSupabase({
    users: [],
    organizer_invitations: [],
    organizer_applications: [],
    audit_logs: [],
  })
  vi.mocked(sendOrganizerInviteLinkEmail).mockReset().mockResolvedValue({ sent: true })
  vi.mocked(sendOrganizerApplicationDeclinedEmail).mockReset().mockResolvedValue({ sent: true })
  vi.mocked(listActivePrograms).mockReset().mockResolvedValue(['BSCS', 'BSIT'])
  vi.mocked(uploadCertificate).mockReset().mockImplementation(async (f, { keyPrefix }) => ({
    publicId: `${keyPrefix}-${f.name}`,
    resourceType: 'image',
    format: 'pdf',
    name: f.name,
    mime: f.mime,
    size: f.size,
  }))
  vi.mocked(deleteCertificates).mockReset().mockResolvedValue(undefined)
  vi.mocked(getCertificateAccessUrl).mockReset().mockImplementation((ref) => `https://signed.example/${ref.publicId}`)
  vi.mocked(createOrganizerAccount).mockReset().mockImplementation(async (input) => ({
    user: { id: 'organizer-1', email: input.email },
    email: { sent: true },
  }))
})

describe('invitations (admin)', () => {
  test('stores only a hash of the token and returns the link once', async () => {
    const { invitation, applyUrl, token } = await invite()

    expect(token).toMatch(/^[a-f0-9]{64}$/)
    const [row] = fake.rows('organizer_invitations')
    expect(row.token_hash).toBe(hashToken(token))
    expect(JSON.stringify(row)).not.toContain(token)
    expect(invitation).not.toHaveProperty('token_hash')
    expect(applyUrl).toContain(`/organizer/apply/${token}`)
    expect(sendOrganizerInviteLinkEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ada@example.com', token }),
    )
  })

  test('refuses an email that already has an account', async () => {
    fake.raw('users').push({ id: 'u1', email: 'ada@example.com', role: 'participant' })
    const err = await rejection(createInvitation({ email: 'Ada@Example.com' }, ADMIN))
    expect(err.statusCode).toBe(409)
    expect(fake.rows('organizer_invitations')).toHaveLength(0)
  })

  test('a new invitation revokes the still-pending one for the same email', async () => {
    const first = await invite()
    const second = await invite()

    const rows = fake.rows('organizer_invitations')
    expect(rows.find((r) => r.id === first.invitation.id).status).toBe('revoked')
    expect(rows.find((r) => r.id === second.invitation.id).status).toBe('pending')
    await expect(getUsableInvitationByToken(first.token)).rejects.toMatchObject({ statusCode: 410 })
    await expect(getUsableInvitationByToken(second.token)).resolves.toBeTruthy()
  })

  test('reports expiry as a derived status and filters by it', async () => {
    await invite('live@example.com')
    fake.raw('organizer_invitations').push({
      id: 'old-1', email: 'old@example.com', token_hash: 'x', status: 'pending',
      expires_at: hoursFromNow(-1), created_at: new Date().toISOString(),
    })

    const all = await listInvitations()
    expect(all.invitations.find((i) => i.email === 'old@example.com').status).toBe('expired')
    expect((await listInvitations({ status: 'expired' })).invitations.map((i) => i.email)).toEqual(['old@example.com'])
    expect((await listInvitations({ status: 'pending' })).invitations.map((i) => i.email)).toEqual(['live@example.com'])
    expect((await rejection(listInvitations({ status: 'bogus' }))).statusCode).toBe(400)
  })

  test('revoke works once, then conflicts; unknown id is 404', async () => {
    const { invitation, token } = await invite()
    await revokeInvitation(invitation.id, ADMIN)
    await expect(getUsableInvitationByToken(token)).rejects.toMatchObject({ statusCode: 410 })
    expect((await rejection(revokeInvitation(invitation.id, ADMIN))).statusCode).toBe(409)
    expect((await rejection(revokeInvitation('00000000-0000-4000-8000-00000000ffff', ADMIN))).statusCode).toBe(404)
  })

  test('resend issues a fresh working link and kills the old one', async () => {
    const first = await invite()
    const second = await resendInvitation(first.invitation.id, ADMIN)
    const secondToken = tokenOf(second.applyUrl)

    expect(secondToken).not.toBe(first.token)
    await expect(getUsableInvitationByToken(first.token)).rejects.toMatchObject({ statusCode: 410 })
    await expect(getUsableInvitationByToken(secondToken)).resolves.toBeTruthy()
  })

  test('a used invitation cannot be resent', async () => {
    const { invitation, token } = await invite()
    await submitApplication(token, goodBody, [goodFile()])
    expect((await rejection(resendInvitation(invitation.id, ADMIN))).statusCode).toBe(409)
  })
})

describe('invitation links (public)', () => {
  test('every unusable link gives the same 410 and message', async () => {
    const { token: usedToken } = await invite('used@example.com')
    await submitApplication(usedToken, goodBody, [goodFile()])

    const { token: revokedToken, invitation } = await invite('revoked@example.com')
    await revokeInvitation(invitation.id, ADMIN)

    const expiredToken = 'e'.repeat(64)
    fake.raw('organizer_invitations').push({
      id: 'exp-1', email: 'exp@example.com', token_hash: hashToken(expiredToken), status: 'pending',
      expires_at: hoursFromNow(-2), created_at: new Date().toISOString(),
    })

    const errors = await Promise.all(
      [usedToken, revokedToken, expiredToken, 'f'.repeat(64), 'not-a-token', '', undefined].map((t) =>
        rejection(getUsableInvitationByToken(t)),
      ),
    )
    for (const err of errors) expect(err.statusCode).toBe(410)
    expect(new Set(errors.map((e) => e.message)).size).toBe(1)
  })

  test('the form context carries the bound email, options and programs only', async () => {
    const { token } = await invite()
    const ctx = await getApplicationFormContext(token)

    expect(ctx.email).toBe('ada@example.com')
    expect(ctx.organizationTypes).toEqual(['Co-curricular', 'Extra-curricular'])
    expect(ctx.programs).toEqual(['BSCS', 'BSIT'])
    expect(JSON.stringify(ctx)).not.toMatch(/token_hash|created_by/)
  })

  test('only one of two concurrent claims wins', async () => {
    const { invitation } = await invite()
    const [a, b] = await Promise.allSettled([claimInvitation(invitation.id), claimInvitation(invitation.id)])
    expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected'])
  })
})

describe('submitApplication', () => {
  test('creates a pending application bound to the invitation email', async () => {
    const { token, invitation } = await invite()
    const result = await submitApplication(
      token,
      { ...goodBody, email: 'attacker@evil.test' }, // a supplied email must be ignored
      [goodFile('a.pdf'), goodFile('b.pdf')],
    )

    const [app] = fake.rows('organizer_applications')
    expect(result.applicationId).toBe(app.id)
    expect(app).toMatchObject({
      invitation_id: invitation.id,
      email: 'ada@example.com',
      organizer_name: 'Ada Lovelace',
      organization_type_display: 'Co-curricular',
      requested_scope: { scopeType: 'scoped', programs: ['BSCS'] },
      status: 'pending',
    })
    expect(app.certificates.map((c) => c.name)).toEqual(['a.pdf', 'b.pdf'])
    expect(fake.rows('organizer_invitations')[0].status).toBe('used')
    expect(fake.rows('users')).toHaveLength(0) // nothing is created until approval
  })

  test('the link works exactly once', async () => {
    const { token } = await invite()
    await submitApplication(token, goodBody, [goodFile()])
    expect((await rejection(submitApplication(token, goodBody, [goodFile()]))).statusCode).toBe(410)
    expect(fake.rows('organizer_applications')).toHaveLength(1)
  })

  test('invalid fields fail before anything is claimed or uploaded', async () => {
    const { token } = await invite()
    const err = await rejection(submitApplication(token, { ...goodBody, organizationType: 'Club', programs: ['NOPE'] }, [goodFile()]))

    expect(err.statusCode).toBe(400)
    expect(err.details.errors.length).toBeGreaterThanOrEqual(2)
    expect(fake.rows('organizer_invitations')[0].status).toBe('pending')
    expect(uploadCertificate).not.toHaveBeenCalled()
  })

  test('requires a real certificate file', async () => {
    const { token } = await invite()
    expect((await rejection(submitApplication(token, goodBody, []))).statusCode).toBe(400)
    const disguised = { buffer: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(40)]), originalname: 'x.pdf', mimetype: 'application/pdf' }
    expect((await rejection(submitApplication(token, goodBody, [disguised]))).statusCode).toBe(400)
    expect(fake.rows('organizer_invitations')[0].status).toBe('pending')
  })

  test('a failed upload rolls back: uploaded files removed, link usable again', async () => {
    const { token } = await invite()
    vi.mocked(uploadCertificate)
      .mockReset()
      .mockResolvedValueOnce({ publicId: 'first', resourceType: 'image', format: 'pdf', name: 'a.pdf', mime: 'application/pdf', size: 1 })
      .mockRejectedValueOnce(new Error('storage down'))

    const err = await rejection(submitApplication(token, goodBody, [goodFile('a.pdf'), goodFile('b.pdf')]))

    expect(err.message).toBe('storage down')
    expect(deleteCertificates).toHaveBeenCalledWith([expect.objectContaining({ publicId: 'first' })])
    expect(fake.rows('organizer_invitations')[0].status).toBe('pending')
    expect(fake.rows('organizer_applications')).toHaveLength(0)
    await expect(getUsableInvitationByToken(token)).resolves.toBeTruthy()
  })

  test('a failed insert rolls back the same way', async () => {
    const { token } = await invite()
    fake.failNext('organizer_applications', 'insert', 'insert failed')

    const err = await rejection(submitApplication(token, goodBody, [goodFile()]))

    expect(err.statusCode).toBe(500)
    expect(deleteCertificates).toHaveBeenCalledTimes(1)
    expect(fake.rows('organizer_invitations')[0].status).toBe('pending')
  })
})

describe('review (admin)', () => {
  async function pendingApplication() {
    const { token } = await invite()
    const { applicationId } = await submitApplication(token, goodBody, [goodFile()])
    return applicationId
  }

  test('list filters by status and rejects an unknown one', async () => {
    const id = await pendingApplication()
    expect((await listApplications({ status: 'pending' })).applications.map((a) => a.id)).toEqual([id])
    expect((await listApplications({ status: 'approved' })).applications).toEqual([])
    expect((await rejection(listApplications({ status: 'bogus' }))).statusCode).toBe(400)
  })

  test('detail exposes signed certificate links and never the storage reference', async () => {
    const id = await pendingApplication()
    const { application } = await getApplication(id)

    expect(application.certificates).toEqual([
      expect.objectContaining({ name: 'cert.pdf', url: expect.stringMatching(/^https:\/\/signed\.example\//) }),
    ])
    expect(JSON.stringify(application)).not.toContain('publicId')
    expect((await rejection(getApplication('00000000-0000-4000-8000-00000000ffff'))).statusCode).toBe(404)
  })

  test('approve creates the organizer through createOrganizerAccount and links it', async () => {
    const id = await pendingApplication()
    const result = await approveApplication(id, ADMIN)

    expect(createOrganizerAccount).toHaveBeenCalledTimes(1)
    expect(createOrganizerAccount).toHaveBeenCalledWith({
      email: 'ada@example.com',
      organizerName: 'Ada Lovelace',
      position: 'President',
      organizationName: 'Computing Society',
      organizationType: 'Co-curricular',
      scopeType: 'scoped',
      programs: ['BSCS'],
    })
    const [app] = fake.rows('organizer_applications')
    expect(app).toMatchObject({ status: 'approved', reviewed_by: ADMIN, organizer_user_id: 'organizer-1' })
    expect(result.user.id).toBe('organizer-1')
  })

  test('the admin can correct fields and scope at approval', async () => {
    const id = await pendingApplication()
    await approveApplication(id, ADMIN, {
      position: 'Adviser',
      organizationType: 'Student Organization',
      scopeType: 'all',
    })

    expect(createOrganizerAccount).toHaveBeenCalledWith(
      expect.objectContaining({ position: 'Adviser', organizationType: 'Student Organization', scopeType: 'all' }),
    )
  })

  test('a bad correction fails before the application is claimed', async () => {
    const id = await pendingApplication()
    const err = await rejection(approveApplication(id, ADMIN, { programs: ['NOPE'] }))

    expect(err.statusCode).toBe(400)
    expect(createOrganizerAccount).not.toHaveBeenCalled()
    expect(fake.rows('organizer_applications')[0].status).toBe('pending')
  })

  test('if account creation fails the application returns to pending', async () => {
    const id = await pendingApplication()
    vi.mocked(createOrganizerAccount).mockRejectedValueOnce(Object.assign(new Error('An account with this email already exists'), { statusCode: 409 }))

    const err = await rejection(approveApplication(id, ADMIN))

    expect(err.statusCode).toBe(409)
    expect(fake.rows('organizer_applications')[0]).toMatchObject({ status: 'pending', reviewed_by: null, reviewed_at: null })
    // ...and a retry works.
    await expect(approveApplication(id, ADMIN)).resolves.toBeTruthy()
  })

  test('two admins approving at once create exactly one organizer', async () => {
    const id = await pendingApplication()
    const [a, b] = await Promise.allSettled([approveApplication(id, ADMIN), approveApplication(id, 'other-admin')])

    expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected'])
    expect(createOrganizerAccount).toHaveBeenCalledTimes(1)
  })

  test('an already-reviewed application cannot be approved again', async () => {
    const id = await pendingApplication()
    await approveApplication(id, ADMIN)
    expect((await rejection(approveApplication(id, ADMIN))).statusCode).toBe(409)
  })

  test('decline requires a reason, records it and emails the applicant', async () => {
    const id = await pendingApplication()
    expect((await rejection(declineApplication(id, ADMIN, '  '))).statusCode).toBe(400)
    expect(fake.rows('organizer_applications')[0].status).toBe('pending')

    const result = await declineApplication(id, ADMIN, 'Certificates are unreadable')

    expect(fake.rows('organizer_applications')[0]).toMatchObject({
      status: 'declined',
      decline_reason: 'Certificates are unreadable',
      reviewed_by: ADMIN,
    })
    expect(sendOrganizerApplicationDeclinedEmail).toHaveBeenCalledWith({
      email: 'ada@example.com',
      organizerName: 'Ada Lovelace',
      reason: 'Certificates are unreadable',
    })
    expect(result.application.status).toBe('declined')
    expect(createOrganizerAccount).not.toHaveBeenCalled()
  })

  test('decline conflicts once reviewed and 404s for an unknown id', async () => {
    const id = await pendingApplication()
    await declineApplication(id, ADMIN, 'No')
    expect((await rejection(declineApplication(id, ADMIN, 'Again'))).statusCode).toBe(409)
    expect((await rejection(declineApplication('00000000-0000-4000-8000-00000000ffff', ADMIN, 'x'))).statusCode).toBe(404)
  })

  test('writes an audit row for each step', async () => {
    const id = await pendingApplication()
    await approveApplication(id, ADMIN)
    const actions = fake.rows('audit_logs').map((r) => r.action)
    expect(actions).toEqual(
      expect.arrayContaining([
        'organizer.invitation.create',
        'organizer.application.submit',
        'organizer.application.approve',
      ]),
    )
  })
})
