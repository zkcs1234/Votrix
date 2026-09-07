import { useToastStore } from '@/store/toast.store'

export function useToast() {
  const success = useToastStore((s) => s.success)
  const error = useToastStore((s) => s.error)
  const warning = useToastStore((s) => s.warning)
  const info = useToastStore((s) => s.info)
  return { success, error, warning, info }
}
