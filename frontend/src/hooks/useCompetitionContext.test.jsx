import { expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import useCompetitionContext from './useCompetitionContext'

const choices = [
  { competitionId: 'pageant', roundId: 'preliminary' },
  { competitionId: 'pageant', roundId: 'final' },
  { competitionId: 'dance', roundId: null },
]
function Workspace({ syncUrl = true }) {
  const { selected, setSelected } = useCompetitionContext(choices, null, syncUrl)
  const location = useLocation()
  const navigate = useNavigate()
  return <>
    <select aria-label="Context" value={selected} onChange={event => setSelected(event.target.value)}>
      <option value="pageant:preliminary">Preliminary</option>
      <option value="pageant:final">Final</option>
      <option value="dance:single">Dance</option>
    </select>
    <button onClick={() => navigate('?competitionId=pageant&roundId=final')}>Incoming round link</button>
    <output aria-label="URL">{location.search}{location.hash}</output>
  </>
}

test('selection survives a refresh URL and incoming links update an already mounted workspace', async () => {
  render(<MemoryRouter initialEntries={['/live?competitionId=pageant&roundId=final']}><Workspace /></MemoryRouter>)
  expect(screen.getByLabelText('Context')).toHaveValue('pageant:final')
  fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'dance:single' } })
  await waitFor(() => expect(screen.getByLabelText('URL')).toHaveTextContent('?competitionId=dance'))
  expect(screen.getByLabelText('URL')).not.toHaveTextContent('roundId')
  fireEvent.click(screen.getByRole('button', { name: 'Incoming round link' }))
  expect(screen.getByLabelText('Context')).toHaveValue('pageant:final')
})

test('an organizer default selection is available to sidebar links and reviewer selection stays local', async () => {
  const first = render(<MemoryRouter><Workspace /></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText('URL')).toHaveTextContent('?competitionId=pageant&roundId=preliminary'))
  first.unmount()
  render(<MemoryRouter><Workspace syncUrl={false} /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Context'), { target: { value: 'dance:single' } })
  expect(screen.getByLabelText('Context')).toHaveValue('dance:single')
  expect(screen.getByLabelText('URL')).toBeEmptyDOMElement()
})


test('normalizing and changing context preserve the continuous page section anchor',async()=>{
 render(<MemoryRouter initialEntries={['/scoring#tabulation-matrix']}><Workspace/></MemoryRouter>)
 await waitFor(()=>expect(screen.getByLabelText('URL')).toHaveTextContent('?competitionId=pageant&roundId=preliminary#tabulation-matrix'))
 fireEvent.change(screen.getByLabelText('Context'),{target:{value:'dance:single'}})
 expect(screen.getByLabelText('URL')).toHaveTextContent('?competitionId=dance#tabulation-matrix')
})
