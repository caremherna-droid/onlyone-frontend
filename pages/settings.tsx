import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import api from '../lib/api'
import { useAuth } from '../store/auth'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardHeader } from '../components/ui/card'

export default function SettingsPage() {
  const [ratePerMinute, setRatePerMinute] = useState<number>(10)
  const [privateRatePerMinute, setPrivateRatePerMinute] = useState<number>(11)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const auth = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!auth.token) {
      router.push('/auth/login')
      return
    }
    loadSettings()
  }, [auth.token])

  async function loadSettings() {
    try {
      const { data } = await api.get('/auth/me')
      if (data.user.role !== 'BROADCASTER') {
        router.push('/')
        return
      }
      setRatePerMinute(data.user.ratePerMinute || 10)
      setPrivateRatePerMinute(data.user.privateRatePerMinute || 11)
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  }

  async function saveRates() {
    setSaving(true)
    try {
      await api.patch('/users/me', {
        ratePerMinute,
        privateRatePerMinute
      })
      alert('Rates saved successfully!')
    } catch(e: any) {
      alert(e?.response?.data?.error || 'Failed to save rates')
    } finally {
      setSaving(false)
    }
  }

  if (!auth.token || auth.user?.role !== 'BROADCASTER') {
    return null
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-pink-600 mb-8">Settings</h1>
      
      <Card className="girly-card">
        <CardHeader>
          <h2 className="text-xl font-semibold text-pink-700">Streaming Rates</h2>
          <p className="text-sm text-gray-600 mt-1">Set your rates for public and private sessions</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label className="text-pink-700 font-medium">Public Rate (tokens per minute)</Label>
            <div className="flex gap-2 items-center mt-2">
              <Input 
                type="number" 
                className="girly-input flex-1" 
                value={ratePerMinute} 
                onChange={(e)=>setRatePerMinute(Number(e.target.value))} 
                min="1"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              ≈ {Math.ceil(ratePerMinute / 60 * 10)} tokens per 10 seconds
            </p>
            <p className="text-xs text-gray-400 mt-1">
              This rate applies when multiple viewers can join your session
            </p>
          </div>
          
          <div>
            <Label className="text-purple-700 font-medium">Private Rate (tokens per minute)</Label>
            <div className="flex gap-2 items-center mt-2">
              <Input 
                type="number" 
                className="girly-input flex-1" 
                value={privateRatePerMinute} 
                onChange={(e)=>setPrivateRatePerMinute(Number(e.target.value))} 
                min="1"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              ≈ {Math.ceil(privateRatePerMinute / 60 * 10)} tokens per 10 seconds
            </p>
            <p className="text-xs text-gray-400 mt-1">
              This rate applies when only one viewer can join your private session
            </p>
          </div>

          <div className="pt-4 border-t-2 border-pink-200">
            <Button 
              onClick={saveRates} 
              disabled={saving}
              className="w-full girly-button"
            >
              {saving ? 'Saving...' : 'Save Rates'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

