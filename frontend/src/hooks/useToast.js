import { useToastStore } from '@/store/toast.store'

export function useToast() {
  const success = useToastStore((s) => s.success)
  const error = useToastStore((s) => s.error)
  const info = useToastStore((s) => s.info)
  return { success, error, info }
}
