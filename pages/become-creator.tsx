import { useState, useEffect, useRef } from 'react'
import api from '../lib/api'
import { useAuth } from '../store/auth'
import { useRouter } from 'next/router'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { getImageUrl } from '../lib/utils'

export default function BecomeCreatorPage(){
  const [email, setEmail] = useState('')
  const [age, setAge] = useState('')
  const [bio, setBio] = useState('')
  const [phone, setPhone] = useState('')
  const [services, setServices] = useState<string[]>([''])
  const [profileImages, setProfileImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [payoutMethod, setPayoutMethod] = useState<'MPESA' | 'CRYPTO' | ''>('')
  const [payoutPhone, setPayoutPhone] = useState('')
  const [payoutAddress, setPayoutAddress] = useState('')
  const [error, setError] = useState<string|null>(null)
  const [loading, setLoading] = useState(false)
  const auth = useAuth()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Redirect if already a creator or not logged in
  useEffect(() => {
    if (!auth.token) {
      router.push('/auth/login?redirect=/become-creator')
      return
    }
    if (auth.user?.role === 'BROADCASTER' && auth.user?.creatorStatus === 'APPROVED') {
      router.push('/creators/dashboard')
    }
  }, [auth.token, auth.user?.role, auth.user?.creatorStatus, router])

  function addService() {
    if (services.length < 10) {
      setServices([...services, ''])
    }
  }

  function removeService(index: number) {
    if (services.length > 1) {
      setServices(services.filter((_, i) => i !== index))
    }
  }

  function updateService(index: number, value: string) {
    const newServices = [...services]
    newServices[index] = value
    setServices(newServices)
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    const newFiles: File[] = []
    const newPreviews: string[] = []
    
    files.forEach(file => {
      if (!file.type.startsWith('image/')) {
        alert('Please select image files only')
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size must be less than 5MB')
        return
      }
      if (profileImages.length + newFiles.length >= 6) {
        alert('Maximum 6 images allowed')
        return
      }
      newFiles.push(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        newPreviews.push(reader.result as string)
        if (newPreviews.length === newFiles.length) {
          setImagePreviews([...imagePreviews, ...newPreviews])
        }
      }
      reader.readAsDataURL(file)
    })
    
    setProfileImages([...profileImages, ...newFiles])
  }

  function removeImage(index: number) {
    setProfileImages(profileImages.filter((_, i) => i !== index))
    setImagePreviews(imagePreviews.filter((_, i) => i !== index))
  }

  async function submit(e: React.FormEvent){
    e.preventDefault()
    setError(null)
    setLoading(true)
    
    // Validation
    if (!email || !email.includes('@')) {
      setError('Please provide a valid email address')
      setLoading(false)
      return
    }
    
    if (!age || parseInt(age) < 18 || parseInt(age) > 100) {
      setError('Age must be between 18 and 100')
      setLoading(false)
      return
    }
    
    const validServices = services.filter(s => s.trim().length > 0)
    if (validServices.length < 1) {
      setError('Please provide at least one service')
      setLoading(false)
      return
    }
    
    if (profileImages.length < 2 || profileImages.length > 6) {
      setError('Please select 2-6 profile images')
      setLoading(false)
      return
    }
    
    if (!payoutMethod) {
      setError('Please select a payout method')
      setLoading(false)
      return
    }
    
    if (payoutMethod === 'MPESA' && !payoutPhone) {
      setError('Phone number is required for MPESA payout')
      setLoading(false)
      return
    }
    
    if (payoutMethod === 'CRYPTO' && !payoutAddress) {
      setError('Crypto address is required for crypto payout')
      setLoading(false)
      return
    }

    try{
      // Upload images first
      const imageUrls: string[] = []
      for (const image of profileImages) {
        const formData = new FormData()
        formData.append('photo', image)
        try {
          const { data } = await api.post('/users/me/photo', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          })
          if (data.user?.profilePhoto) {
            imageUrls.push(data.user.profilePhoto)
          }
        } catch (photoError) {
          console.error('Failed to upload image:', photoError)
        }
      }
      
      if (imageUrls.length < 2) {
        setError('Failed to upload images. Please try again.')
        setLoading(false)
        return
      }
      
      // Submit application
      const { data } = await api.post('/auth/become-creator', {
        email,
        age: parseInt(age),
        phone: phone.trim() || undefined,
        bio: bio.trim() || undefined,
        services: validServices,
        profileImages: imageUrls,
        payoutMethod,
        payoutDetails: payoutMethod === 'MPESA' 
          ? { phone: payoutPhone }
          : { address: payoutAddress }
      })
      
      alert('Application submitted! Waiting for admin approval.')
      router.push('/')
    }catch(e: any){
      const errorMsg = e?.response?.data?.error
      if (typeof errorMsg === 'string') {
        setError(errorMsg)
      } else if (errorMsg?.formErrors) {
        setError(errorMsg.formErrors.join(', '))
      } else {
        setError('Failed to submit application')
      }
    } finally {
      setLoading(false)
    }
  }

  // Don't render if redirecting
  if (!auth.token || (auth.user?.role === 'BROADCASTER' && auth.user?.creatorStatus === 'APPROVED')) {
    return null
  }

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        <Card className="girly-card">
          <CardHeader className="text-center">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">Become a Creator</h1>
            <p className="text-sm text-gray-600 mt-2">Complete your application to start earning</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="flex flex-col gap-6">
              {/* Email */}
              <div>
                <Label className="text-pink-700 font-medium">Email *</Label>
                <Input 
                  className="girly-input" 
                  type="email" 
                  placeholder="your@email.com" 
                  value={email} 
                  onChange={(e)=>setEmail(e.target.value)} 
                  required 
                />
              </div>

              {/* Age */}
              <div>
                <Label className="text-pink-700 font-medium">Age *</Label>
                <Input 
                  className="girly-input" 
                  type="number" 
                  min="18" 
                  max="100"
                  placeholder="18" 
                  value={age} 
                  onChange={(e)=>setAge(e.target.value)} 
                  required 
                />
                <p className="text-xs text-gray-500 mt-1">Must be 18 or older</p>
              </div>

              {/* Phone */}
              <div>
                <Label className="text-pink-700 font-medium">Phone Number</Label>
                <Input 
                  className="girly-input" 
                  type="tel" 
                  placeholder="2547XXXXXXXX" 
                  value={phone} 
                  onChange={(e)=>setPhone(e.target.value)} 
                />
                <p className="text-xs text-gray-500 mt-1">Optional - for account verification</p>
              </div>

              {/* Bio */}
              <div>
                <Label className="text-pink-700 font-medium">Bio / Description</Label>
                <Textarea 
                  className="girly-input" 
                  placeholder="Tell us about yourself, your interests, and what you offer..."
                  value={bio} 
                  onChange={(e)=>setBio(e.target.value)} 
                  rows={4}
                />
                <p className="text-xs text-gray-500 mt-1">Optional - describe yourself and what you offer</p>
              </div>

              {/* Services */}
              <div>
                <Label className="text-pink-700 font-medium">Services * (1-10 services)</Label>
                {services.map((service, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <Input 
                      className="girly-input flex-1" 
                      placeholder={`Service ${index + 1}`}
                      value={service} 
                      onChange={(e)=>updateService(index, e.target.value)} 
                    />
                    {services.length > 1 && (
                      <Button 
                        type="button"
                        variant="outline"
                        onClick={() => removeService(index)}
                        className="text-red-600"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
                {services.length < 10 && (
                  <Button 
                    type="button"
                    variant="outline"
                    onClick={addService}
                    className="mt-2"
                  >
                    + Add Service
                  </Button>
                )}
                <p className="text-xs text-gray-500 mt-1">List the services you offer (minimum 1, maximum 10)</p>
              </div>

              {/* Profile Images */}
              <div>
                <Label className="text-pink-700 font-medium">Profile Images * (2-6 images)</Label>
                <div className="grid grid-cols-3 gap-4 mt-2">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative">
                      <img 
                        src={preview} 
                        alt={`Preview ${index + 1}`} 
                        className="w-full h-32 object-cover rounded-lg border-2 border-pink-300"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {profileImages.length < 6 && (
                    <div 
                      className="w-full h-32 border-2 border-dashed border-pink-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-pink-500"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <span className="text-pink-600">+ Add Image</span>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <p className="text-xs text-gray-500 mt-1">Select 2-6 profile images (max 5MB each)</p>
              </div>

              {/* Payout Method */}
              <div>
                <Label className="text-pink-700 font-medium">Payout Method *</Label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="payoutMethod"
                      value="MPESA"
                      checked={payoutMethod === 'MPESA'}
                      onChange={(e) => setPayoutMethod(e.target.value as 'MPESA')}
                      className="w-4 h-4"
                    />
                    <span>MPESA</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="payoutMethod"
                      value="CRYPTO"
                      checked={payoutMethod === 'CRYPTO'}
                      onChange={(e) => setPayoutMethod(e.target.value as 'CRYPTO')}
                      className="w-4 h-4"
                    />
                    <span>Crypto</span>
                  </label>
                </div>
              </div>

              {/* Payout Details */}
              {payoutMethod === 'MPESA' && (
                <div>
                  <Label className="text-pink-700 font-medium">MPESA Phone Number *</Label>
                  <Input 
                    className="girly-input" 
                    type="tel" 
                    placeholder="2547XXXXXXXX" 
                    value={payoutPhone} 
                    onChange={(e)=>setPayoutPhone(e.target.value)} 
                    required 
                  />
                </div>
              )}

              {payoutMethod === 'CRYPTO' && (
                <div>
                  <Label className="text-pink-700 font-medium">Crypto Wallet Address *</Label>
                  <Input 
                    className="girly-input" 
                    type="text" 
                    placeholder="0x..." 
                    value={payoutAddress} 
                    onChange={(e)=>setPayoutAddress(e.target.value)} 
                    required 
                  />
                </div>
              )}

              {error && <p className="error-text text-sm error-bg p-2 rounded-lg error-border">{error}</p>}
              
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Submitting Application...' : 'Submit Application'}
              </Button>
              
              <p className="text-xs text-center text-gray-500">
                Your application will be reviewed by an administrator. <a href="/" className="text-pink-600 hover:underline">Cancel</a>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
