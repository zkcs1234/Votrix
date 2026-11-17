import CompetitionCategoriesPage from '@/pages/organizer/competition/CompetitionCategoriesPage'
import { lazy } from 'react'
const NativeCompetitionResultsPage=lazy(()=>import('@/pages/public/NativeCompetitionResultsPage'))
import { Navigate, useLocation, useParams } from 'react-router-dom'
// AuthLayout is the only framer-motion consumer; lazy-loading it keeps that
// ~100 KB animation library out of the main bundle (loaded only on auth routes).
const AuthLayout = lazy(() => import('@/layouts/AuthLayout'))
import DashboardLayout from '@/layouts/DashboardLayout'
import ElectionLayout from '@/layouts/ElectionLayout'
import PageantLayout from '@/layouts/PageantLayout'
import PollingLayout from '@/layouts/PollingLayout'
import ReportsLayout from '@/layouts/ReportsLayout'
import ProtectedRoute from '@/routes/ProtectedRoute'
import GuestRoute from '@/routes/GuestRoute'
import LegacyUserManagementRedirect from '@/routes/LegacyUserManagementRedirect'
import { USER_ROLES } from '@/utils/constants'

const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const ChangePasswordPage = lazy(() => import('@/pages/auth/ChangePasswordPage'))
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage'))
const OrganizersPage = lazy(() => import('@/pages/admin/OrganizersPage'))
const ParticipantsPage = lazy(() => import('@/pages/admin/ParticipantsPage'))
const GlobalEventsPage = lazy(() => import('@/pages/admin/GlobalEventsPage'))
const SystemPage = lazy(() => import('@/pages/admin/SystemPage'))
const AuditLogsPage = lazy(() => import('@/pages/admin/AuditLogsPage'))
const OrganizerDetailPage = lazy(() => import('@/pages/admin/OrganizerDetailPage'))
const OrganizerApplyPage = lazy(() => import('@/pages/organizer/OrganizerApplyPage'))
const OrganizerOfficersPage = lazy(() => import('@/pages/organizer/OrganizerOfficersPage'))
const OrganizerDashboardPage = lazy(() => import('@/pages/organizer/OrganizerDashboardPage'))
const ParticipantOverviewPage = lazy(() => import('@/pages/participant/ParticipantOverviewPage'))
const ParticipantEventsPage = lazy(() => import('@/pages/participant/ParticipantEventsPage'))
const ParticipantHistoryPage = lazy(() => import('@/pages/participant/ParticipantHistoryPage'))
const ParticipantResultsPage = lazy(() => import('@/pages/participant/ParticipantResultsPage'))
const VoterEventPage = lazy(() => import('@/pages/voter/VoterEventPage'))

const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'))

const ElectionDashboardPage = lazy(
  () => import('@/pages/organizer/election/ElectionDashboardPage'),
)
const ElectionEventsPage = lazy(() => import('@/pages/organizer/election/ElectionEventsPage'))
const ElectionEventFormPage = lazy(
  () => import('@/pages/organizer/election/ElectionEventFormPage'),
)
const ElectionPositionsPage = lazy(
  () => import('@/pages/organizer/election/ElectionPositionsPage'),
)
const ElectionCandidatesPage = lazy(
  () => import('@/pages/organizer/election/ElectionCandidatesPage'),
)
const ElectionVotersPage = lazy(() => import('@/pages/organizer/election/ElectionVotersPage'))
const ElectionReviewPage = lazy(() => import('@/pages/organizer/election/ElectionReviewPage'))
const ElectionAnalyticsPage = lazy(
  () => import('@/pages/organizer/election/ElectionAnalyticsPage'),
)

