import { Search } from 'lucide-react'

export default function SearchInput({
  placeholder = 'Search...',
  value,
  onChange,
  className = '',
  disabled = false,
}) {
  return (
    <div className={`v-search-input ${className}`}>
      <Search className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
      <input
        type="search"
        className="v-input"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  )
}