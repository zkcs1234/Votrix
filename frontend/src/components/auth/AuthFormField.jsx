export default function AuthFormField({ label, id, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-v-text-muted">
        {label}
      </label>
      {children}
      {error && <p className="mt-1.5 text-sm text-v-danger">{error}</p>}
    </div>
  )
}