const CompetitionDashboardPage = lazy(
  () => import('@/pages/organizer/competition/CompetitionDashboardPage'),
)
const CompetitionEventsPage = lazy(() => import('@/pages/organizer/competition/CompetitionEventsPage'))
const CompetitionEventFormPage = lazy(
  () => import('@/pages/organizer/competition/CompetitionEventFormPage'),
)
const CompetitionContestantsPage = lazy(
  () => import('@/pages/organizer/competition/CompetitionContestantsPage'),
)
const CompetitionJudgesPage = lazy(() => import('@/pages/organizer/competition/CompetitionJudgesPage'))
const CompetitionReviewPage = lazy(() => import('@/pages/organizer/competition/CompetitionReviewPage'))
const CompetitionRankingsPage = lazy(() => import('@/pages/organizer/competition/CompetitionRankingsPage'))
const CompetitionTabulationPage = lazy(() => import('@/pages/organizer/competition/CompetitionTabulationPage'))
const CompetitionWorkspacePage = lazy(
  () => import('@/pages/organizer/competition/CompetitionWorkspacePage'),
)
const CompetitionAnalyticsPage = lazy(
  () => import('@/pages/organizer/competition/CompetitionAnalyticsPage'),
)
const CompetitionLiveControlPage = lazy(
  () => import('@/pages/organizer/competition/CompetitionLiveControlPage'),
)
const CompetitionPublishedPage = lazy(
  () => import('@/pages/organizer/competition/CompetitionPublishedPage'),
)
const JudgeScoringPage = lazy(() => import('@/pages/voter/JudgeScoringPage'))

const PollingDashboardPage = lazy(
  () => import('@/pages/organizer/polling/PollingDashboardPage'),
)
const PollingEventsPage = lazy(() => import('@/pages/organizer/polling/PollingEventsPage'))
const PollingEventFormPage = lazy(() => import('@/pages/organizer/polling/PollingEventFormPage'))
const PollingBuilderPage = lazy(() => import('@/pages/organizer/polling/PollingBuilderPage'))
const PollingRespondentsPage = lazy(
  () => import('@/pages/organizer/polling/PollingRespondentsPage'),
)
const PollingReviewPage = lazy(() => import('@/pages/organizer/polling/PollingReviewPage'))
const PollingAnalyticsPage = lazy(() => import('@/pages/organizer/polling/PollingAnalyticsPage'))
const VoterPollPage = lazy(() => import('@/pages/voter/VoterPollPage'))

const ReportsOverviewPage = lazy(() => import('@/pages/organizer/reports/ReportsOverviewPage'))
const ElectionReportPage = lazy(() => import('@/pages/organizer/reports/ElectionReportPage'))
const CompetitionReportPage = lazy(() => import('@/pages/organizer/reports/CompetitionReportPage'))
const PollingReportPage = lazy(() => import('@/pages/organizer/reports/PollingReportPage'))

// The per-event report is now a stage inside each module (so it carries the
// stepper, stage footer and sidebar). Old standalone /organizer/reports/:module
// links redirect to the canonical in-module route.
function ReportRedirect({ module }) {
  const { eventId } = useParams()
  return <Navigate to={`/organizer/${module}/events/${eventId}/report`} replace />
}

function LegacyParticipantRedirect() {
  const location = useLocation()
  const path = location.pathname.replace(/^\/voter(?=\/|$)/, '/participant')
  return <Navigate to={`${path}${location.search}${location.hash}`} replace />
}

