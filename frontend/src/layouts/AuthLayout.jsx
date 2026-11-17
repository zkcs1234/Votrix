import { Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import VotrixLogo from '@/components/brand/VotrixLogo'
import { MaintenanceLoginBanner } from '@/components/ui/MaintenanceNotices'
import { usePlatformStore } from '@/store/platform.store'

// `size="lg"` widens the card for longer public forms (e.g. the organizer
// application); every existing auth page keeps the default narrow card.
export default function AuthLayout({ size = 'md' }) {
  const maintenanceMode = usePlatformStore((s) => s.maintenanceMode)
  return (
    <div className="flex min-h-screen items-center justify-center bg-v-bg px-4 py-12">
      <motion.div
        className={`w-full ${size === 'lg' ? 'max-w-2xl' : 'max-w-md'}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="v-card overflow-hidden shadow-v-shadow-md">
          <div className="flex justify-center border-b border-v-border bg-v-surface-elevated px-8 py-6">
            <VotrixLogo size="lg" showTagline linkTo="/" />
          </div>
          <div className="p-8">
            {maintenanceMode && <MaintenanceLoginBanner />}
            <Outlet />
          </div>
        </div>
      </motion.div>
    </div>
  )
}
