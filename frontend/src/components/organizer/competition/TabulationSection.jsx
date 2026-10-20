export default function TabulationSection({ section, label, children }) {
  return <section id={`tabulation-${section}`} aria-label={label} tabIndex={-1} className="v-tabulation-page-section min-w-0 space-y-4">
    {children}
  </section>
}
