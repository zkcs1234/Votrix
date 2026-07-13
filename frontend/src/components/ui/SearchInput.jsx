import { Search } from 'lucide-react'

export default function SearchInput({
  placeholder = 'Search...',
  value,
  onChange,
  className = '',
  disabled = false,
}) {
  return (
    <div className={`relative flex items-center w-full ${className}`}>
      <Search 
        className="absolute left-3 h-4 w-4 text-v-text-muted pointer-events-none" 
        strokeWidth={2} 
      />
      <input
        type="search"
        className="w-full pl-9 pr-4 py-2 text-sm text-v-text bg-v-surface-elevated border border-v-border-strong hover:border-v-text-muted focus:border-v-primary focus:bg-v-surface focus:ring-2 focus:ring-v-primary/20 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all placeholder:text-v-text-subtle disabled:opacity-50 disabled:cursor-not-allowed"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  )
}