export const routeConfig = [
  {path:'/competition/events/:eventId/competitions/:competitionId/results',element:<NativeCompetitionResultsPage/>},
  // ROOT — Shows login for guests, redirects authenticated users to dashboard
  {
    path: '/',
    element: (
      <GuestRoute>
        <AuthLayout />
      </GuestRoute>
    ),
    children: [
      { index: true, element: <LoginPage /> },
    ],
  },
  // /login — alias for root (backward compatibility)
  {
    path: '/login',
    element: (
      <GuestRoute>
        <AuthLayout />
      </GuestRoute>
    ),
    children: [
      { index: true, element: <LoginPage /> },
    ],
  },
  {
    path: '/forgot-password',
    element: (
      <GuestRoute>
        <AuthLayout />
      </GuestRoute>
    ),
    children: [{ index: true, element: <ForgotPasswordPage /> }],
  },
  {
    path: '/reset-password',
    element: (
      <GuestRoute>
        <AuthLayout />
      </GuestRoute>
    ),
    children: [{ index: true, element: <ResetPasswordPage /> }],
  },
  {
    path: '/change-password',
    element: (
      <ProtectedRoute allowPasswordChange>
        <AuthLayout />
      </ProtectedRoute>
    ),
    children: [{ index: true, element: <ChangePasswordPage /> }],
  },
  // Public organizer application, opened from an admin's invitation link. The
  // token in the URL is the credential, so there is deliberately no GuestRoute
  // or ProtectedRoute here (anyone holding the link, signed in or not, can use it).
  {
    path: '/organizer/apply/:token',
    element: <AuthLayout size="lg" />,
    children: [{ index: true, element: <OrganizerApplyPage /> }],
  },

  {
    path: '/admin',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
        <DashboardLayout title="Admin" />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AdminDashboardPage /> },
      { path: 'organizers', element: <OrganizersPage /> },
      { path: 'organizers/:id', element: <OrganizerDetailPage /> },
      { path: 'participants', element: <ParticipantsPage /> },
      // Legacy single User Management page: map old URLs onto the two new pages.
      { path: 'users', element: <LegacyUserManagementRedirect /> },
      { path: 'events', element: <GlobalEventsPage /> },
      { path: 'settings', element: <SystemPage /> },
      { path: 'audit-logs', element: <AuditLogsPage /> },
      { path: 'email-delivery', element: <Navigate to="/admin/audit-logs?view=email" replace /> },
      // Health, alerts and the archival policy now live as tabs on System settings.
      { path: 'health', element: <Navigate to="/admin/settings?section=health" replace /> },
      { path: 'alerts', element: <Navigate to="/admin/settings?section=alerts" replace /> },
      { path: 'archival', element: <Navigate to="/admin/settings?section=archival" replace /> },
    ],
  },
    {
    path: '/organizer',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.ORGANIZER]}>
        <DashboardLayout title="Organizer" />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <OrganizerDashboardPage /> },
      // Owner-only; the page redirects an officer back to /organizer.
      { path: 'officers', element: <OrganizerOfficersPage /> },
    ],
  },
  {
    path: '/organizer/election',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.ORGANIZER]}>
        <ElectionLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <ElectionDashboardPage /> },
      { path: 'events', element: <ElectionEventsPage /> },
      { path: 'events/new', element: <ElectionEventFormPage /> },
      { path: 'events/:eventId/edit', element: <ElectionEventFormPage /> },
      { path: 'events/:eventId/branding', element: <ElectionEventFormPage /> },
      { path: 'events/:eventId/positions', element: <ElectionPositionsPage /> },
      { path: 'events/:eventId/candidates', element: <ElectionCandidatesPage /> },
      { path: 'events/:eventId/review', element: <ElectionReviewPage /> },
      { path: 'events/:eventId/voters', element: <ElectionVotersPage /> },
      { path: 'events/:eventId/analytics', element: <ElectionAnalyticsPage /> },
      { path: 'events/:eventId/report', element: <ElectionReportPage /> },
    ],
  },
  {
    path: '/organizer/competition',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.ORGANIZER]}>
        <PageantLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <CompetitionDashboardPage /> },
      { path: 'events', element: <CompetitionEventsPage /> },
      { path: 'events/new', element: <CompetitionEventFormPage /> },
      { path: 'events/:eventId/edit', element: <CompetitionEventFormPage /> },
      { path: 'events/:eventId/branding', element: <CompetitionEventFormPage /> },
      { path: 'events/:eventId/type', element: <CompetitionCategoriesPage typeOnly /> },
      { path: 'events/:eventId/categories', element: <CompetitionCategoriesPage /> },
      { path: 'events/:eventId/workspace', element: <CompetitionWorkspacePage /> },
      { path: 'events/:eventId/contestants', element: <CompetitionContestantsPage /> },
      { path: 'events/:eventId/judges', element: <CompetitionJudgesPage /> },
      { path: 'events/:eventId/review', element: <CompetitionReviewPage /> },
      { path: 'events/:eventId/published', element: <CompetitionPublishedPage /> },
      { path: 'events/:eventId/rankings', element: <CompetitionRankingsPage /> },
      { path: 'events/:eventId/tabulation', element: <CompetitionTabulationPage /> },
      { path: 'events/:eventId/tabulation/:section', element: <CompetitionTabulationPage /> },
      { path: 'events/:eventId/scoring', element: <CompetitionTabulationPage workspace="scoring" /> },
      { path: 'events/:eventId/results', element: <CompetitionTabulationPage workspace="results" /> },
      { path: 'events/:eventId/adjustments', element: <CompetitionTabulationPage workspace="adjustments" /> },
      { path: 'events/:eventId/advancement', element: <CompetitionTabulationPage workspace="advancement" /> },
      { path: 'events/:eventId/audit', element: <CompetitionTabulationPage workspace="audit" /> },
{ path: 'events/:eventId/analytics', element: <CompetitionAnalyticsPage /> },
      { path: 'events/:eventId/report', element: <CompetitionReportPage /> },
      { path: 'events/:eventId/live', element: <CompetitionLiveControlPage /> },
    ],
  },
  {
    path: '/organizer/polling',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.ORGANIZER]}>
        <PollingLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <PollingDashboardPage /> },
      { path: 'events', element: <PollingEventsPage /> },
      { path: 'events/new', element: <PollingEventFormPage /> },
      { path: 'events/:eventId/edit', element: <PollingEventFormPage /> },
      { path: 'events/:eventId/branding', element: <PollingEventFormPage /> },
      { path: 'events/:eventId/settings', element: <PollingEventFormPage /> },
      { path: 'events/:eventId/builder', element: <PollingBuilderPage /> },
      { path: 'events/:eventId/review', element: <PollingReviewPage /> },
      { path: 'events/:eventId/respondents', element: <PollingRespondentsPage /> },
      { path: 'events/:eventId/analytics', element: <PollingAnalyticsPage /> },
      { path: 'events/:eventId/report', element: <PollingReportPage /> },
    ],
  },
  {
    path: '/organizer/reports',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.ORGANIZER]}>
        <ReportsLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <ReportsOverviewPage /> },
      { path: 'election/:eventId', element: <ReportRedirect module="election" /> },
      { path: 'competition/:eventId', element: <ReportRedirect module="competition" /> },
      { path: 'polling/:eventId', element: <ReportRedirect module="polling" /> },
    ],
  },
  {
    path: '/participant',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.PARTICIPANT]}>
        <DashboardLayout title="Participant" />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <ParticipantOverviewPage /> },
      { path: 'my-events', element: <ParticipantEventsPage /> },
      { path: 'history', element: <ParticipantHistoryPage /> },
      { path: 'results', element: <ParticipantResultsPage /> },
    ],
  },
  // Task pages keep the sidebar as a collapsed rail so the ballot, poll or
  // scoresheet gets the full width.
  {
    path: '/participant/events/:eventId',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.PARTICIPANT]}>
        <DashboardLayout title="Vote" moduleLabel="Election" railOnly />
      </ProtectedRoute>
    ),
    children: [{ index: true, element: <VoterEventPage /> }],
  },
  {
    path: '/participant/polling/events/:eventId',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.PARTICIPANT]}>
        <DashboardLayout title="Poll" moduleLabel="Polling" railOnly />
      </ProtectedRoute>
    ),
    children: [{ index: true, element: <VoterPollPage /> }],
  },
  {
    path: '/participant/competition/events/:eventId/score',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.PARTICIPANT]}>
        <DashboardLayout title="Judge scoring" moduleLabel="Competition Scoring" railOnly />
      </ProtectedRoute>
    ),
    children: [{ index: true, element: <JudgeScoringPage /> }],
  },
  { path: '/voter/*', element: <LegacyParticipantRedirect /> },
  // Catch-all 404
  {
    path: '*',
    element: <NotFoundPage />,
  },
]
