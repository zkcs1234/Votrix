import { describe, test, expect } from 'vitest'
import {
  validateAnswer,
  serializeAnswer,
  validateTypeConfig,
  buildAutoOptions,
  buildAnalytics,
  mapTypeRow,
} from '../../src/modules/poll-question-types.js'

// Fixtures — these mirror the rows seeded by migration 017_*. Keeping them
// here as JS objects avoids hitting the database in unit tests.
const TYPE_FIXTURES = {
  single_choice: mapTypeRow({
    key: 'single_choice',
    label: 'Single Choice',
    description: '',
    answer_format: { kind: 'choice', cardinality: 'one', value: 'option_id' },
    config_schema: {},
    ui: { input: 'radio' },
    sort_order: 10,
  }),
  checkbox: mapTypeRow({
    key: 'checkbox',
    label: 'Multiple Selection',
    description: '',
    answer_format: { kind: 'choice', cardinality: 'many', value: 'option_ids' },
    config_schema: {},
    ui: { input: 'checkbox' },
    sort_order: 30,
  }),
  yes_no: mapTypeRow({
    key: 'yes_no',
    label: 'Yes / No',
    description: '',
    answer_format: { kind: 'choice', cardinality: 'one', value: 'option_id', autoOptions: ['Yes', 'No'] },
    config_schema: {},
    ui: { input: 'radio', autoOptions: true },
    sort_order: 40,
  }),
  rating: mapTypeRow({
    key: 'rating',
    label: 'Rating Scale',
    description: '',
    answer_format: { kind: 'numeric', min: 1, max: 5, step: 1 },
    config_schema: {
      min: { type: 'integer', minimum: 0, maximum: 10 },
      max: { type: 'integer', minimum: 1, maximum: 10 },
      step: { type: 'number', enum: [0.5, 1] },
    },
    ui: { input: 'rating' },
    sort_order: 50,
  }),
  likert: mapTypeRow({
    key: 'likert_scale',
    label: 'Likert',
    description: '',
    answer_format: { kind: 'choice', cardinality: 'one', value: 'option_id', autoOptionsFromConfig: true },
    config_schema: {},
    ui: { input: 'likert' },
    sort_order: 60,
  }),
  open_text: mapTypeRow({
    key: 'open_text',
    label: 'Open Text',
    description: '',
    answer_format: { kind: 'text', maxLength: 4000 },
    config_schema: {},
    ui: { input: 'textarea' },
    sort_order: 70,
  }),
  ranking: mapTypeRow({
    key: 'ranking',
    label: 'Ranking',
    description: '',
    answer_format: { kind: 'ranking', value: 'ranking_map', tiePolicy: 'allow' },
    config_schema: {},
    ui: { input: 'ranking' },
    sort_order: 80,
  }),
}

const OPTS = [
  { id: 'a', label: 'A', sort_order: 0 },
  { id: 'b', label: 'B', sort_order: 1 },
  { id: 'c', label: 'C', sort_order: 2 },
]

describe('validateTypeConfig', () => {
  test('clamps integers to schema range', () => {
    const def = TYPE_FIXTURES.rating
    // rating schema's `max` is 10 — values above 10 are rejected
    expect(() => validateTypeConfig(def, { max: 200 })).toThrow(/<= 10/)
    // valid values pass
    const out = validateTypeConfig(def, { min: 1, max: 5, step: 1 })
    expect(out).toMatchObject({ min: 1, max: 5, step: 1 })
  })

  test('keeps arrays of strings', () => {
    const def = TYPE_FIXTURES.single_choice
    const out = validateTypeConfig(def, { options: ['a', 'b'] })
    expect(Array.isArray(out.options)).toBe(true)
  })
})

