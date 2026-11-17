import { Navigate, useLocation } from 'react-router-dom'

// User Management used to be one page at /admin/users with an Organizers tab and
// a Participants tab. It is now two pages (/admin/organizers and
// /admin/participants); this maps every old URL, including the older `type=` and
// `tab=<participant type>` forms, onto the right new page so bookmarks and
// emailed links keep working.

const LEGACY_CATEGORY = {
  'election-voter': 'students',
  'polling-respondent': 'students',
  'competition-judge': 'judges',
  voters: 'students',
  respondents: 'students',
  judges: 'judges',
  students: 'students',
}

const CATEGORIES = ['students', 'judges']
const ORGANIZER_SECTIONS = ['invitations', 'applications']

export function resolveUserManagementRedirect(search = '') {
  const params = new URLSearchParams(search)
  const tab = params.get('tab')
  const legacyCategory = LEGACY_CATEGORY[params.get('type')] ?? LEGACY_CATEGORY[tab]

  if (tab === 'participants' || legacyCategory) {
    const requested = params.get('category')
    const category = CATEGORIES.includes(requested) ? requested : legacyCategory
    return category ? `/admin/participants?category=${category}` : '/admin/participants'
  }

  const section = params.get('section')
  return ORGANIZER_SECTIONS.includes(section) ? `/admin/organizers?section=${section}` : '/admin/organizers'
}

export default function LegacyUserManagementRedirect() {
  const { search } = useLocation()
  return <Navigate to={resolveUserManagementRedirect(search)} replace />
}
