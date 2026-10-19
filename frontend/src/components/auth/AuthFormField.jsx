// Label + control + helper/error text. `required` adds the Figma asterisk and
// `hint` shows supporting text (e.g. "At least 8 characters.") until an error
// replaces it.
export default function AuthFormField({ label, id, error, hint, required = false, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-v-text">
        {label}
        {required && (
          <span className="ml-0.5 text-v-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-sm text-v-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-v-text-subtle">{hint}</p>
      )}
    </div>
  )
}
