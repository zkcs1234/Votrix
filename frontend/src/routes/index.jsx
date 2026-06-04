/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react'
import MainLayout from '@/layouts/MainLayout'
import AuthLayout from '@/layouts/AuthLayout'
import DashboardLayout from '@/layouts/DashboardLayout'
import ElectionLayout from '@/layouts/ElectionLayout'
import PageantLayout from '@/layouts/PageantLayout'
import PollingLayout from '@/layouts/PollingLayout'
import ReportsLayout from '@/layouts/ReportsLayout'
import ProtectedRoute from '@/routes/ProtectedRoute'
import GuestRoute from '@/routes/GuestRoute'
import { USER_ROLES } from '@/utils/constants'

const HomePage = lazy(() => import('@/pages/HomePage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const AdminLoginPage = lazy(() => import('@/pages/auth/AdminLoginPage'))
const OrganizerLoginPage = lazy(() => import('@/pages/auth/OrganizerLoginPage'))
const VoterLoginPage = lazy(() => import('@/pages/auth/VoterLoginPage'))
const ChangePasswordPage = lazy(() => import('@/pages/auth/ChangePasswordPage'))
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage'))
const OrganizerManagementPage = lazy(() => import('@/pages/admin/OrganizerManagementPage'))
const GlobalEventsPage = lazy(() => import('@/pages/admin/GlobalEventsPage'))
const SystemSettingsPage = lazy(() => import('@/pages/admin/SystemSettingsPage'))
const AuditLogsPage = lazy(() => import('@/pages/admin/AuditLogsPage'))
const OrganizerDashboardPage = lazy(() => import('@/pages/organizer/OrganizerDashboardPage'))
const VoterDashboardPage = lazy(() => import('@/pages/voter/VoterDashboardPage'))
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
const ElectionAnalyticsPage = lazy(
  () => import('@/pages/organizer/election/ElectionAnalyticsPage'),
)

const PageantDashboardPage = lazy(
  () => import('@/pages/organizer/pageant/PageantDashboardPage'),
)
const PageantEventsPage = lazy(() => import('@/pages/organizer/pageant/PageantEventsPage'))
const PageantEventFormPage = lazy(() => import('@/pages/organizer/pageant/PageantEventFormPage'))
const PageantContestantsPage = lazy(
  () => import('@/pages/organizer/pageant/PageantContestantsPage'),
)
const PageantCriteriaPage = lazy(() => import('@/pages/organizer/pageant/PageantCriteriaPage'))
const PageantJudgesPage = lazy(() => import('@/pages/organizer/pageant/PageantJudgesPage'))
const PageantRankingsPage = lazy(() => import('@/pages/organizer/pageant/PageantRankingsPage'))
const CompetitionWorkspacePage = lazy(
  () => import('@/pages/organizer/pageant/CompetitionWorkspacePage'),
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
const PollingAnalyticsPage = lazy(() => import('@/pages/organizer/polling/PollingAnalyticsPage'))
const VoterPollPage = lazy(() => import('@/pages/voter/VoterPollPage'))

const ReportsOverviewPage = lazy(() => import('@/pages/organizer/reports/ReportsOverviewPage'))
const ElectionReportPage = lazy(() => import('@/pages/organizer/reports/ElectionReportPage'))
const PageantReportPage = lazy(() => import('@/pages/organizer/reports/PageantReportPage'))
const PollingReportPage = lazy(() => import('@/pages/organizer/reports/PollingReportPage'))

export const routeConfig = [
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/login',
    element: (
      <GuestRoute>
        <AuthLayout />
      </GuestRoute>
    ),
    children: [
      { path: 'admin', element: <AdminLoginPage /> },
      { path: 'organizer', element: <OrganizerLoginPage /> },
      { path: 'voter', element: <VoterLoginPage /> },
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

  {
    path: '/admin',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
        <DashboardLayout title="Admin" />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AdminDashboardPage /> },
      { path: 'organizers', element: <OrganizerManagementPage /> },
      { path: 'events', element: <GlobalEventsPage /> },
      { path: 'settings', element: <SystemSettingsPage /> },
      { path: 'audit-logs', element: <AuditLogsPage /> },
    ],
  },
  {
    path: '/organizer',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.ORGANIZER]}>
        <DashboardLayout title="Organizer" />
      </ProtectedRoute>
    ),
    children: [{ index: true, element: <OrganizerDashboardPage /> }],
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
      { path: 'events/:eventId/positions', element: <ElectionPositionsPage /> },
      { path: 'events/:eventId/candidates', element: <ElectionCandidatesPage /> },
      { path: 'events/:eventId/voters', element: <ElectionVotersPage /> },
      { path: 'events/:eventId/analytics', element: <ElectionAnalyticsPage /> },
    ],
  },
  {
    path: '/organizer/pageant',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.ORGANIZER]}>
        <PageantLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <PageantDashboardPage /> },
      { path: 'events', element: <PageantEventsPage /> },
      { path: 'events/new', element: <PageantEventFormPage /> },
      { path: 'events/:eventId/edit', element: <PageantEventFormPage /> },
      { path: 'events/:eventId/contestants', element: <PageantContestantsPage /> },
      { path: 'events/:eventId/criteria', element: <PageantCriteriaPage /> },
      { path: 'events/:eventId/judges', element: <PageantJudgesPage /> },
      { path: 'events/:eventId/rankings', element: <PageantRankingsPage /> },
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
      { index: true, element: <PageantDashboardPage /> },
      { path: 'events', element: <PageantEventsPage /> },
      { path: 'events/new', element: <PageantEventFormPage /> },
      { path: 'events/:eventId/edit', element: <PageantEventFormPage /> },
      { path: 'events/:eventId/workspace', element: <CompetitionWorkspacePage /> },
      { path: 'events/:eventId/contestants', element: <PageantContestantsPage /> },
      { path: 'events/:eventId/criteria', element: <PageantCriteriaPage /> },
      { path: 'events/:eventId/judges', element: <PageantJudgesPage /> },
      { path: 'events/:eventId/rankings', element: <PageantRankingsPage /> },
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
      { path: 'events/:eventId/settings', element: <PollingEventFormPage /> },
      { path: 'events/:eventId/builder', element: <PollingBuilderPage /> },
      { path: 'events/:eventId/respondents', element: <PollingRespondentsPage /> },
      { path: 'events/:eventId/analytics', element: <PollingAnalyticsPage /> },
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
      { path: 'election/:eventId', element: <ElectionReportPage /> },
      { path: 'pageant/:eventId', element: <PageantReportPage /> },
      { path: 'competition/:eventId', element: <PageantReportPage /> },
      { path: 'polling/:eventId', element: <PollingReportPage /> },
    ],
  },
  {
    path: '/voter',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.VOTER]}>
        <DashboardLayout title="Voter" />
      </ProtectedRoute>
    ),
    children: [{ index: true, element: <VoterDashboardPage /> }],
  },
  {
    path: '/voter/events/:eventId',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.VOTER]}>
        <DashboardLayout title="Vote" />
      </ProtectedRoute>
    ),
    children: [{ index: true, element: <VoterEventPage /> }],
  },
  {
    path: '/voter/polling/events/:eventId',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.VOTER]}>
        <DashboardLayout title="Poll" />
      </ProtectedRoute>
    ),
    children: [{ index: true, element: <VoterPollPage /> }],
  },
  {
    path: '/voter/pageant/events/:eventId/score',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.VOTER]}>
        <DashboardLayout title="Judge scoring" />
      </ProtectedRoute>
    ),
    children: [{ index: true, element: <JudgeScoringPage /> }],
  },
  {
    path: '/voter/competition/events/:eventId/score',
    element: (
      <ProtectedRoute allowedRoles={[USER_ROLES.VOTER]}>
        <DashboardLayout title="Judge scoring" />
      </ProtectedRoute>
    ),
    children: [{ index: true, element: <JudgeScoringPage /> }],
  },
]
