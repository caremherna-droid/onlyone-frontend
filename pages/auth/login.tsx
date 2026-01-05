import { useState } from 'react'
import api from '../../lib/api'
import { useAuth } from '../../store/auth'
import { useRouter } from 'next/router'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardHeader } from '../../components/ui/card'

export default function LoginPage(){
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string|null>(null)
  const setAuth = useAuth((s) => s.setAuth)
  const router = useRouter()

  async function submit(e: React.FormEvent){
    e.preventDefault()
    setError(null)
    try{
      const { data } = await api.post('/auth/login', { identifier, password })
      
      // Check account status
      if (data.user?.accountStatus === 'BANNED') {
        setError('Your account has been banned. Please contact support.')
        return
      } else if (data.user?.accountStatus === 'SUSPENDED') {
        setError('Your account has been suspended. Please contact support.')
        return
      }
      
      setAuth(data.token, data.user)
      router.push('/wallet')
    }catch(e: any){
      const errorMsg = e?.response?.data?.error || 'Login failed'
      setError(errorMsg)
    }
  }

  return (
    <main className="min-h-screen p-6 flex items-center justify-center">
      <Card className="w-full max-w-md girly-card">
        <CardHeader className="text-center">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">Welcome Back</h1>
          <p className="text-sm text-gray-600 mt-2">Login to your account</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <Label className="text-pink-700 font-medium">Email or Username</Label>
              <Input className="girly-input" placeholder="you@example.com or username" value={identifier} onChange={(e)=>setIdentifier(e.target.value)} />
            </div>
            <div>
              <Label className="text-pink-700 font-medium">Password</Label>
              <Input className="girly-input" placeholder="••••••••" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 p-2 rounded-lg border border-red-200">{error}</p>}
            <Button type="submit" className="w-full">Login</Button>
            <p className="text-xs text-center text-gray-500">
              Don't have an account? <a href="/auth/register" className="text-pink-600 hover:underline">Sign up</a>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
