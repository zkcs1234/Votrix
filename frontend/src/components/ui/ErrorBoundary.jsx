import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'

/**
 * Top-level error boundary. Catches render/runtime errors anywhere below it and
 * shows a recoverable fallback instead of a blank white screen. Additive — it
 * changes nothing when no error is thrown.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {React.ReactNode} [props.fallback] Optional custom fallback UI.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // Kept as console for now; swap for a real error tracker (see Phase E2).
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }

  handleReload = () => {
    // Full reload is the safest recovery for an unknown render failure.
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback) return this.props.fallback

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-v-border bg-v-surface p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-v-danger/10 text-v-danger">
            <AlertTriangle className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h1 className="text-lg font-semibold text-v-text">Something went wrong</h1>
          <p className="mt-2 text-sm text-v-text-muted">
            An unexpected error stopped this page from loading. Reloading usually fixes it.
            If it keeps happening, please let the team know.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-v-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-v-primary-hover"
          >
            Reload page
          </button>
        </div>
      </div>
    )
  }
}
