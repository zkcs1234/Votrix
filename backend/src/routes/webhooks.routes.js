import { Router } from 'express'
import { Webhook } from 'svix'
import { env } from '../config/env.js'
import { updateEmailAuditStatus } from '../services/emailAudit.service.js'

const router = Router()

function verifyResendSignature(rawBody, headers) {
  const secret = env.resend.webhookSecret
  if (!secret) {
    return env.nodeEnv !== 'production'
  }

  try {
    return Boolean(new Webhook(secret).verify(rawBody, headers))
  } catch {
    return false
  }
}

router.post('/resend', async (req, res) => {
  try {
    const rawBody = req.body
    const bodyText = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : JSON.stringify(rawBody || {})

    const webhookHeaders = {
      id: req.headers['svix-id'],
      timestamp: req.headers['svix-timestamp'],
      signature: req.headers['svix-signature'],
    }

    if (!verifyResendSignature(bodyText, webhookHeaders)) {
      return res.status(401).json({ success: false, message: 'Invalid Resend webhook signature' })
    }

    let payload = null
    try {
      payload = JSON.parse(bodyText)
    } catch {
      payload = rawBody
    }

    const eventType = payload?.type || payload?.event || payload?.data?.type || 'unknown'
    const messageId = payload?.data?.email_id || payload?.data?.id || null
    const providerStatus = {
      'email.sent': 'sent',
      'email.delivered': 'delivered',
      'email.delivery_delayed': 'delivery_delayed',
      'email.bounced': 'bounced',
      'email.complained': 'complained',
      'email.opened': 'opened',
      'email.clicked': 'clicked',
    }[eventType]

    if (providerStatus && messageId) {
      await updateEmailAuditStatus({
        providerStatus,
        lookupProviderMessageId: messageId,
      })
    }

    return res.status(200).json({ success: true, received: true, eventType })
  } catch (error) {
    console.error('[webhook] resend handler failed:', error.message)
    return res.status(500).json({ success: false, message: 'Webhook processing failed' })
  }
})

export default router
