import { BarChartView } from '@/components/charts'

const MODULE_COLORS = {
  election: '#4f46e5',
  competition: '#0f766e',
  polling: '#c2410c',
}

export default function ParticipationSnapshot({ events = [], module, title, description }) {
  const data = [...events]
    .sort((left, right) => Number(right.rate ?? 0) - Number(left.rate ?? 0))
    .slice(0, 6)
    .map((event) => ({
      name: event.title?.length > 16 ? `${event.title.slice(0, 15)}…` : event.title,
      value: Number(event.rate ?? 0),
    }))

  if (!data.length) return null

  return (
    <section className="v-card-md" aria-label={title}>
      <div className="mb-2">
        <h3 className="v-section-title">{title}</h3>
        <p className="v-caption">{description}</p>
      </div>
      <BarChartView
        data={data}
        layout="horizontal"
        height={220}
        barSize={18}
        colors={[MODULE_COLORS[module]]}
        unit="%"
        valueFormatter={(value) => `${value}%`}
        className="w-full"
      />
    </section>
  )
}
