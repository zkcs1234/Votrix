import { useState } from 'react'
import { Wrench } from 'lucide-react'
import VotrixLogo from '@/components/brand/VotrixLogo'
import Button from '@/components/ui/Button'
import { useAuthStore } from '@/store/auth.store'
import { usePlatformStore } from '@/store/platform.store'
import { authService } from '@/services/auth.service'

// Full-screen state for everyone except administrators while maintenance mode is on.
export default function MaintenanceScreen() {
  const platformName = usePlatformStore((s) => s.platformName)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [signingOut, setSigningOut] = useState(false)

  const signOut = async () => {
    setSigningOut(true)
    try {
      await authService.logout()
    } catch {
      /* clear the local session even if the API is unavailable */
    }
    useAuthStore.getState().clearSession()
    // A full navigation: the maintenance state is re-read and the login page opens.
    window.location.assign('/login')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-v-bg px-4 py-12">
      <div className="v-card w-full max-w-md space-y-5 p-8 text-center shadow-v-shadow-md" role="alert">
        <div className="flex justify-center">
          <VotrixLogo size="lg" linkTo={null} />
        </div>
        <Wrench className="mx-auto h-10 w-10 text-v-warning" strokeWidth={1.5} aria-hidden />
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-v-text">{platformName} is under maintenance</h1>
          <p className="text-sm text-v-text-subtle">
            We&apos;re making improvements and will be back shortly. Only administrators can sign in right now. Please try
            again later.
          </p>
        </div>
        {isAuthenticated ? (
          <Button type="button" variant="secondary" onClick={signOut} loading={signingOut} className="w-full">
            Sign out
          </Button>
        ) : (
          // A real link (full page load) so the app re-checks the maintenance state.
          <a href="/login" className="inline-block text-sm font-medium text-v-text-muted hover:text-v-text">
            Administrator sign in
          </a>
        )}
      </div>
    </main>
  )
}
