import { useEffect, useMemo, useRef, useState } from 'react'
import { Users, UserPlus, Upload, Download, UserCheck, Archive } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import StatCard from '@/components/ui/StatCard'
import PageHeader from '@/components/ui/PageHeader'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { downloadBlob } from '@/utils/csvDownload'
import AddStudentModal from './AddStudentModal'
import EditStudentModal from './EditStudentModal'
import ViewStudentDetailsModal from './ViewStudentDetailsModal'
import AccountActionsMenu from './AccountActionsMenu'
import AccountStatusConfirmModal from './AccountStatusConfirmModal'
import CsvImportPreview from './CsvImportPreview'
import { getEmailOutcomeMessage } from '@/utils/emailOutcome'

const STUDENT_PREVIEW_COLUMNS = [
  { header: 'Name', cell: (row) => [row.first_name, row.last_name].filter(Boolean).join(' ') },
  { header: 'Email', cell: (row) => row.email },
  { header: 'School ID', cell: (row) => row.school_id },
  { header: 'Program', cell: (row) => row.program },
]

const STATUS_TONE = { active: 'success', suspended: 'danger', archived: 'default' }

function fullName(s) {
  return [s.firstName, s.lastName].filter(Boolean).join(' ') || '—'
}

export default function StudentsPanel() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modal, setModal] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [viewTarget, setViewTarget] = useState(null)
  const [statusTarget, setStatusTarget] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [registering, setRegistering] = useState(false)
  const fileRef = useRef(null)
  const [resendingId, setResendingId] = useState(null)
  const { success, warning, error: toastError } = useToast()

  useEffect(() => {
    fetchStudents()
  }, [])

  const fetchStudents = async () => {
    setLoading(true)
    try {
      // A student has ONE participant type (STUDENT) that covers elections and
      // polls, so there is a single list; the voters and respondents endpoints
      // return the same students.
      const { data } = await adminService.getVoters()
      const list = data.voters || data.participants || []
      setStudents([...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
    } catch (err) {
      toastError('Failed to load students')
    } finally {
      setLoading(false)
    }
  }

  const summary = useMemo(() => {
    const total = students.length
    const active = students.filter(s => s.accountStatus === 'active').length
    const archived = students.filter(s => s.accountStatus === 'archived').length
    return { total, active, archived }
  }, [students])

  const filteredStudents = useMemo(() => {
    const searchLower = search.trim().toLowerCase()
    return students.filter(student => {
      const matchesSearch =
        !searchLower ||
        student.email?.toLowerCase().includes(searchLower) ||
        student.firstName?.toLowerCase().includes(searchLower) ||
        student.lastName?.toLowerCase().includes(searchLower) ||
        student.schoolId?.toLowerCase().includes(searchLower)

      const matchesStatus =
        statusFilter === 'all' || student.accountStatus === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [students, search, statusFilter])

  const handleStatus = async (student, accountStatus) => {
    setSavingId(student.id)
    try {
      // One account, one status: a single call covers elections and polls.
      await adminService.updateVoterStatus(student.id, accountStatus)

      success(`Student account ${accountStatus}`)
      setStatusTarget(null)
      await fetchStudents()
    } catch (err) {
      toastError(getErrorMessage(err, 'Failed to update status'))
    } finally {
      setSavingId(null)
    }
  }

  const handleResend = async (student) => {
    setResendingId(student.id)
    try {
      const { data } = await adminService.resendVoterCredentials(student.id)
      if (data.email?.sent) success(`New credentials emailed to ${student.email}`)
      else warning(getEmailOutcomeMessage(data.email))
    } catch (err) {
      toastError(getErrorMessage(err, 'Failed to resend credentials'))
    } finally {
      setResendingId(null)
    }
  }

  const handleExport = async () => {
    try {
      // Export voters (which includes student data)
      const response = await adminService.exportVoters()
      downloadBlob(response.data, 'students-export.csv')
      success('Students exported successfully')
    } catch (err) {
      toastError('Failed to export students')
    }
  }

  const downloadTemplate = async () => {
    try {
      const response = await adminService.getVoterCsvTemplate()
      downloadBlob(response.data, 'student-import-template.csv')
    } catch (err) {
      toastError('Failed to download form')
    }
  }

  const handleCsvFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const { data } = await adminService.previewVotersCsv(file)
      setPreview({ data: data.preview, filename: file.name })
    } catch (err) {
      toastError(getErrorMessage(err, 'Failed to process CSV'))
    }
    e.target.value = ''
  }

  const handleCsvRegister = async () => {
    if (!preview?.data) return

    setRegistering(true)
    try {
      // Registering creates each student with the single STUDENT type; there is
      // nothing further to add per student.
      const { data } = await adminService.registerVotersCsv(preview.data)

      setPreview({ ...preview, importResult: data })
      await fetchStudents()
    } catch (err) {
      toastError(getErrorMessage(err, 'Import failed'))
    } finally {
      setRegistering(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-v-surface-elevated" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="v-card-sm h-20 animate-pulse bg-v-surface-elevated" />
          ))}
        </div>
        <Card padding="sm">
          <div className="h-96 animate-pulse bg-v-surface-elevated" />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="Students can participate in both elections and polls automatically"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={downloadTemplate}>
              <Download className="h-4 w-4" strokeWidth={1.5} />
              Form
            </Button>
            <Button variant="secondary" onClick={handleExport}>
              <Download className="h-4 w-4" strokeWidth={1.5} />
              Export CSV
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" strokeWidth={1.5} />
              Import CSV
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleCsvFile} />
            <Button onClick={() => setModal('add')}>
              <UserPlus className="h-4 w-4" strokeWidth={2} />
              Add Student
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total Students" value={summary.total} icon={Users} />
        <StatCard label="Active" value={summary.active} icon={UserCheck} />
        <StatCard label="Archived" value={summary.archived} icon={Archive} />
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name, email, or school ID..."
            className="w-full sm:w-80"
          />
          <div className="flex items-center gap-2">
            <label htmlFor="status-filter" className="v-label whitespace-nowrap">
              Status:
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="v-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>School ID</th>
                <th>Program</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-v-text-tertiary">
                    {search || statusFilter !== 'all' ? 'No students match your filters' : 'No students yet'}
                  </td>
                </tr>
              ) : (
                filteredStudents.map(student => (
                  <tr key={student.id}>
                    <td>{fullName(student)}</td>
                    <td>{student.email}</td>
                    <td>{student.schoolId || '—'}</td>
                    <td>{student.program || '—'}</td>
                    <td>
                      <Badge tone={STATUS_TONE[student.accountStatus] || 'default'}>
                        {student.accountStatus}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <AccountActionsMenu
                        status={student.accountStatus}
                        onEdit={() => setEditTarget(student)}
                        onView={() => setViewTarget(student)}
                        onResend={student.mustChangePassword && student.accountStatus === 'active' ? () => handleResend(student) : undefined}
                        resending={resendingId === student.id}
                        busyStatus={savingId === student.id ? statusTarget?.accountStatus : null}
                        onStatusChange={(change) =>
                          setStatusTarget({ ...change, user: student, name: fullName(student), email: student.email })
                        }
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Student Modal */}
      {modal === 'add' && (
        <AddStudentModal
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            fetchStudents()
          }}
        />
      )}

      {/* Edit Student Modal */}
      {editTarget && (
        <EditStudentModal
          student={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null)
            fetchStudents()
          }}
        />
      )}

      {/* View Student Details Modal */}
      {viewTarget && (
        <ViewStudentDetailsModal
          student={viewTarget}
          onClose={() => setViewTarget(null)}
        />
      )}

      {/* Status Change Confirmation */}
      <AccountStatusConfirmModal
        target={statusTarget}
        accountType="Student"
        onClose={() => setStatusTarget(null)}
        onConfirm={() => handleStatus(statusTarget.user, statusTarget.accountStatus)}
        loading={Boolean(savingId)}
      />

      {/* CSV Import Preview/Results */}
      {preview && (
        <CsvImportPreview
          preview={{ ...preview.data, importResult: preview.importResult }}
          columns={STUDENT_PREVIEW_COLUMNS}
          noun="students"
          resultsFilename="student-import-results.csv"
          errorsFilename="student-import-errors.csv"
          onRegister={handleCsvRegister}
          registering={registering}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}
