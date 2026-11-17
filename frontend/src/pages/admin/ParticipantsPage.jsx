import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GraduationCap, Trophy } from 'lucide-react'
import StudentsPanel from '@/components/admin/StudentsPanel'
import JudgesPanel from '@/components/admin/JudgesPanel'
import Tabs from '@/components/ui/Tabs'

// Students (voter + respondent) and Judges.
const PARTICIPANT_CATEGORIES = [
  { id: 'students', label: 'Students', icon: GraduationCap },
  { id: 'judges', label: 'Judges', icon: Trophy },
]

export default function ParticipantsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedCategory = searchParams.get('category')
  const initialCategory = PARTICIPANT_CATEGORIES.some((cat) => cat.id === requestedCategory)
    ? requestedCategory
    : PARTICIPANT_CATEGORIES[0].id

  const [category, setCategory] = useState(initialCategory)

  const selectCategory = (nextCategory) => {
    setCategory(nextCategory)
    setSearchParams({ category: nextCategory })
  }

  return (
    <div
      data-module={category === 'judges' ? 'competition-scoring' : 'election'}
      className="space-y-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="v-section-title">Participant Category</h2>
          <p className="v-caption mt-1">
            Students automatically participate in elections and polls. Judges score competitions only.
          </p>
        </div>
        <Tabs
          tabs={PARTICIPANT_CATEGORIES.map((cat) => ({
            value: cat.id,
            label: cat.label,
            icon: cat.icon,
          }))}
          value={category}
          onChange={selectCategory}
          label="Participant category"
          variant="segmented"
          className="w-full sm:w-auto"
        />
      </div>

      {category === 'students' && <StudentsPanel key="students" />}
      {category === 'judges' && <JudgesPanel key="judges" />}
    </div>
  )
}
