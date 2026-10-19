import {render,screen,within} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {expect,test} from 'vitest'
import VoterEventCard from './VoterEventCard'

test('renders one native event card with direct links for each category and round',()=>{
 const event={
  id:'event-1',
  title:'MR & MS BISU CALAPE 2026',
  eventType:'competition_scoring',
  participantType:'COMPETITION_JUDGE',
  bucket:'assigned',
  statusLabel:'Waiting to open',
  nativeContexts:[
   {competitionId:'hip-hop',competitionName:'Hip-Hop',roundId:'final',roundName:'Final',statusLabel:'Waiting to open'},
   {competitionId:'street-dance',competitionName:'Street Dance',roundId:'final-2',roundName:'Final',statusLabel:'Waiting to open'},
  ],
 }
 render(<MemoryRouter><VoterEventCard event={event}/></MemoryRouter>)
 expect(screen.getByRole('heading',{name:event.title})).toBeInTheDocument()
 expect(screen.getByRole('status')).toHaveTextContent('Waiting to open')
 expect(screen.getByRole('status').querySelector('svg')).toHaveAttribute('aria-hidden','true')
 const nav=screen.getByRole('navigation',{name:`Categories for ${event.title}`})
 expect(within(nav).getByRole('link',{name:'Hip-Hop (Final)'})).toHaveAttribute('href','/participant/competition/events/event-1/score?competitionId=hip-hop&roundId=final')
 expect(within(nav).getByRole('link',{name:'Street Dance (Final)'})).toHaveAttribute('href','/participant/competition/events/event-1/score?competitionId=street-dance&roundId=final-2')
 expect(within(nav).queryByText('Waiting to open')).not.toBeInTheDocument()
})
