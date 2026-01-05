import { useEffect, useState, useRef } from 'react'
import api from '../lib/api'
import { useAuth } from '../store/auth'
import { useRouter } from 'next/router'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { getImageUrl } from '../lib/utils'

export default function ProfilePage(){
  const auth = useAuth()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [message, setMessage] = useState<string|null>(null)
  
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null)
  const [ratePerMinute, setRatePerMinute] = useState<number>(10)
  const [privateRatePerMinute, setPrivateRatePerMinute] = useState<number>(11)

  useEffect(()=>{
    if (!auth.token) {
      router.push('/auth/login?redirect=/profile')
      return
    }
    async function load(){
      setLoading(true)
      try{
        const { data } = await api.get('/users/me')
        const u = data.user
        setUsername(u.username || '')
        setEmail(u.email || '')
        setPhone(u.phone || '')
        setProfilePhoto(u.profilePhoto || null)
        setRatePerMinute(u.ratePerMinute || 10)
        setPrivateRatePerMinute(u.privateRatePerMinute || 11)
      } catch (e: any) {
        alert('Failed to load profile')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [auth.token, router])

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB')
      return
    }

    setUploadingPhoto(true)
    try {
      const formData = new FormData()
      formData.append('photo', file)
      
      const { data } = await api.post('/users/me/photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      setProfilePhoto(data.user.profilePhoto)
      setMessage('Profile photo updated!')
      setTimeout(() => setMessage(null), 3000)
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to upload photo')
    } finally {
      setUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function save(){
    setSaving(true)
    setMessage(null)
    try{
      await api.patch('/users/me', { 
        username, 
        email, 
        phone: phone || undefined,
        ratePerMinute,
        privateRatePerMinute
      })
      setMessage('Profile updated!')
      setTimeout(() => setMessage(null), 3000)
    } catch (e: any){
      setMessage(e?.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen p-6 flex items-center justify-center">
        <p className="text-pink-600">Loading profile...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-pink-600">My Profile</h1>

        <Card className="girly-card">
          <CardHeader>
            <h2 className="text-xl font-semibold text-pink-700">Profile Photo</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-6">
              {profilePhoto ? (
                <img 
                  src={getImageUrl(profilePhoto) || ''} 
                  alt="Profile" 
                  className="w-24 h-24 rounded-full object-cover border-2 border-pink-300"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-r from-pink-400 to-purple-500 flex items-center justify-center text-white text-2xl font-bold">
                  {username.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <Button 
                  variant="outline" 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto ? 'Uploading...' : 'Change Photo'}
                </Button>
                <p className="text-xs text-gray-500 mt-1">Max 5MB, JPG/PNG/WebP</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="girly-card">
          <CardHeader>
            <h2 className="text-xl font-semibold text-pink-700">Personal Information</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-pink-700 font-medium">Username *</Label>
              <Input 
                className="girly-input" 
                value={username} 
                onChange={(e)=>setUsername(e.target.value)} 
                required 
              />
            </div>
            <div>
              <Label className="text-pink-700 font-medium">Email *</Label>
              <Input 
                className="girly-input" 
                type="email" 
                value={email} 
                onChange={(e)=>setEmail(e.target.value)} 
                required 
              />
            </div>
            <div>
              <Label className="text-pink-700 font-medium">Phone</Label>
              <Input 
                className="girly-input" 
                placeholder="2547XXXXXXXX" 
                value={phone} 
                onChange={(e)=>setPhone(e.target.value)} 
              />
            </div>
            <Button onClick={save} disabled={saving} className="w-full girly-button">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            {message && (
              <p className={`text-sm p-2 rounded-lg ${
                message.includes('updated') || message.includes('!') 
                  ? 'success-bg success-text' 
                  : 'error-bg error-text'
              }`}>
                {message}
              </p>
            )}
          </CardContent>
        </Card>

        {auth.user?.role === 'BROADCASTER' && (
          <Card className="girly-card">
            <CardHeader>
              <h2 className="text-xl font-semibold text-purple-700">Creator Settings</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-purple-700 font-medium">Public Rate (tokens per minute)</Label>
                <Input 
                  type="number" 
                  className="girly-input" 
                  value={ratePerMinute} 
                  onChange={(e)=>setRatePerMinute(Number(e.target.value))} 
                />
                <p className="text-xs text-gray-500 mt-1">≈ {Math.ceil(ratePerMinute / 60 * 10)} tokens per 10 seconds</p>
              </div>
              <div>
                <Label className="text-purple-700 font-medium">Private Rate (tokens per minute)</Label>
                <Input 
                  type="number" 
                  className="girly-input" 
                  value={privateRatePerMinute} 
                  onChange={(e)=>setPrivateRatePerMinute(Number(e.target.value))} 
                />
                <p className="text-xs text-gray-500 mt-1">≈ {Math.ceil(privateRatePerMinute / 60 * 10)} tokens per 10 seconds</p>
              </div>
              <Button onClick={save} disabled={saving} className="w-full girly-button">
                {saving ? 'Saving...' : 'Save Rates'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}
