import { X } from 'lucide-react'
import SearchInput from '@/components/ui/SearchInput'
import { INPUT_CLASS } from '@/utils/uiClasses'

/**
 * Search + faceted-filter toolbar driven by useTableFilter. Renders the search
 * box, one dropdown per facet field (each option carries its live count), a
 * "Showing X of Y" summary, and a Clear button when anything is active.
 *
 * @param {object} props
 * @param {string} props.search
 * @param {(v: string) => void} props.onSearchChange
 * @param {string} [props.searchPlaceholder]
 * @param {Array}  [props.facetFields]     [{ id, label, accessor }]
 * @param {object} [props.facets]          { [fieldId]: {value, count}[] }
 * @param {object} [props.activeFilters]   { [fieldId]: value }
 * @param {(id: string, v: string) => void} [props.onFilterChange]
 * @param {() => void} [props.onClear]
 * @param {boolean} [props.hasActiveFilters]
 * @param {number} props.resultCount
 * @param {number} props.totalCount
 * @param {string} [props.noun]            Plural label for the summary (e.g. 'voters').
 * @param {React.ReactNode} [props.actions] Extra controls rendered on the right.
 */
export default function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  facetFields = [],
  facets = {},
  activeFilters = {},
  onFilterChange,
  onClear,
  hasActiveFilters = false,
  resultCount,
  totalCount,
  noun = 'results',
  actions = null,
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="max-w-xs"
        />

        {facetFields.map((field) => {
          const options = facets[field.id] ?? []
          // Hide a facet only when it has no values at all. A single-value facet
          // still shows so its count is visible (e.g. "BSCS - 4A (2)"); the
          // caller decides which fields are worth faceting in the first place.
          if (options.length === 0 && !activeFilters[field.id]) return null
          return (
            <select
              key={field.id}
              className={`${INPUT_CLASS} w-auto`}
              value={activeFilters[field.id] ?? ''}
              onChange={(e) => onFilterChange?.(field.id, e.target.value)}
              aria-label={`Filter by ${field.label}`}
            >
              <option value="">All {field.label.toLowerCase()}</option>
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.value} ({opt.count})
                </option>
              ))}
            </select>
          )
        })}

        {actions}

        {hasActiveFilters && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 text-sm text-v-text-muted hover:text-v-text"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
            Clear
          </button>
        )}
      </div>

      <p className="text-sm text-v-text-subtle">
        Showing <span className="font-medium text-v-text">{resultCount}</span> of {totalCount} {noun}
      </p>
    </div>
  )
}
