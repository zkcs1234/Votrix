import { Outlet, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogIn } from 'lucide-react'
import VotrixLogo from '@/components/brand/VotrixLogo'
import Button from '@/components/ui/Button'

export default function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-v-bg">
      <header className="border-b border-v-border bg-v-surface shadow-v-shadow">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <VotrixLogo size="md" linkTo="/" />
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link to="/login/organizer" className="hidden sm:inline-flex">
              <Button variant="ghost" size="sm">
                Organizer
              </Button>
            </Link>
            <Link to="/login/voter" className="hidden sm:inline-flex">
              <Button variant="ghost" size="sm">
                Voter
              </Button>
            </Link>
            <Link to="/login/admin">
              <Button variant="brand" size="sm">
                <LogIn className="h-4 w-4" strokeWidth={2} />
                Admin
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <motion.main
        className="flex flex-1 flex-col"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Outlet />
      </motion.main>

      <footer className="border-t border-v-border bg-v-surface py-8 text-center">
        <p className="text-sm font-medium text-v-text-muted">VOTRIX</p>
        <p className="mt-1 text-xs text-v-text-subtle">Every Vote Counts.</p>
      </footer>
    </div>
  )
}
