import {render,screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {expect,test} from 'vitest'
import JudgeScoringHeader from './JudgeScoringHeader'

test('shows the event title, dashboard button, and judge workspace subtitle',()=>{
 const sheet={event:{title:'Configured competition'},roundName:'Configured Final',criteria:[{id:'quality',open:true}],contestants:[{id:'a',lockedCriteria:['quality'],open:true},{id:'b',lockedCriteria:[],open:true}]}
 render(<MemoryRouter><JudgeScoringHeader sheet={sheet} judgeName="Enrolled Judge" sessionState={{status:'active'}}/></MemoryRouter>)
 expect(screen.getByRole('heading',{name:'Configured competition'})).toBeInTheDocument()
 expect(screen.getByRole('link',{name:'Back to dashboard'})).toHaveAttribute('href','/participant')
 expect(screen.getByText('Judge workspace · Your scores are private until submitted.')).toBeInTheDocument()
})
