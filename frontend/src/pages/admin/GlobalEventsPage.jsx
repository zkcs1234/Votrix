import { useState, useEffect } from 'react'
import { adminService } from '@/services/admin.service'
import Card from '@/components/ui/Card'
import { format } from 'date-fns'

export default function GlobalEventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true)
        const { data } = await adminService.getGlobalEvents()
        setEvents(data.events || [])
      } catch (err) {
        setError('Failed to load global events')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchEvents()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-text">Global Events</h1>
        <p className="text-v-text-subtle">Monitor all elections, pageants, and polls across the platform.</p>
      </div>

      <Card>
        {loading ? (
          <div className="p-8 text-center text-v-text-subtle">Loading events...</div>
        ) : error ? (
          <div className="p-8 text-center text-v-danger">{error}</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-v-text-subtle">No events found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-v-text">
              <thead className="bg-v-surface-elevated text-xs font-semibold uppercase text-v-text-subtle">
                <tr>
                  <th className="px-6 py-4">Title</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Organization</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Date Range</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v-border">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-v-surface-elevated/50">
                    <td className="px-6 py-4 font-medium">{event.title}</td>
                    <td className="px-6 py-4 capitalize">{event.event_type}</td>
                    <td className="px-6 py-4">{event.organizations?.organization_name || 'N/A'}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-full bg-v-primary/10 px-2.5 py-0.5 text-xs font-medium text-v-primary capitalize">
                        {event.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {event.start_date && event.end_date 
                        ? `${format(new Date(event.start_date), 'MMM d, yyyy')} - ${format(new Date(event.end_date), 'MMM d, yyyy')}` 
                        : 'Not set'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
