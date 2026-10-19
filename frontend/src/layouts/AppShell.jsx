import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, Bell, LogOut, ChevronLeft, ChevronDown, PanelLeftClose, PanelLeftOpen, Lock, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { authService } from '@/services/auth.service'
import { notificationsService } from '@/services/notifications.service'
import VotrixLogo from '@/components/brand/VotrixLogo'
import NotificationsModal from '@/components/ui/NotificationsModal'
import GlobalSearch from '@/components/ui/GlobalSearch'
import ProfileCard from '@/components/organizer/ProfileCard'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import { StatusBadge } from '@/components/ui/Badge'
import { useEventContextStore } from '@/store/eventContext.store'

// Human-readable labels for the account chip. Shown instead of the raw username
// or email, which can be long — the role is short and tells the user which
// account they're signed in as.
const ROLE_LABELS = {
  admin: 'Administrator',
  organizer: 'Organizer',
  voter: 'Voter',
  participant: 'Participant',
}

// One label/value row in the account dropdown's participant-profile section.
// Renders nothing when the value is empty so blank fields don't clutter it.
function ProfileRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-v-text-subtle">{label}</dt>
      <dd className="text-xs font-medium text-v-text text-right truncate">{value}</dd>
    </div>
  )
}

// Figma responsive contract: >=1280 expanded 256px sidebar, 768-1279 compact
// 72px rail, <768 off-canvas drawer. Below this width the sidebar auto-collapses
// to the rail; at or above it, the user's saved preference applies. Matches
// Tailwind's `xl` breakpoint (the drawer takes over below `md`).
const AUTO_COLLAPSE_BELOW = 1280
const SIDEBAR_COLLAPSED_KEY = 'votrix.sidebar.collapsed'

// Wide, terminal event views where content room matters more than the workflow
// nav, so the sidebar auto-collapses on them. Setup pages (positions, voters,
// contestants, judges…) are intentionally excluded — their nav is the point.
const FOCUS_SUBPAGES = new Set(['analytics', 'live', 'rankings'])

function isFocusPath(pathname) {
  const segment = (pathname ?? '').split('/').filter(Boolean).pop()
  return FOCUS_SUBPAGES.has(segment)
}

function readCollapsedPref() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

