export default function Card({ children, className = '', padding = true }) {
  return (
    <div className={`v-card ${padding ? 'p-6' : ''} ${className}`}>{children}</div>
  )
}
