import { Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import VotrixLogo from '@/components/brand/VotrixLogo'

export default function AuthLayout() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-v-bg px-4 py-8 sm:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-v-primary-soft/80 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-v-surface-elevated blur-3xl" />
      </div>
      <motion.div
        className="relative w-full max-w-md"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="v-card overflow-hidden shadow-v-shadow-md">
          <div className="flex justify-center border-b border-v-border bg-v-surface-elevated/90 px-6 py-5 sm:px-8 sm:py-6">
            <VotrixLogo size="lg" showTagline linkTo="/" />
          </div>
          <div className="p-5 sm:p-8">
            <Outlet />
          </div>
        </div>
      </motion.div>
    </div>
  )
}