function NavLinks({ items, eventId, location, onNavigate, isCollapsed }) {
  const [expandedItem, setExpandedItem] = useState(() =>
    items.find((item) =>
      item.children?.some((child) => location.pathname.endsWith(`/${child.path}`)),
    )?.label ?? '',
  )

  useEffect(() => {
    const activeParent = items.find((item) =>
      item.children?.some((child) => location.pathname.endsWith(`/${child.path}`)),
    )
    if (activeParent) setExpandedItem(activeParent.label)
  }, [items, location.pathname])

  const linkClass = (active) =>
    `group relative flex items-center rounded-lg text-sm transition-colors duration-150 ${
      isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5 w-full'
    } ${
      active
        ? 'bg-white/10 font-medium text-v-sidebar-active before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-r before:bg-v-primary'
        : 'text-v-sidebar-text hover:bg-white/5 hover:text-white'
    }`

  return (
    <nav className={`space-y-0.5 ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
      {items.map((item) => {
        const Icon = item.icon ?? null
        if (item.children) {
          const activeChild = item.children.some((child) =>
            location.pathname.endsWith(`/${child.path}`),
          )
          const expanded = expandedItem === item.label
          const childLinks = item.children.map((child) => {
            const ChildIcon = child.icon ?? null
            const href = child.scoped
              ? child.hrefTemplate?.(eventId) ?? `${child.basePath}/${eventId}/${child.path}`
              : child.path
            const active = location.pathname.endsWith(`/${child.path}`)
            return (
              <Link
                key={child.label}
                to={href}
                onClick={onNavigate}
                className={`relative flex min-h-8 items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? 'bg-white/10 font-medium text-v-sidebar-active before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-r before:bg-v-primary'
                    : 'text-v-sidebar-text hover:bg-white/5 hover:text-white'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {ChildIcon
                  ? <ChildIcon className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={1.5} aria-hidden />
                  : <span className="h-1 w-1 shrink-0 rounded-full bg-current opacity-60" aria-hidden />}
                <span className="truncate">{child.label}</span>
              </Link>
            )
          })

          if (item.scoped && !eventId) {
            return (
              <span
                key={item.label}
                className={`flex cursor-not-allowed items-center rounded-lg text-sm text-v-sidebar-text/55 ${
                  isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
                }`}
                aria-disabled="true"
                title="Select an event first"
              >
                <Lock className={`shrink-0 opacity-70 ${isCollapsed ? 'h-5 w-5' : 'h-3.5 w-3.5'}`} strokeWidth={1.5} aria-hidden />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </span>
            )
          }

          return (
            <div key={item.label} className="relative">
              <button
                type="button"
                className={`${linkClass(activeChild)} ${!isCollapsed ? 'justify-between' : ''}`}
                aria-expanded={expanded}
                aria-controls={`nav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                aria-current={activeChild ? 'location' : undefined}
                title={isCollapsed ? item.label : undefined}
                onClick={() => setExpandedItem(expanded ? '' : item.label)}
              >
                <span className={`flex min-w-0 items-center ${isCollapsed ? '' : 'gap-3'}`}>
                  {Icon && <Icon className={`shrink-0 ${isCollapsed ? 'h-5 w-5' : 'h-4 w-4'}`} strokeWidth={1.5} aria-hidden />}
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </span>
                {!isCollapsed && <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} aria-hidden />}
              </button>
              {expanded && (
                <div
                  id={`nav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  className={
                    isCollapsed
                      ? 'absolute left-full top-0 z-50 ml-2 w-56 rounded-lg border border-white/10 bg-v-sidebar p-1.5 shadow-xl'
                      : 'ml-5 mt-1 space-y-0.5 border-l border-white/10 pl-2'
                  }
                >
                  {childLinks}
                </div>
              )}
            </div>
          )
        }

        // Section header (non-clickable grouping label). Hidden when collapsed.
        if (item.section) {
          if (isCollapsed) return <div key={`section-${item.section}`} className="my-1 h-px w-6 bg-white/10" aria-hidden />
          return (
            <div
              key={`section-${item.section}`}
              className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-v-sidebar-text/65 select-none"
            >
              {item.section}
            </div>
          )
        }

        if (item.scoped && !eventId) {
          return (
            <span
              key={item.label}
              className={`group relative flex cursor-not-allowed items-center rounded-lg text-sm text-v-sidebar-text/55 transition-colors duration-150 ${
                isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5 w-full'
              }`}
              title={isCollapsed ? undefined : 'Select an event first'}
              aria-disabled="true"
            >
              {/* Figma "Navigation item / Disabled scoped": padlock replaces the icon */}
              <Lock className={`shrink-0 opacity-70 ${isCollapsed ? 'h-5 w-5' : 'h-3.5 w-3.5'}`} strokeWidth={1.5} aria-hidden />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
              {isCollapsed && (
                <div className="absolute left-full ml-4 rounded bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none z-100 whitespace-nowrap shadow-lg">
                  {item.label} (Select event first)
                </div>
              )}
            </span>
          )
        }

        const href = item.scoped
          ? item.hrefTemplate?.(eventId) ?? `${item.basePath}/${eventId}/${item.path}`
          : item.path

        const active = item.isActive
          ? item.isActive(location, eventId)
          : item.scoped
            ? location.pathname.includes(`/${item.path}`)
            : location.pathname === item.path

        return (
          <Link key={item.label} to={href} onClick={onNavigate} className={linkClass(active)} aria-current={active ? 'page' : undefined}>
            {Icon && <Icon className={`shrink-0 ${isCollapsed ? 'h-5 w-5' : 'h-4 w-4'}`} strokeWidth={1.5} aria-hidden />}
            {!isCollapsed && <span className="truncate">{item.label}</span>}
            {isCollapsed && (
              <div className="absolute left-full ml-4 rounded bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none z-100 whitespace-nowrap shadow-lg">
                {item.label}
              </div>
            )}
          </Link>
        )
      })}
      {!eventId && !isCollapsed && items.some((item) => item.scoped) && (
        <p className="mx-3 mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs leading-snug text-v-sidebar-text/80">
          <span className="block font-semibold text-v-sidebar-text">Select an event first</span>
          to use scoped pages.
        </p>
      )}
    </nav>
  )
}