describe('buildAutoOptions', () => {
  test('Yes/No: returns Yes/No pair', () => {
    const opts = buildAutoOptions(TYPE_FIXTURES.yes_no, {})
    expect(opts.map((o) => o.label)).toEqual(['Yes', 'No'])
  })

  test('Likert 5-point default', () => {
    const opts = buildAutoOptions(TYPE_FIXTURES.likert, {})
    expect(opts).toHaveLength(5)
    expect(opts[0].label).toBe('Strongly disagree')
    expect(opts[4].label).toBe('Strongly agree')
  })

  test('Likert 7-point', () => {
    const opts = buildAutoOptions(TYPE_FIXTURES.likert, { points: 7 })
    expect(opts).toHaveLength(7)
  })

  test('Likert 3-point', () => {
    const opts = buildAutoOptions(TYPE_FIXTURES.likert, { points: 3 })
    expect(opts).toHaveLength(3)
  })
})

describe('validateAnswer', () => {
  test('single_choice accepts a valid id', () => {
    const v = validateAnswer(TYPE_FIXTURES.single_choice, {}, OPTS, 'a', { required: true })
    expect(v).toBe('a')
  })

  test('single_choice rejects an unknown id', () => {
    expect(() =>
      validateAnswer(TYPE_FIXTURES.single_choice, {}, OPTS, 'z', { required: true }),
    ).toThrow(/Invalid option/)
  })

  test('checkbox accepts an array of valid ids', () => {
    const v = validateAnswer(TYPE_FIXTURES.checkbox, {}, OPTS, ['a', 'b'], { required: true })
    expect(v).toEqual(['a', 'b'])
  })

  test('checkbox rejects unknown id', () => {
    expect(() =>
      validateAnswer(TYPE_FIXTURES.checkbox, {}, OPTS, ['a', 'z'], { required: true }),
    ).toThrow(/Invalid option/)
  })

  test('checkbox respects minSelected/maxSelected from typeConfig', () => {
    expect(() =>
      validateAnswer(TYPE_FIXTURES.checkbox, { minSelected: 2 }, OPTS, ['a'], { required: true }),
    ).toThrow(/at least 2/)
    expect(() =>
      validateAnswer(TYPE_FIXTURES.checkbox, { maxSelected: 1 }, OPTS, ['a', 'b'], { required: true }),
    ).toThrow(/at most 1/)
  })

  test('rating accepts 1..5 and rejects 0', () => {
    expect(validateAnswer(TYPE_FIXTURES.rating, {}, OPTS, 3, { required: true })).toBe(3)
    expect(() => validateAnswer(TYPE_FIXTURES.rating, {}, OPTS, 6, { required: true })).toThrow(/between/)
  })

  test('rating typeConfig widens the range', () => {
    const v = validateAnswer(TYPE_FIXTURES.rating, { min: 0, max: 10 }, OPTS, 7, { required: true })
    expect(v).toBe(7)
    expect(() =>
      validateAnswer(TYPE_FIXTURES.rating, { min: 0, max: 10 }, OPTS, 11, { required: true }),
    ).toThrow(/between/)
  })

  test('rating rejects non-integer step', () => {
    expect(() =>
      validateAnswer(TYPE_FIXTURES.rating, { min: 1, max: 5, step: 1 }, OPTS, 2.5, { required: true }),
    ).toThrow(/Step/)
  })

  test('open_text accepts and rejects too-long input', () => {
    const v = validateAnswer(TYPE_FIXTURES.open_text, {}, OPTS, 'hello', { required: true })
    expect(v).toBe('hello')
    expect(() =>
      validateAnswer(
        TYPE_FIXTURES.open_text,
        { maxLength: 3 },
        OPTS,
        'too long',
        { required: true },
      ),
    ).toThrow(/too long/)
  })

  test('ranking requires every option and 1-based ranks', () => {
    const v = validateAnswer(
      TYPE_FIXTURES.ranking,
      {},
      OPTS,
      { a: 1, b: 2, c: 3 },
      { required: true },
    )
    expect(v).toEqual({ a: 1, b: 2, c: 3 })
  })

  test('ranking allows ties by default', () => {
    const v = validateAnswer(
      TYPE_FIXTURES.ranking,
      {},
      OPTS,
      { a: 1, b: 1, c: 2 },
      { required: true },
    )
    expect(v.c).toBe(2)
  })

  test('ranking rejects ties when allowTies=false', () => {
    expect(() =>
      validateAnswer(
        TYPE_FIXTURES.ranking,
        { allowTies: false },
        OPTS,
        { a: 1, b: 1, c: 2 },
        { required: true },
      ),
    ).toThrow(/Ties/)
  })

  test('ranking rejects missing options', () => {
    expect(() =>
      validateAnswer(
        TYPE_FIXTURES.ranking,
        {},
        OPTS,
        { a: 1, b: 2 },
        { required: true },
      ),
    ).toThrow(/Every option/)
  })

  test('empty answer is null when not required, throws when required', () => {
    expect(validateAnswer(TYPE_FIXTURES.open_text, {}, OPTS, '', { required: false })).toBeNull()
    expect(() =>
      validateAnswer(TYPE_FIXTURES.open_text, {}, OPTS, '', { required: true }),
    ).toThrow(/required/)
  })
})

