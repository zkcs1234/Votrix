import { Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import VotrixLogo from '@/components/brand/VotrixLogo'

// Figma auth frame: wordmark top-left, one white card centered on the canvas,
// and the product line beneath it. No registration or public account creation.
export default function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-v-bg">
      <header className="px-5 py-5 sm:px-8">
        <VotrixLogo size="md" linkTo="/" />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-4 sm:items-center sm:pt-0">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="v-card p-6 shadow-v-shadow-md sm:p-8">
            <Outlet />
          </div>
          <p className="mt-5 text-center text-sm text-v-text-subtle">
            Participation, with confidence.
          </p>
        </motion.div>
      </main>
    </div>
  )
}