function SidebarContent({
  homeLink,
  navItems,
  eventId,
  location,
  footerLink,
  onNavigate,
  isCollapsed,
  onToggleCollapse,
  caption,
  eventContext,
  onClose,
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Top Section */}
      <div className="flex-1">
        {isCollapsed ? (
          // Collapsed rail: logo mark on top, expand toggle centered beneath it
          // so neither is cramped in the narrow width.
          <div className="flex flex-col items-center gap-3">
            <Link
              to={homeLink}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white transition hover:bg-white/15"
              aria-label="Votrix home"
            >
              <VotrixLogo size="sm" variant="mark" className="text-white" />
            </Link>
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="hidden h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition-colors duration-150 hover:bg-white/10 hover:text-white md:inline-flex"
                aria-expanded={false}
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="h-5 w-5" strokeWidth={1.5} />
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <VotrixLogo size="md" linkTo={homeLink} className="text-white" />
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center rounded-lg p-2.5 text-gray-300 transition-colors duration-150 hover:bg-white/10 hover:text-white"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" strokeWidth={1.5} />
                </button>
              )}
              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="hidden items-center justify-center rounded-lg p-2.5 text-gray-300 transition-colors duration-150 hover:bg-white/10 hover:text-white md:inline-flex"
                  aria-expanded
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="h-5 w-5" strokeWidth={1.5} />
                </button>
              )}
            </div>
            {caption && (
              <p className="mt-4 truncate px-1 text-[11px] font-semibold uppercase tracking-wider text-v-sidebar-text/65">
                {caption}
              </p>
            )}
            {eventContext?.title && (
              // Figma: the active event is pinned under the caption in the
              // expanded sidebar and in the mobile drawer.
              <div className="mt-3 rounded-xl bg-v-surface p-3 text-v-text shadow-v-shadow">
                <p className="truncate text-sm font-semibold">{eventContext.title}</p>
                {eventContext.status && <StatusBadge status={eventContext.status} className="mt-1.5" />}
              </div>
            )}
          </>
        )}
        {navItems?.length > 0 && (
          <div className={`${isCollapsed ? 'mt-8' : 'mt-4'} ${isCollapsed ? 'space-y-1' : ''}`}>
            <NavLinks
              items={navItems}
              eventId={eventId}
              location={location}
              onNavigate={onNavigate}
              isCollapsed={isCollapsed}
            />
          </div>
        )}
      </div>

      {/* Bottom Section */}
      <div className={`mt-auto pt-6 flex ${isCollapsed ? 'flex-col items-center space-y-3' : 'flex-col space-y-4'}`}>
        {footerLink && (
          <Link
            to={footerLink.to}
            onClick={onNavigate}
            title={footerLink.label.replace(/^←\s*/, '')}
            className={`group inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-gray-300 transition hover:border-v-primary hover:bg-white/10 hover:text-white ${isCollapsed ? 'w-full justify-center' : 'w-full'}`}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
            {!isCollapsed && <span>{footerLink.label.replace(/^←\s*/, '')}</span>}
          </Link>
        )}
      </div>
    </div>
  )
}

