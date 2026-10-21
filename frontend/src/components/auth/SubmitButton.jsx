import Button from '@/components/ui/Button'

export default function SubmitButton({ loading, disabled, children }) {
  return (
    <Button type="submit" loading={loading} disabled={disabled} className="mt-2 w-full" size="lg">
      {children}
    </Button>
  )
}
