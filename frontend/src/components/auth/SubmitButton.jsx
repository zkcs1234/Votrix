import Button from '@/components/ui/Button'

export default function SubmitButton({ loading, children }) {
  return (
    <Button type="submit" loading={loading} className="mt-2 w-full" size="lg">
      {children}
    </Button>
  )
}
