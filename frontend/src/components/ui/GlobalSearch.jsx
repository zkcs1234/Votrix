import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, X, Command } from 'lucide-react'
import { searchIndex } from '@/config/searchIndex'
import { useAuth } from '@/hooks/useAuth'

export default function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const { role } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Extract eventId if present in the current URL path
  const eventIdMatch = location.pathname.match(/\/events\/([a-zA-Z0-9_-]+)/)
  const currentEventId = eventIdMatch ? eventIdMatch[1] : null

  const toggleOpen = () => setIsOpen((prev) => !prev)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        toggleOpen()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
      document.body.style.overflow = 'hidden'
    } else {
      setQuery('')
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const filteredResults = useMemo(() => {
    if (!query) return []
    const q = query.toLowerCase()
    return searchIndex
      .filter((item) => item.roles.includes(role))
      .filter((item) => {
        return (
          item.title.toLowerCase().includes(q) ||
          item.keywords.some((kw) => kw.toLowerCase().includes(q)) ||
          item.category.toLowerCase().includes(q)
        )
      })
  }, [query, role])

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleResultClick = (item) => {
    let href = item.path
    if (item.scoped) {
      if (currentEventId) {
        href = `${item.basePath}/${currentEventId}/${item.path}`
      } else {
        // Fallback to module events list
        href = item.basePath
      }
    }
    navigate(href)
    setIsOpen(false)
  }

  const handleKeyDown = (e) => {
    if (!isOpen) return
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (filteredResults.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % filteredResults.length)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (filteredResults.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + filteredResults.length) % filteredResults.length)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredResults[selectedIndex]) {
        handleResultClick(filteredResults[selectedIndex])
      }
    }
  }

  return (
    <>
      {/* Desktop Toggle */}
      <button
        type="button"
        className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-v-border bg-v-surface text-v-text-subtle hover:text-v-text hover:border-v-border-strong hover:bg-v-surface-elevated transition cursor-text w-64 text-left shadow-v-shadow-sm focus:outline-none focus:ring-2 focus:ring-v-primary/30"
        onClick={toggleOpen}
        aria-label="Search"
      >
        <Search className="h-4 w-4" strokeWidth={1.5} />
        <span className="text-sm flex-1 truncate">Search...</span>
        <kbd className="hidden lg:inline-flex items-center gap-1 font-mono text-[10px] font-medium text-v-text-muted bg-v-bg border border-v-border px-1.5 py-0.5 rounded">
          <Command className="h-3 w-3" />K
        </kbd>
      </button>

      {/* Mobile Toggle */}
      <button
        type="button"
        className="md:hidden rounded-lg border border-v-border p-2 text-v-text-muted hover:bg-v-surface-elevated focus:outline-none focus:ring-2 focus:ring-v-primary/30 shadow-v-shadow-sm"
        onClick={toggleOpen}
        aria-label="Open global search"
      >
        <Search className="h-5 w-5" strokeWidth={1.5} />
      </button>

      {/* Full-screen Modal / Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-start sm:p-4 md:p-12 lg:pt-[12vh] animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          <div
            className="relative w-full max-w-2xl bg-v-surface sm:rounded-xl shadow-v-shadow-xl flex flex-col overflow-hidden max-h-full sm:max-h-[80vh] border border-v-border"
            onKeyDown={handleKeyDown}
            role="dialog"
            aria-modal="true"
            aria-label="Global Search"
          >
            <div className="flex items-center px-4 py-4 border-b border-v-border bg-v-surface">
              <Search className="h-5 w-5 text-v-text-subtle mr-3 shrink-0" strokeWidth={1.5} />
              <input
                ref={inputRef}
                className="flex-1 bg-transparent border-none outline-none text-v-text text-base placeholder:text-v-text-subtle focus:ring-0 p-0"
                placeholder="Search pages, modules, or settings..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                role="combobox"
                aria-expanded="true"
                aria-controls="search-results"
                aria-autocomplete="list"
              />
              <button
                type="button"
                className="p-1 rounded-md hover:bg-v-surface-elevated text-v-text-subtle hover:text-v-text transition"
                onClick={() => setIsOpen(false)}
                aria-label="Close search"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>

            {query && filteredResults.length === 0 && (
              <div className="px-6 py-12 text-center text-v-text-subtle">
                <p className="text-sm">No results found for "{query}"</p>
              </div>
            )}

            {!query && (
              <div className="px-6 py-8 text-center text-v-text-subtle">
                <p className="text-sm">Type to search the dashboard</p>
              </div>
            )}

            {filteredResults.length > 0 && (
              <div id="search-results" className="flex-1 overflow-y-auto p-2 space-y-1" role="listbox">
                {filteredResults.map((item, index) => {
                  const Icon = item.icon
                  const isSelected = index === selectedIndex

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors ${
                        isSelected
                          ? 'bg-v-primary/10 text-v-primary border border-v-primary/20'
                          : 'hover:bg-v-surface-elevated text-v-text border border-transparent'
                      }`}
                      onClick={() => handleResultClick(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      role="option"
                      aria-selected={isSelected}
                    >
                      {Icon && (
                        <div
                          className={`p-2 rounded-md ${
                            isSelected ? 'bg-v-primary/20 text-v-primary' : 'bg-v-surface-elevated text-v-text-subtle'
                          }`}
                        >
                          <Icon className="h-4 w-4" strokeWidth={1.5} />
                        </div>
                      )}
                      <div className="flex-1 flex flex-col min-w-0">
                        <span className="text-sm font-medium truncate">{item.title}</span>
                        <span className="text-[11px] opacity-70 truncate uppercase tracking-wider font-semibold mt-0.5">
                          {item.category}
                        </span>
                      </div>
                      {item.scoped && (
                        <span className="text-[10px] bg-v-surface-elevated px-2 py-1 rounded text-v-text-subtle uppercase border border-v-border shrink-0 font-medium tracking-wide">
                          Requires Event
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="hidden sm:flex items-center justify-between px-4 py-3 bg-v-surface-elevated border-t border-v-border text-xs text-v-text-subtle">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="font-mono bg-v-surface border border-v-border rounded px-1.5 py-0.5 shadow-sm text-v-text font-semibold">
                    ↑
                  </kbd>
                  <kbd className="font-mono bg-v-surface border border-v-border rounded px-1.5 py-0.5 shadow-sm text-v-text font-semibold">
                    ↓
                  </kbd>
                  <span className="ml-1">to navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="font-mono bg-v-surface border border-v-border rounded px-1.5 py-0.5 shadow-sm text-v-text font-semibold">
                    ↵
                  </kbd>
                  <span className="ml-1">to select</span>
                </span>
              </div>
              <span className="flex items-center gap-1">
                <kbd className="font-mono bg-v-surface border border-v-border rounded px-1.5 py-0.5 shadow-sm text-v-text font-semibold">
                  ESC
                </kbd>
                <span className="ml-1">to close</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
