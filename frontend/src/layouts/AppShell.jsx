import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, Bell, LogOut, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { authService } from '@/services/auth.service'
import { notificationsService } from '@/services/notifications.service'
import VotrixLogo from '@/components/brand/VotrixLogo'
import ThemeToggle from '@/components/ui/ThemeToggle'
import Button from '@/components/ui/Button'
import NotificationsModal from '@/components/ui/NotificationsModal'
import GlobalSearch from '@/components/ui/GlobalSearch'
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
                <div className="absolute left-full ml-4 rounded bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none z-[100] whitespace-nowrap shadow-lg">
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
              <div className="absolute left-full ml-4 rounded bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none z-[100] whitespace-nowrap shadow-lg">
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
  moduleLabel,
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
        <div className={`flex items-center ${isCollapsed ? 'h-[32px]' : ''}`}>
          {!isCollapsed && <VotrixLogo size="md" linkTo={homeLink} className="text-white" />}
        </div>
        {!isCollapsed && moduleLabel && (
          <p className="mt-3 text-[11px] font-medium uppercase tracking-wider text-gray-500">
            {moduleLabel}
          </p>
        )}
        {navItems?.length > 0 && (
          <div className="mt-8">
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
      <div className={`mt-auto pt-6 flex ${isCollapsed ? 'flex-col items-center space-y-4' : 'flex-col space-y-4'}`}>
        {footerLink && (
          <Link
            to={footerLink.to}
            onClick={onNavigate}
            className={`group relative block text-xs text-gray-500 transition hover:text-gray-300 ${isCollapsed ? 'flex justify-center p-2.5 w-full' : ''}`}
          >
            {isCollapsed ? (
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            ) : (
              footerLink.label
            )}
            {isCollapsed && (
              <div className="absolute left-full ml-4 rounded bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none z-[100] whitespace-nowrap shadow-lg">
                {footerLink.label.replace('←', '').trim()}
              </div>
            )}
          </Link>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`hidden lg:flex items-center rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition-colors duration-150 ${isCollapsed ? 'p-2.5 justify-center w-full' : 'p-2.5 gap-3 w-full'}`}
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
            {isCollapsed && (
              <div className="absolute left-full ml-11 rounded bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 transition-opacity duration-200 hover:opacity-100 pointer-events-none z-[100] whitespace-nowrap shadow-lg">
                Expand
              </div>
            )}
          </button>
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
  const [unreadCount, setUnreadCount] = useState(0)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, clearSession } = useAuth()

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
    <div className="flex min-h-screen bg-v-bg">
      {showSidebar && (
        <aside
          className={`hidden shrink-0 bg-v-sidebar lg:block transition-[width,padding] duration-200 ease-in-out ${
            isCollapsed ? 'w-[72px] px-3 py-6' : 'w-64 p-6'
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
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-v-border bg-v-surface px-4 py-3 shadow-v-shadow sm:px-6 sm:py-4">
          {showSidebar && (
            <button
              type="button"
              className="rounded-lg border border-v-border p-2 text-v-text-muted hover:bg-v-surface-elevated lg:hidden"
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
            </div>
            <ThemeToggle />
            <div className="hidden items-center gap-2 sm:flex">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full bg-v-surface-elevated text-xs font-semibold text-v-text-muted"
                aria-hidden
              >
                {initials}
              </div>
              <span className="max-w-35 truncate text-sm text-v-text-muted">
                {displayName}
              </span>
            </div>
            <Button variant="secondary" size="sm" onClick={handleLogout} className="hidden sm:inline-flex">
              Sign out
            </Button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-v-border p-2 text-v-text-muted hover:bg-v-surface-elevated sm:hidden"
              aria-label="Sign out"
            >
              <LogOut className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </div>
        </header>

        <main className="v-page-enter flex-1 p-4 md:p-8">{children ?? <Outlet />}</main>
      </div>
    </div>
  )
}
