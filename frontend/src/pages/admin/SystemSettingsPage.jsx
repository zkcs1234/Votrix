import { useState, useEffect } from 'react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { INPUT_CLASS } from '@/utils/uiClasses'

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const [formData, setFormData] = useState({
    platform_name: 'Votrix',
    maintenance_mode: false,
    max_organizers: 100,
  })

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true)
        const { data } = await adminService.getSystemSettings()
        if (data.settings && data.settings.length > 0) {
          const newFormData = { ...formData }
          data.settings.forEach(setting => {
            newFormData[setting.setting_key] = setting.setting_value
          })
          setFormData(newFormData)
          setSettings(data.settings)
        }
      } catch (err) {
        setError('Failed to load system settings')
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      // Save each setting sequentially
      for (const [key, value] of Object.entries(formData)) {
        await adminService.updateSystemSetting({ key, value, description: `System setting for ${key}` })
      }
      setSuccess('Settings saved successfully.')
    } catch (err) {
      setError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-v-text">System Settings</h1>
        <p className="text-v-text-subtle">Configure global platform behavior.</p>
      </div>

      <Card>
        {loading ? (
          <div className="p-8 text-center text-v-text-subtle">Loading settings...</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6 p-6">
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-v-text">Platform Name</label>
                <input 
                  type="text" 
                  value={formData.platform_name} 
                  onChange={(e) => setFormData({...formData, platform_name: e.target.value})}
                  className={INPUT_CLASS}
                />
              </div>
              
              <div>
                <label className="mb-2 block text-sm font-medium text-v-text">Maximum Organizers Allowed</label>
                <input 
                  type="number" 
                  value={formData.max_organizers} 
                  onChange={(e) => setFormData({...formData, max_organizers: parseInt(e.target.value, 10)})}
                  className={INPUT_CLASS}
                />
              </div>

              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="maintenance"
                  checked={formData.maintenance_mode} 
                  onChange={(e) => setFormData({...formData, maintenance_mode: e.target.checked})}
                  className="h-4 w-4 rounded border-gray-300 text-v-primary focus:ring-v-primary"
                />
                <label htmlFor="maintenance" className="text-sm font-medium text-v-text">
                  Maintenance Mode (Restricts access for non-admins)
                </label>
              </div>
            </div>

            {error && <p className="text-sm text-v-danger">{error}</p>}
            {success && <p className="text-sm text-emerald-500">{success}</p>}

            <div className="flex justify-end border-t border-v-border pt-4">
              <Button type="submit" loading={saving}>Save Changes</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}
