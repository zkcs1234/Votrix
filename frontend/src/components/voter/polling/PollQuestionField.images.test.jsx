import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import PollQuestionField from './PollQuestionField'

const options = [
  { id: 'a', label: 'Red', imageUrl: 'https://cdn/red.png' },
  { id: 'b', label: 'Blue', imageUrl: null },
]
const question = (input, extra = {}) => ({
  id: 'q1', question: 'Pick', required: false, options, typeConfig: {},
  type: 't', typeDef: { key: 't', label: 'T', ui: { input }, answerFormat: { kind: 'choice' } }, ...extra,
})
const noop = () => {}

describe('PollQuestionField images', () => {
  it('shows the question image', () => {
    render(<PollQuestionField question={question('radio', { imageUrl: 'https://cdn/q.png' })} index={0} value={undefined} onChange={noop} />)
    expect(screen.getByAltText('Image for question: Pick')).toHaveAttribute('src', 'https://cdn/q.png')
  })

  it.each([
    ['radio', undefined],
    ['checkbox', []],
    ['ranking', {}],
  ])('shows an option image for a %s question', (input, value) => {
    render(<PollQuestionField question={question(input)} index={0} value={value} onChange={noop} />)
    expect(document.querySelectorAll('img[src="https://cdn/red.png"]')).toHaveLength(1)
  })
})
