export default function Input({ className = '', ...props }) {
  return <input className={`v-input ${className}`} {...props} />
}
