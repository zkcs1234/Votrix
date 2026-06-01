import { useState, useEffect } from 'react'
import { adminService } from '@/services/admin.service'
import Card from '@/components/ui/Card'
import { format } from 'date-fns'

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true)
        const { data } = await adminService.getAuditLogs()
        setLogs(data.logs || [])
      } catch (err) {
        setError('Failed to load audit logs')
      } finally {
        setLoading(false)
      }
    }
    fetchLogs()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-text">Audit Logs</h1>
        <p className="text-v-text-subtle">Review administrative and system actions for security and compliance.</p>
      </div>

      <Card>
        {loading ? (
          <div className="p-8 text-center text-v-text-subtle">Loading logs...</div>
        ) : error ? (
          <div className="p-8 text-center text-v-danger">{error}</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-v-text-subtle">No audit logs found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-v-text">
              <thead className="bg-v-surface-elevated text-xs font-semibold uppercase text-v-text-subtle">
                <tr>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Entity</th>
                  <th className="px-6 py-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v-border">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-v-surface-elevated/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4">{log.users?.email || 'System'}</td>
                    <td className="px-6 py-4 capitalize">{log.entity || 'N/A'}</td>
                    <td className="px-6 py-4">
                      {log.details ? (
                        <pre className="text-xs text-v-text-muted overflow-hidden overflow-ellipsis max-w-[200px]">
                          {JSON.stringify(log.details)}
                        </pre>
                      ) : (
                        '-'
                      )}
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