export default function AppShell({
  title,
  moduleLabel,
  headerLabel,
  sidebarCaption,
  homeLink = '/',
  navItems = [],
  eventId,
  footerLink,
  showSidebar = true,
  showSearch = true,
  showBackButton = false,
  backButtonPath = '/participant',
  children,
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  // Is the viewport under the auto-collapse breakpoint? Tracked as state so a
  // resize across the breakpoint recomputes the collapsed state.
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < AUTO_COLLAPSE_BELOW,
  )
  // Effective collapsed state. Auto-collapses on narrow screens and on data-heavy
  // "focus" pages (analytics, live control, rankings); otherwise it follows the
  // saved preference. The compute effect below keeps this in sync.
  const [isCollapsed, setIsCollapsed] = useState(
    () =>
      isNarrow ||
      (typeof window !== 'undefined' && isFocusPath(window.location.pathname)) ||
      readCollapsedPref(),
  )
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
  const [profileCardOpen, setProfileCardOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, clearSession } = useAuth()
  const profileDropdownRef = useRef(null)
  const isOrganizer = user?.role === 'organizer'
  const eventContext = useEventContextStore((s) => (eventId && s.eventId === eventId ? s : null))

  const caption = sidebarCaption ?? (isOrganizer ? user?.organizationName : undefined)

  const closeMobile = () => setMobileOpen(false)

  const handleLogout = async () => {
    try {
      await authService.logout()
    } catch {
      /* clear local session even if API fails */
    }
    clearSession()
    navigate('/')
  }

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev
      // Persist only as a resting preference — a wide, non-focus screen. On a
      // narrow screen or a data-heavy focus page the toggle is a temporary
      // override that resets the next time that context changes.
      if (!isNarrow && !isFocusPath(location.pathname)) {
        try {
          localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
        } catch {
          /* storage unavailable — keep the in-memory state only */
        }
      }
      return next
    })
  }

  // Track the responsive breakpoint (fires only when it is crossed).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia(`(max-width: ${AUTO_COLLAPSE_BELOW - 1}px)`)
    const handler = (e) => setIsNarrow(e.matches)
    setIsNarrow(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Recompute the collapsed state whenever the context changes: a narrow screen
  // or a data-heavy focus page auto-collapses; leaving both restores the saved
  // preference. Runs on breakpoint crossings and on navigation into/out of a
  // focus page, which is what makes the collapse feel automatic.
  useEffect(() => {
    setIsCollapsed(isNarrow || isFocusPath(location.pathname) ? true : readCollapsedPref())
  }, [isNarrow, location.pathname])

  const displayName = user?.username ?? user?.email ?? 'User'
  const initials = displayName.slice(0, 2).toUpperCase()
  const roleLabel = ROLE_LABELS[user?.role] ?? 'Account'
  // Organizers open the ProfileCard; everyone else opens the dropdown. One flag
  // drives the trigger's highlighted/open state for both.
  const profileOpen = isOrganizer ? profileCardOpen : profileDropdownOpen

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileDropdownOpen) return undefined

    const handleClickOutside = (e) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target)) {
        setProfileDropdownOpen(false)
      }
    }

    const handleEscape = (e) => {
      if (e.key === 'Escape') setProfileDropdownOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [profileDropdownOpen])

  // Prevent background scroll and handle ESC key when mobile drawer is open
  useEffect(() => {
    if (!mobileOpen) return undefined

    const handleEscape = (e) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = 'unset'
      document.removeEventListener('keydown', handleEscape)
    }
  }, [mobileOpen])

  useEffect(() => {
    if (!user) return undefined

    let alive = true

    const loadUnreadCount = async () => {
      try {
        const { data } = await notificationsService.getUnreadCount()
        if (alive) {
          setUnreadCount(data.unreadCount ?? 0)
        }
      } catch {
        if (alive) {
          setUnreadCount(0)
        }
      }
    }

    void loadUnreadCount()

    const handleUpdate = () => {
      void loadUnreadCount()
    }
    window.addEventListener('votrix-notifications-updated', handleUpdate)

    return () => {
      alive = false
      window.removeEventListener('votrix-notifications-updated', handleUpdate)
    }
  }, [user, location.pathname])

  useSocketEvent('notification:created', () => {
    setUnreadCount((c) => c + 1)
  })

  const sidebar = (isDesktop) => (
    <SidebarContent
      homeLink={homeLink}
      navItems={navItems}
      eventId={eventId}
      location={location}
      footerLink={footerLink}
      onNavigate={closeMobile}
      isCollapsed={isDesktop ? isCollapsed : false}
      onToggleCollapse={isDesktop ? toggleCollapse : undefined}
      caption={caption}
      eventContext={eventContext}
      onClose={isDesktop ? undefined : closeMobile}
    />
  )

  return (
    <div
      data-module={moduleLabel?.toLowerCase().replace(/\s+/g, '-')}
      className="flex min-h-screen bg-v-bg"
      style={{ '--sidebar-width': showSidebar ? (isCollapsed ? 'var(--v-rail-w)' : 'var(--v-sidebar-w)') : '0px' }}
    >
      {showSidebar && (
        <aside
          className={`sticky top-0 hidden h-screen min-h-screen shrink-0 self-start overflow-y-auto border-r border-white/5 bg-v-sidebar transition-[width,padding] duration-200 ease-in-out md:block ${
            isCollapsed ? 'w-18 px-3 py-6' : 'w-64 p-5'
          }`}
        >
          {sidebar(true)}
        </aside>
      )}

      {/* Off-canvas sidebar for Tablet/Mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 w-full h-full bg-black/50 backdrop-blur-sm cursor-default"
            aria-label="Close menu"
            onClick={closeMobile}
          />
          <aside className="relative flex h-full w-[min(100%,288px)] flex-col overflow-y-auto border-r border-white/5 bg-v-sidebar p-5 shadow-xl animate-in slide-in-from-left duration-200 ease-out">
            {sidebar(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex min-h-18 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-v-border bg-v-surface/95 px-4 py-3 backdrop-blur-md sm:px-6">
          {showSidebar && (
            <button
              type="button"
              className="flex-shrink-0 rounded-lg border border-v-border p-2 text-v-text-muted transition hover:border-v-primary/40 hover:bg-v-primary-soft/50 hover:text-v-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v-primary pointer-coarse:min-h-11 pointer-coarse:min-w-11 md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              aria-expanded={mobileOpen}
            >
              <Menu className="h-5 w-5" strokeWidth={1.5} />
            </button>
          )}

          <div className="min-w-0 flex-1">
            {showBackButton && (
              <Link
                to={backButtonPath}
                className="mb-1 inline-flex items-center gap-1 text-sm text-v-text-subtle hover:text-v-text"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to dashboard
              </Link>
            )}
            {showSidebar ? (
              <h1 className="truncate font-display text-base font-bold text-v-text sm:text-lg">
                {headerLabel ?? title}
              </h1>
            ) : (
              // Figma participant header: wordmark + context, no sidebar or search.
              <div className="flex min-w-0 items-center gap-2">
                <VotrixLogo size="sm" linkTo={homeLink} />
                <span className="text-v-text-subtle" aria-hidden="true">/</span>
                <h1 className="truncate text-sm font-semibold text-v-text sm:text-base">
                  {headerLabel ?? title}
                </h1>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {showSearch && <GlobalSearch />}
            <div className="relative flex">
              <button
                type="button"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className={`relative flex items-center gap-2 rounded-lg border border-v-border p-2 transition hover:bg-v-surface-elevated pointer-coarse:min-h-11 pointer-coarse:min-w-11 lg:px-3 ${
                  notificationsOpen ? 'bg-v-surface-elevated text-v-text' : 'text-v-text-muted'
                }`}
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
              >
                <Bell className="h-5 w-5" strokeWidth={1.5} />
                <span className="hidden text-sm font-medium lg:inline" aria-hidden="true">
                  Notifications{unreadCount > 0 ? ` (${unreadCount > 99 ? '99+' : unreadCount})` : ''}
                </span>
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-v-danger px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white lg:hidden">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <NotificationsModal onClose={() => setNotificationsOpen(false)} />
              )}

              {profileCardOpen && user?.role === 'organizer' && (
                <ProfileCard onClose={() => setProfileCardOpen(false)} />
              )}
            </div>
            <div className="relative" ref={profileDropdownRef}>
              <button
                type="button"
                onClick={() =>
                  isOrganizer
                    ? setProfileCardOpen((prev) => !prev)
                    : setProfileDropdownOpen((prev) => !prev)
                }
                className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-2 text-sm transition sm:pr-3 ${
                  profileOpen
                    ? 'border-v-primary bg-v-primary-soft ring-2 ring-v-primary/30'
                    : 'border-v-border hover:border-v-primary/50 hover:bg-v-surface-elevated'
                }`}
                aria-expanded={profileOpen}
                aria-haspopup="true"
                aria-label="Open account menu"
                title={`Signed in as ${displayName} — account & sign out`}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-v-primary text-xs font-semibold text-v-sidebar-active"
                  aria-hidden
                >
                  {initials}
                </span>
                <span className="hidden font-medium text-v-text sm:block">
                  {roleLabel}
                </span>
                <ChevronDown
                  className={`hidden h-4 w-4 shrink-0 text-v-text-muted transition-transform sm:block ${
                    profileOpen ? 'rotate-180' : ''
                  }`}
                  strokeWidth={1.5}
                  aria-hidden
                />
              </button>

              {profileDropdownOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border border-v-border bg-v-surface shadow-v-shadow-lg">
                  <div className="px-4 py-3 border-b border-v-border">
                    <p className="text-sm font-medium text-v-text truncate">{displayName}</p>
                    <p className="text-xs text-v-text-subtle mt-0.5">{user?.email || ''}</p>
                  </div>

                  {/* Shared participant account details; fields can span multiple types. */}
                  {(user?.firstName || user?.lastName || user?.schoolId || user?.program || user?.yearSection || user?.profileData?.title || user?.profileData?.affiliation || user?.profileData?.expertise) && (
                    <dl className="border-b border-v-border px-4 py-3 space-y-2">
                      {[user.firstName, user.lastName].filter(Boolean).length > 0 && (
                        <ProfileRow label="Name" value={[user.firstName, user.lastName].filter(Boolean).join(' ')} />
                      )}
                      <ProfileRow label="School ID" value={user.schoolId} />
                      <ProfileRow label="Program" value={user.program} />
                      <ProfileRow label="Year & Section" value={user.yearSection} />
                      <ProfileRow label="Title" value={user.profileData?.title} />
                      <ProfileRow label="Affiliation" value={user.profileData?.affiliation} />
                      <ProfileRow label="Expertise" value={user.profileData?.expertise} />
                    </dl>
                  )}

                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileDropdownOpen(false)
                        handleLogout()
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-v-danger hover:bg-v-surface-elevated transition-colors"
                    >
                      <LogOut className="h-4 w-4" strokeWidth={1.5} />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="v-page-enter flex-1 p-4 md:px-7 md:py-6 xl:px-8">{children ?? <Outlet />}</main>
        <div id="stage-footer-portal" className="shrink-0 empty:hidden sticky bottom-0 z-40" />
      </div>
    </div>
  )
}
