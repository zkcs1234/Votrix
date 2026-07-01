import { Link } from 'react-router-dom'
import { SearchX, Home } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <SearchX className="h-16 w-16 text-v-text-subtle" strokeWidth={1} />
      <p className="mt-4 text-6xl font-bold text-v-text-subtle">404</p>
      <h1 className="mt-4 text-xl font-semibold text-v-text">Page not found</h1>
      <p className="mt-2 text-v-text-subtle">The page you requested does not exist.</p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 text-v-text-muted hover:text-v-text"
      >
        <Home className="h-4 w-4" strokeWidth={1.5} />
        Back to home
      </Link>
    </div>
  )
}
