import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, Bell, LogOut, ChevronLeft, ChevronRight, User } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { authService } from '@/services/auth.service'
import { notificationsService } from '@/services/notifications.service'
import VotrixLogo from '@/components/brand/VotrixLogo'
import ThemeToggle from '@/components/ui/ThemeToggle'
import NotificationsModal from '@/components/ui/NotificationsModal'
import GlobalSearch from '@/components/ui/GlobalSearch'
import ProfileCard from '@/components/organizer/ProfileCard'
import { useSocketEvent } from '@/hooks/useSocketEvent'

function NavLinks({ items, eventId, location, onNavigate, isCollapsed }) {
  const linkClass = (active) =>
    `group relative flex items-center rounded-lg text-sm transition-colors duration-150 ${
      isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5 w-full'
    } ${
      active
        ? 'bg-white/10 font-medium text-v-sidebar-active'
        : 'text-v-sidebar-text hover:bg-white/5 hover:text-white'
    }`

  return (
    <nav className={`space-y-0.5 ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
      {items.map((item) => {
        const Icon = item.icon ?? null

        // Section header (non-clickable grouping label). Hidden when collapsed.
        if (item.section) {
          if (isCollapsed) return <div key={`section-${item.section}`} className="my-1 h-px w-6 bg-white/10" aria-hidden />
          return (
            <div
              key={`section-${item.section}`}
              className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-v-sidebar-text/40 select-none"
            >
              {item.section}
            </div>
          )
        }

        if (item.scoped && !eventId) {
          return (
            <span
              key={item.label}
              className={`group relative flex cursor-not-allowed items-center rounded-lg text-sm text-gray-600 transition-colors duration-150 ${
                isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5 w-full'
              }`}
              title={isCollapsed ? undefined : 'Select an event first'}
              aria-disabled="true"
            >
              {Icon && <Icon className={`shrink-0 opacity-40 ${isCollapsed ? 'h-5 w-5' : 'h-4 w-4'}`} strokeWidth={1.5} aria-hidden />}
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
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Top Section */}
      <div className="flex-1">
        <div className={`flex items-center ${isCollapsed ? 'justify-between h-14' : 'justify-between'}`}>
          <div className="flex items-center gap-3">
            {isCollapsed ? (
              <Link
                to={homeLink}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white transition hover:bg-white/15"
                aria-label="Votrix home"
              >
                <VotrixLogo size="sm" variant="mark" className="text-white" />
              </Link>
            ) : (
              <VotrixLogo size="md" linkTo={homeLink} className="text-white" />
            )}
          </div>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className={`hidden lg:inline-flex items-center ${isCollapsed ? 'rounded-full border border-white/20 bg-white/10 text-white hover:border-white/40 hover:bg-white/15' : 'rounded-lg text-gray-400 hover:bg-white/10 hover:text-white'} transition-colors duration-150 ${isCollapsed ? 'p-2.5 justify-center' : 'p-2.5 gap-3'}`}
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? (
                <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
              ) : (
                <>
                  <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
                  <span className="text-sm font-medium">Collapse</span>
                </>
              )}
            </button>
          )}
        </div>
        {navItems?.length > 0 && (
          <div className={`mt-8 ${isCollapsed ? 'space-y-1' : ''}`}>
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
            className={`group inline-flex items-center justify-center gap-2 rounded-2xl border border-v-border px-3 py-2 text-sm font-medium text-gray-300 transition hover:border-v-primary hover:bg-white/10 hover:text-white ${isCollapsed ? 'w-full justify-center' : 'w-full'}`}
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
  homeLink = '/',
  navItems = [],
  eventId,
  footerLink,
  showSidebar = true,
  showSearch = true,
  showBackButton = false,
  backButtonPath = '/voter',
  children,
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const stored = localStorage.getItem('votrix.sidebar.collapsed')
    return stored === 'true'
  })
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
  const [profileCardOpen, setProfileCardOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, clearSession } = useAuth()
  const profileDropdownRef = useRef(null)

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
      localStorage.setItem('votrix.sidebar.collapsed', String(next))
      return next
    })
  }

  const displayName = user?.username ?? user?.email ?? 'User'
  const initials = displayName.slice(0, 2).toUpperCase()

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
      moduleLabel={moduleLabel}
      navItems={navItems}
      eventId={eventId}
      location={location}
      footerLink={footerLink}
      onNavigate={closeMobile}
      isCollapsed={isDesktop ? isCollapsed : false}
      onToggleCollapse={isDesktop ? toggleCollapse : undefined}
    />
  )

  return (
    <div className="flex min-h-screen bg-v-bg" style={{ '--sidebar-width': showSidebar ? (isCollapsed ? '4.5rem' : '16rem') : '0px' }}>
      {showSidebar && (
        <aside
          className={`hidden shrink-0 bg-v-sidebar lg:block sticky top-0 self-start h-screen min-h-screen overflow-y-auto transition-[width,padding] duration-200 ease-in-out ${
            isCollapsed ? 'w-18 px-3 py-6' : 'w-64 p-6'
          }`}
        >
          {sidebar(true)}
        </aside>
      )}

      {/* Off-canvas sidebar for Tablet/Mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 w-full h-full bg-black/50 backdrop-blur-sm cursor-default"
            aria-label="Close menu"
            onClick={closeMobile}
          />
          <aside className="relative flex h-full w-[min(100%,280px)] flex-col bg-v-sidebar p-6 shadow-xl animate-in slide-in-from-left duration-200 ease-out">
            {sidebar(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-v-border bg-v-surface px-4 py-3 shadow-v-shadow sm:px-6 sm:py-4">
          {showSidebar && (
            <button
              type="button"
              className="flex-shrink-0 rounded-lg border border-v-border p-2 text-v-text-muted hover:bg-v-surface-elevated lg:hidden"
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
            <h1 className="truncate text-base font-semibold text-v-text sm:text-lg">
              {title}
            </h1>
            {moduleLabel && (
              <p className="truncate text-xs text-v-text-subtle">{moduleLabel}</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {showSearch && <GlobalSearch />}
            <div className="relative flex">
              <button
                type="button"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className={`relative rounded-lg border border-v-border p-2 transition hover:bg-v-surface-elevated ${
                  notificationsOpen ? 'bg-v-surface-elevated text-v-text' : 'text-v-text-muted'
                }`}
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
              >
                <Bell className="h-5 w-5" strokeWidth={1.5} />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-v-danger px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
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
            <ThemeToggle />
            <div className="relative" ref={profileDropdownRef}>
              <button
                type="button"
                onClick={() => setProfileDropdownOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-lg border border-v-border px-2 py-1.5 text-sm transition hover:bg-v-surface-elevated"
                aria-expanded={profileDropdownOpen}
                aria-haspopup="true"
                aria-label="Open profile menu"
              >
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-v-surface-elevated text-xs font-semibold text-v-text-muted"
                  aria-hidden
                >
                  {initials}
                </div>
              </button>

              {profileDropdownOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-v-border bg-v-surface shadow-v-shadow-lg">
                  <div className="px-4 py-3 border-b border-v-border">
                    <p className="text-sm font-medium text-v-text truncate">{displayName}</p>
                    <p className="text-xs text-v-text-subtle mt-0.5">{user?.email || ''}</p>
                  </div>
                  <div className="py-1">
                    {user?.role === 'organizer' && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileDropdownOpen(false)
                          setProfileCardOpen(true)
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-v-text hover:bg-v-surface-elevated transition-colors"
                      >
                        <User className="h-4 w-4" strokeWidth={1.5} />
                        <span>Organizer Profile</span>
                      </button>
                    )}
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

        <main className="v-page-enter flex-1 p-4 md:p-8">{children ?? <Outlet />}</main>
        <div id="stage-footer-portal" className="shrink-0 empty:hidden sticky bottom-0 z-40" />
      </div>
    </div>
  )
}
