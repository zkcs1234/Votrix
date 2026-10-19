import { useParams } from 'react-router-dom'
import CompetitionTabulationWorkspace from '@/components/organizer/competition/CompetitionTabulationWorkspace'
import {NativeTabulationBoundary} from '@/components/organizer/competition/NativeTabulationWorkspace'
export default function CompetitionTabulationPage(){const{eventId,section='overview'}=useParams();return <NativeTabulationBoundary eventId={eventId} initialSection={section} Legacy={CompetitionTabulationWorkspace}/>}
