export function Table({ children, className = '' }) {
  return (
    <div className={`v-table-wrap overflow-x-auto ${className}`}>
      <table className="v-table">{children}</table>
    </div>
  )
}

export function TableHead({ children }) {
  return <thead>{children}</thead>
}

export function TableBody({ children }) {
  return <tbody>{children}</tbody>
}

export function TableRow({ children, className = '' }) {
  return <tr className={className}>{children}</tr>
}

export function TableHeaderCell({ children, className = '' }) {
  return <th className={className}>{children}</th>
}

export function TableCell({ children, className = '' }) {
  return <td className={className}>{children}</td>
}
