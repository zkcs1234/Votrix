import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../src/foundation/db.js', () => ({ db: vi.fn() }))
vi.mock('../../src/foundation/activity.js', () => ({ recordEventActivity: vi.fn() }))
vi.mock('../../src/services/event.service.js', () => ({
  assertOrganizerOwnsEvent: vi.fn(async () => ({ id: 'poll-1', event_type: 'polling', status: 'draft' })),
  getEventById: vi.fn(),
}))
vi.mock('../../src/services/organization.service.js', () => ({
  getOrCreatePollingOrganization: vi.fn(async () => ({ id: 'org-1' })),
  mapOrganization: vi.fn(),
}))
vi.mock('../../src/services/polling-registry.service.js', () => ({
  loadQuestionTypeRegistry: vi.fn(async () => []),
  findQuestionType: vi.fn(),
  requireQuestionType: vi.fn(async () => ({
    key: 'single_choice',
    answerFormat: { kind: 'choice', cardinality: 'one' },
    ui: { input: 'radio', optionEditor: 'options' },
    configSchema: {},
  })),
  listCustomTypes: vi.fn(),
  createCustomType: vi.fn(),
  updateCustomType: vi.fn(),
  deleteCustomType: vi.fn(),
}))
vi.mock('../../src/services/imageAsset.service.js', () => ({ removeReferenceAndDeleteIfUnused: vi.fn(async () => {}) }))

import { db } from '../../src/foundation/db.js'
import { removeReferenceAndDeleteIfUnused } from '../../src/services/imageAsset.service.js'
import { createQuestion, updateQuestion } from '../../src/services/polling.service.js'

// A chainable fake: every builder method returns the same object; terminal calls resolve.
function makeTable(rows) {
  const calls = { insert: [], update: [], delete: 0 }
  const q = {}
  for (const m of ['select', 'eq', 'in', 'order', 'neq', 'not', 'range']) q[m] = vi.fn(() => q)
  q.insert = vi.fn((payload) => { calls.insert.push(payload); return q })
  q.update = vi.fn((payload) => { calls.update.push(payload); return q })
  q.delete = vi.fn(() => { calls.delete += 1; return q })
  q.single = vi.fn(async () => ({ data: rows.single, error: null }))
  q.maybeSingle = vi.fn(async () => ({ data: rows.maybeSingle ?? null, error: null }))
  q.then = (resolve) => resolve({ data: rows.list ?? [], error: null })
  q.calls = calls
  return q
}

describe('poll question images', () => {
  let questions
  let options
  beforeEach(() => {
    vi.clearAllMocks()
    questions = makeTable({ single: { id: 'q1', event_id: 'poll-1', type: 'single_choice', question: 'Pick', type_config: {} }, maybeSingle: { image_asset_id: 'old-asset' } })
    options = makeTable({ list: [] })
    db.mockReturnValue({
      from: vi.fn((table) => (table === 'poll_questions' ? questions : table === 'poll_options' ? options : makeTable({ list: [] }))),
    })
  })

  test('creating a question stores the image asset id the validator sends as imageAssetId', async () => {
    await createQuestion('poll-1', 'org-user', {
      question: 'Pick',
      type: 'single_choice',
      typeConfig: {},
      imageUrl: 'https://cdn/q.png',
      imageAssetId: 'asset-q',
      options: [
        { label: 'Red', imageUrl: 'https://cdn/red.png', imageAssetId: 'asset-red' },
        { label: 'Blue', imageUrl: null, imageAssetId: null },
      ],
    })
    expect(questions.calls.insert[0]).toMatchObject({ image_url: 'https://cdn/q.png', image_asset_id: 'asset-q' })
    expect(options.calls.insert[0][0]).toMatchObject({ label: 'Red', image_url: 'https://cdn/red.png', image_asset_id: 'asset-red' })
  })

  test('replacing a question image stores the new asset and releases the old one', async () => {
    await updateQuestion('poll-1', 'org-user', 'q1', { imageUrl: 'https://cdn/new.png', imageAssetId: 'new-asset' })
    expect(questions.calls.update[0]).toMatchObject({ image_url: 'https://cdn/new.png', image_asset_id: 'new-asset' })
    expect(removeReferenceAndDeleteIfUnused).toHaveBeenCalledWith('old-asset')
  })

  test('a partial update (such as reordering) leaves the image alone', async () => {
    await updateQuestion('poll-1', 'org-user', 'q1', { sortOrder: 3 })
    expect(questions.calls.update[0]).toEqual({ sort_order: 3 })
    expect(removeReferenceAndDeleteIfUnused).not.toHaveBeenCalled()
  })
})