describe('serializeAnswer', () => {
  test('serializes objects as JSON', () => {
    expect(serializeAnswer({ a: 1, b: 2 })).toBe('{"a":1,"b":2}')
  })
  test('serializes strings as themselves', () => {
    expect(serializeAnswer('a')).toBe('a')
  })
  test('null stays null', () => {
    expect(serializeAnswer(null)).toBeNull()
  })
})

describe('buildAnalytics', () => {
  test('choice: counts per option, percentages', () => {
    const answers = [
      { answer: 'a' },
      { answer: 'a' },
      { answer: 'b' },
    ]
    const stats = buildAnalytics({
      question: {},
      answers,
      options: OPTS,
      typeDef: TYPE_FIXTURES.single_choice,
      typeConfig: {},
      anonymous: true,
    })
    expect(stats.kind).toBe('choice')
    expect(stats.options[0]).toMatchObject({ optionId: 'a', count: 2, percentage: 66.67 })
    expect(stats.options[1]).toMatchObject({ optionId: 'b', count: 1, percentage: 33.33 })
  })

  test('numeric: distribution + average', () => {
    const answers = [{ answer: '3' }, { answer: '5' }, { answer: '5' }]
    const stats = buildAnalytics({
      question: {},
      answers,
      options: [],
      typeDef: TYPE_FIXTURES.rating,
      typeConfig: {},
      anonymous: true,
    })
    expect(stats.kind).toBe('numeric')
    expect(stats.average).toBe(4.33)
    expect(stats.distribution.find((d) => d.value === 5).count).toBe(2)
  })

  test('ranking: average rank per option', () => {
    const answers = [
      { answer: JSON.stringify({ a: 1, b: 2, c: 3 }) },
      { answer: JSON.stringify({ a: 2, b: 1, c: 3 }) },
    ]
    const stats = buildAnalytics({
      question: {},
      answers,
      options: OPTS,
      typeDef: TYPE_FIXTURES.ranking,
      typeConfig: {},
      anonymous: true,
    })
    expect(stats.kind).toBe('ranking')
    const aRow = stats.options.find((o) => o.optionId === 'a')
    expect(aRow.averageRank).toBe(1.5)
  })

  test('text: returns samples', () => {
    const answers = [{ answer: 'great', voter_id: 'v1' }]
    const stats = buildAnalytics({
      question: {},
      answers,
      options: [],
      typeDef: TYPE_FIXTURES.open_text,
      typeConfig: {},
      anonymous: true,
    })
    expect(stats.kind).toBe('text')
    expect(stats.responses[0].respondent).toBeNull()
  })

  test('text: includes respondent when not anonymous', () => {
    const answers = [{ answer: 'great', voter_id: 'v1' }]
    const stats = buildAnalytics({
      question: {},
      answers,
      options: [],
      typeDef: TYPE_FIXTURES.open_text,
      typeConfig: {},
      anonymous: false,
    })
    expect(stats.responses[0].respondent).toBe('v1')
  })
})
