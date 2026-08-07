import { describe, expect, it } from 'vitest'
import { validateDraft } from '../../src/validators/draft.validator.js'

describe('draft validator', () => {
  it('returns safe defaults when the request body is missing or invalid', () => {
    expect(validateDraft(null)).toEqual({
      step: 'details',
      title: null,
      banner: null,
      payload: {},
    })
  })

  it('sanitizes an incoming draft payload', () => {
    const result = validateDraft({
      step: ' branding ',
      title: '  My Draft  ',
      banner: 'https://cdn.example.com/banner.png',
      payload: { title: 'Nested title', values: { foo: 'bar' } },
    })

    expect(result).toEqual({
      step: 'branding',
      title: 'My Draft',
      banner: 'https://cdn.example.com/banner.png',
      payload: { title: 'Nested title', values: { foo: 'bar' } },
    })
  })
})
