/**
 * Draft validator — sanitizes the Save Draft payload before persistence.
 * `payload` is opaque JSON (form values, info-form schema, selections), so it
 * is passed through as-is rather than strict-validated per module.
 */
export function validateDraft(body) {
  const safeBody = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const step = typeof safeBody.step === 'string' && safeBody.step.trim() ? safeBody.step.trim() : 'details'
  const title = typeof safeBody.title === 'string' ? safeBody.title.trim().slice(0, 255) : null
  const banner = typeof safeBody.banner === 'string' ? safeBody.banner : null
  const payload = safeBody.payload && typeof safeBody.payload === 'object' && !Array.isArray(safeBody.payload)
    ? safeBody.payload
    : {}
  return { step, title, banner, payload }
}
