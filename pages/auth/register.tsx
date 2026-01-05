import { useState, useRef } from 'react'
import api from '../../lib/api'
import { useAuth } from '../../store/auth'
import { useRouter } from 'next/router'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardHeader } from '../../components/ui/card'
import { getImageUrl } from '../../lib/utils'

export default function RegisterPage(){
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null)
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null)
  const [error, setError] = useState<string|null>(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const setAuth = useAuth((s) => s.setAuth)
  const router = useRouter()

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
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

    setProfilePhoto(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setProfilePhotoPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  async function submit(e: React.FormEvent){
    e.preventDefault()
    setError(null)
    setLoading(true)
    
    if (!username || !email) {
      setError('Username and email are required')
      setLoading(false)
      return
    }
    
    try{
      // First register user
      const { data } = await api.post('/auth/register', { 
        username, 
        email, 
        phone: phone || undefined, 
        password 
      })
      
      // If profile photo selected, upload it
      if (profilePhoto) {
        try {
          const formData = new FormData()
          formData.append('photo', profilePhoto)
          await api.post('/users/me/photo', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          })
        } catch (photoError) {
          console.error('Failed to upload profile photo:', photoError)
          // Continue even if photo upload fails
        }
      }
      
      setAuth(data.token, data.user)
      router.push('/')
    }catch(e: any){
      setError(e?.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen p-6 flex items-center justify-center">
      <Card className="w-full max-w-md girly-card">
        <CardHeader className="text-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">Create Account</h1>
          <p className="text-sm text-gray-600 mt-2">Join our community</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <Label className="text-pink-700 font-medium">Profile Photo (Optional)</Label>
              <div className="flex items-center gap-4 mt-2">
                {profilePhotoPreview ? (
                  <img 
                    src={profilePhotoPreview} 
                    alt="Preview" 
                    className="w-16 h-16 rounded-full object-cover border-2 border-pink-300"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-r from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold">
                    {username.charAt(0).toUpperCase() || '?'}
                  </div>
                )}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                  <Button 
                    type="button"
                    variant="outline" 
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm"
                  >
                    Choose Photo
                  </Button>
                  {profilePhoto && (
                    <Button 
                      type="button"
                      variant="ghost" 
                      onClick={() => {
                        setProfilePhoto(null)
                        setProfilePhotoPreview(null)
                        if (fileInputRef.current) fileInputRef.current.value = ''
                      }}
                      className="text-xs text-gray-500 ml-2"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">Max 5MB, JPG/PNG/WebP</p>
            </div>
            <div>
              <Label className="text-pink-700 font-medium">Username *</Label>
              <Input className="girly-input" placeholder="Choose a username" value={username} onChange={(e)=>setUsername(e.target.value)} required />
            </div>
            <div>
              <Label className="text-pink-700 font-medium">Email *</Label>
              <Input className="girly-input" type="email" placeholder="your@email.com" value={email} onChange={(e)=>setEmail(e.target.value)} required />
            </div>
            <div>
              <Label className="text-pink-700 font-medium">Phone (Optional)</Label>
              <Input className="girly-input" placeholder="2547XXXXXXXX" value={phone} onChange={(e)=>setPhone(e.target.value)} />
            </div>
            <div>
              <Label className="text-pink-700 font-medium">Password *</Label>
              <Input className="girly-input" type="password" placeholder="••••••••" value={password} onChange={(e)=>setPassword(e.target.value)} required />
              <div className="text-xs text-gray-500 mt-1 space-y-1">
                <p>Password must contain:</p>
                <ul className="list-disc list-inside ml-2 space-y-0.5">
                  <li className={password.length >= 8 ? 'text-green-600' : ''}>At least 8 characters</li>
                  <li className={/[a-z]/.test(password) ? 'text-green-600' : ''}>One lowercase letter</li>
                  <li className={/[A-Z]/.test(password) ? 'text-green-600' : ''}>One uppercase letter</li>
                  <li className={/\d/.test(password) ? 'text-green-600' : ''}>One number</li>
                  <li className={/[@$!%*?&]/.test(password) ? 'text-green-600' : ''}>One special character (@$!%*?&)</li>
                </ul>
              </div>
            </div>
            {error && <p className="error-text text-sm error-bg p-2 rounded-lg error-border">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </Button>
            <p className="text-xs text-center text-gray-500">
              Already have an account? <a href="/auth/login" className="text-pink-600 hover:underline">Login</a>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
