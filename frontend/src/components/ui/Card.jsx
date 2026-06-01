const paddingMap = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
}

export default function Card({ children, className = '', padding = 'md' }) {
  const paddingClass = padding === true ? 'p-6' : paddingMap[padding] || 'p-6'
  return (
    <div className={`v-card ${paddingClass} ${className}`}>{children}</div>
  )
}
