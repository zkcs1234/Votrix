import {render,screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {expect,test} from 'vitest'
import JudgeScoringHeader from './JudgeScoringHeader'

test('heading and progress read actual round/criterion locks without inventing totals or a round submission',()=>{
 const sheet={event:{title:'Configured competition'},roundName:'Configured Final',criteria:[{id:'quality',open:true}],contestants:[{id:'a',lockedCriteria:['quality'],open:true},{id:'b',lockedCriteria:[],open:true}]}
 render(<MemoryRouter><JudgeScoringHeader sheet={sheet} judgeName="Enrolled Judge" sessionState={{status:'active'}}/></MemoryRouter>)
 expect(screen.getByRole('heading',{name:'Judge Scoring'})).toBeInTheDocument()
 expect(screen.getByText('Configured Final')).toBeInTheDocument();expect(screen.getByText('Configured competition')).toBeInTheDocument()
 expect(screen.getByText('1 / 2')).toBeInTheDocument();expect(screen.getByText('Scoring Open')).toBeInTheDocument()
})
test('closed or submitted scoring is presented using current state',()=>{
 render(<MemoryRouter><JudgeScoringHeader sheet={{submission:{id:'submitted'},criteria:[{id:'c',open:true}],contestants:[{hasSubmitted:true,open:true}]}} sessionState={{status:'active'}}/></MemoryRouter>)
 expect(screen.getByText('Scoring Closed')).toBeInTheDocument();expect(screen.getByText('1 / 1')).toBeInTheDocument()
})
