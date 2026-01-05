import { useEffect, useState } from 'react'
import api from '../lib/api'
import { useAuth } from '../store/auth'
import { useRouter } from 'next/router'
import { Button } from '../components/ui/button'
import { getImageUrl } from '../lib/utils'

export default function BrowsePage(){
  const [users, setUsers] = useState<any[]>([])
  const [privateSessions, setPrivateSessions] = useState<any[]>([])
  const [balance, setBalance] = useState<number>(0)
  const [loading, setLoading] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'public' | 'private'>('public')
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const auth = useAuth()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(()=>{
    async function load(){
      try {
        const { data } = await api.get('/users/streamers')
        setUsers(data.users || [])
      } catch {}
      try {
        const { data } = await api.get('/sessions?private=true')
        setPrivateSessions(data.sessions || [])
      } catch {}
      if (auth.token) {
        try {
          const { data } = await api.get('/wallet/balance')
          setBalance(data.balance || 0)
        } catch {}
      }
    }
    load()
    const interval = setInterval(load, 5000) // Refresh every 5 seconds
    return () => clearInterval(interval)
  },[auth.token])

  async function view(broadcasterId: string, activeSession: any){
    if (!auth.token) {
      router.push('/auth/login?redirect=/browse')
      return
    }

    if (!activeSession) {
      alert('This creator is not live right now')
      return
    }

    const ratePerMinute = activeSession.isPrivate 
      ? Math.ceil(activeSession.ratePerSecond * 60)
      : Math.ceil(activeSession.ratePerSecond * 60)
    
    // Need at least 1 minute worth of tokens
    const minRequired = ratePerMinute

    if (balance < minRequired) {
      if (confirm(`You need at least ${minRequired} tokens to join. Go to wallet?`)) {
        router.push('/wallet')
      }
      return
    }

    setLoading(broadcasterId)
    try {
      // Join existing session
      const { data } = await api.post(`/sessions/${activeSession.id}/join`)
      router.push('/live?sessionId=' + activeSession.id)
    } catch(e: any) {
      alert(e?.response?.data?.error || 'Failed to join session')
    } finally {
      setLoading(null)
    }
  }

  if (!mounted) {
    return (
      <main className="min-h-screen p-6 max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-pink-600 mb-2">
            Live Sessions
          </h1>
          <p className="text-gray-600">Join live sessions. Pay only for the time you stay.</p>
        </div>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-pink-600 mb-2">
          Live Sessions
        </h1>
        <p className="text-gray-600">Join live sessions. Pay only for the time you stay.</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-4 border-b-2 border-pink-200">
        <button
          onClick={() => setActiveTab('public')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'public'
              ? 'text-pink-600 border-b-2 border-pink-600 -mb-[2px]'
              : 'text-gray-600 hover:text-pink-500'
          }`}
        >
          Public Live Cams
        </button>
        <button
          onClick={() => setActiveTab('private')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'private'
              ? 'text-pink-600 border-b-2 border-pink-600 -mb-[2px]'
              : 'text-gray-600 hover:text-pink-500'
          }`}
        >
          Private Rooms
        </button>
      </div>

      {!auth.token && (
        <div className="girly-card p-4 mb-6 girly-bg border-2 border-pink-300">
          <p className="text-sm text-gray-500">
            💡 <strong>Sign in</strong> to join live sessions. <a href="/auth/login" className="text-pink-600 hover:underline font-medium">Login</a> or <a href="/auth/register" className="text-pink-600 hover:underline font-medium">Register</a>
          </p>
        </div>
      )}

      {activeTab === 'public' ? (
        users.length === 0 ? (
          <div className="girly-card p-8 text-center">
            <p className="text-gray-500">No creators are live right now. Check back later!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {users.map((u)=> {
            const activeSession = u.activeSession
            const ratePerMinute = activeSession 
              ? Math.ceil(activeSession.ratePerSecond * 60)
              : (u.ratePerMinute || 0)
            
            return (
              <div key={u.id} className="girly-card p-5 hover:shadow-lg transition-all hover:scale-[1.02]">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg text-pink-700">{u.username}</h3>
                      {activeSession && (
                        <span className="px-2 py-1 bg-red-500 text-white text-xs rounded-full">LIVE</span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {ratePerMinute > 0 ? (
                        <>
                          <span className="text-2xl font-bold text-purple-600">{ratePerMinute}</span>
                          <span className="text-sm text-gray-600">tokens/min</span>
                          {activeSession?.isPrivate && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">Private</span>
                          )}
                        </>
                      ) : (
                        <span className="text-sm font-medium success-text success-bg px-2 py-1 rounded-full">Free</span>
                      )}
                    </div>
                    {ratePerMinute > 0 && (
                      <p className="text-xs text-gray-500 mt-1">≈ {Math.ceil(ratePerMinute / 60 * 10)} tokens per 10 seconds</p>
                    )}
                    {activeSession && (
                      <p className="text-xs text-gray-500 mt-1">👁️ {activeSession.viewerCount} viewers</p>
                    )}
                  </div>
                  {u.profilePhoto ? (
                    <img 
                      src={getImageUrl(u.profilePhoto) || ''} 
                      alt={u.username}
                      className="w-12 h-12 rounded-full object-cover border-2 border-pink-200"
                    />
                  ) : (
                  <div className="w-12 h-12 rounded-full bg-pink-500 flex items-center justify-center text-white font-bold">
                    {u.username.charAt(0).toUpperCase()}
                  </div>
                  )}
                </div>
                {activeSession ? (
                  <Button 
                    onClick={()=>view(u.id, activeSession)} 
                    disabled={loading === u.id}
                    className="w-full girly-button"
                  >
                    {loading === u.id ? 'Joining...' : `Join Live Session`}
                  </Button>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-2">Not live</p>
                )}
                {ratePerMinute > 0 && balance < ratePerMinute && activeSession && (
                  <p className="text-xs error-text mt-2 text-center">⚠️ Insufficient tokens</p>
                )}
              </div>
            )
          })}
        </div>
        )
      ) : (
        privateSessions.length === 0 ? (
          <div className="girly-card p-8 text-center">
            <p className="text-gray-500">No private rooms available right now. Check back later!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {privateSessions.map((session) => {
              const broadcaster = session.broadcaster
              return (
                <div key={session.id} className="girly-card p-5 hover:shadow-lg transition-all hover:scale-[1.02]">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-lg text-pink-700">{broadcaster?.username || 'Unknown'}</h3>
                        <span className="px-2 py-1 bg-red-500 text-white text-xs rounded-full">LIVE</span>
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">Private</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-2xl font-bold text-purple-600">{Math.ceil(session.ratePerSecond * 60)}</span>
                        <span className="text-sm text-gray-600">tokens/min</span>
                      </div>
                      {session.viewers && (
                        <p className="text-xs text-gray-500 mt-1">👁️ {session.viewers.length} viewers</p>
                      )}
                    </div>
                    {broadcaster?.profilePhoto ? (
                      <img 
                        src={getImageUrl(broadcaster.profilePhoto) || ''} 
                        alt={broadcaster.username}
                        className="w-12 h-12 rounded-full object-cover border-2 border-pink-200"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-pink-500 flex items-center justify-center text-white font-bold">
                        {broadcaster?.username?.charAt(0).toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                  <Button 
                    onClick={() => view(broadcaster?.id, session)} 
                    disabled={loading === session.id}
                    className="w-full girly-button"
                  >
                    {loading === session.id ? 'Joining...' : 'Join Private Room'}
                  </Button>
                  {balance < Math.ceil(session.ratePerSecond * 60) && (
                    <p className="text-xs error-text mt-2 text-center">⚠️ Insufficient tokens</p>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}
    </main>
  )
}
