import Link from 'next/link'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { useAuth } from '../store/auth'
import api from '../lib/api'
import { useRouter } from 'next/router'

export default function Layout({ children }: { children: ReactNode }){
  const auth = useAuth()
  const router = useRouter()
  const [balance, setBalance] = useState<number|null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [showBecomeCreatorModal, setShowBecomeCreatorModal] = useState(false)
  const [showGoLiveModal, setShowGoLiveModal] = useState(false)
  const [creatorEmail, setCreatorEmail] = useState('')
  const [becomingCreator, setBecomingCreator] = useState(false)
  const [goingLive, setGoingLive] = useState(false)
  const [isPrivate, setIsPrivate] = useState(false)
  const [ratePerMinute, setRatePerMinute] = useState<number>(10)
  const [privateRatePerMinute, setPrivateRatePerMinute] = useState<number>(11)
  const [loadingRates, setLoadingRates] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Cleanup active sessions when navigating away from broadcast page
  useEffect(() => {
    const handleRouteChange = async (url: string) => {
      // If navigating away from broadcast page, check for active session
      if (!url.includes('/broadcast') && auth.user?.role === 'BROADCASTER') {
        try {
          const { data } = await api.get('/sessions')
          const activeSession = data.sessions.find((s: any) => 
            s.broadcaster?.id === auth.user?.id && s.status === 'LIVE'
          )
          if (activeSession) {
            // End the session when navigating away
            await api.post(`/sessions/${activeSession.id}/end`).catch(() => {
              // Ignore errors - session might already be ended
            })
          }
        } catch (e) {
          // Ignore errors
        }
      }
    }

    router.events?.on('routeChangeStart', handleRouteChange)
    return () => {
      router.events?.off('routeChangeStart', handleRouteChange)
    }
  }, [router, auth.user])

  useEffect(() => {
    if (!mounted) return
    async function load(){
      if (auth.token) {
        try {
          const me = await api.get('/auth/me')
          if (me?.data?.user) {
            auth.setAuth(auth.token!, { id: me.data.user.id, username: me.data.user.username, role: me.data.user.role })
            setBalance(me.data.user.wallet?.balance ?? null)
          }
        } catch {}
        try {
          const { data } = await api.get('/wallet/balance')
          setBalance(data.balance)
        } catch {}
      } else {
        setBalance(null)
      }
    }
    load()
  }, [auth.token, mounted])

  useEffect(()=>{
    function onDoc(e: MouseEvent){
      const target = e.target as Node
      // Close user menu when clicking outside (both desktop and mobile)
      // Use click instead of mousedown to allow button clicks to register first
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false)
      }
      // Close mobile menu when clicking outside
      const mobileMenu = document.querySelector('[data-mobile-menu]')
      if (mobileMenu && !mobileMenu.contains(target)) {
        setMobileMenuOpen(false)
      }
    }
    // Use click event instead of mousedown to allow onClick handlers to fire first
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  async function handleGoLiveClick(e: React.MouseEvent) {
    e.preventDefault()
    if (!auth.token) {
      router.push('/auth/login?redirect=/broadcast')
      return
    }

    // Check if user is creator
    try {
      const { data } = await api.get('/auth/me')
      if (data.user.role !== 'BROADCASTER') {
        // Show become creator modal
        setShowBecomeCreatorModal(true)
        return
      }
      
      // Already a creator - show go live modal (just select private/public)
      setShowGoLiveModal(true)
    } catch (e) {
      alert('Failed to check creator status')
    }
  }

  async function handleLogout() {
    console.log('[Layout] handleLogout called')
    console.log('[Layout] Current auth state:', { 
      hasToken: !!auth.token, 
      hasUser: !!auth.user,
      username: auth.user?.username 
    })
    
    setMenuOpen(false)
    setMobileMenuOpen(false)
    console.log('[Layout] Menu closed')
    
    try {
      console.log('[Layout] Calling auth.logout()...')
      await auth.logout()
      console.log('[Layout] auth.logout() completed successfully')
    } catch (error) {
      console.error('[Layout] Logout error:', error)
      console.error('[Layout] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
    } finally {
      console.log('[Layout] In finally block, attempting navigation...')
      // Navigate to login; also set fallback navigation for safety
      try {
        console.log('[Layout] Calling router.push("/auth/login")...')
        await router.push('/auth/login')
        console.log('[Layout] router.push completed successfully')
      } catch (pushError) {
        console.error('[Layout] router.push failed:', pushError)
        if (typeof window !== 'undefined') {
          console.log('[Layout] Falling back to window.location.href')
          window.location.href = '/auth/login'
        }
      }
    }
  }

  async function becomeCreator() {
    if (!creatorEmail || !creatorEmail.includes('@')) {
      alert('Please enter a valid email address')
      return
    }

    setBecomingCreator(true)
    try {
      const { data } = await api.post('/auth/become-creator', { email: creatorEmail })
      auth.setAuth(auth.token!, { 
        id: auth.user!.id, 
        username: auth.user!.username, 
        role: 'BROADCASTER' 
      })
      setShowBecomeCreatorModal(false)
      setCreatorEmail('')
      // Now show go live modal
      setShowGoLiveModal(true)
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to become creator')
    } finally {
      setBecomingCreator(false)
    }
  }

  async function saveRates() {
    setLoadingRates(true)
    try {
      await api.patch('/users/me', {
        ratePerMinute,
        privateRatePerMinute
      })
      alert('Rates saved!')
    } catch(e: any) {
      alert(e?.response?.data?.error || 'Failed to save rates')
      setLoadingRates(false)
    } finally {
      setLoadingRates(false)
    }
  }

  async function startLiveSession() {
    setGoingLive(true)
    try {
      // First check for existing active sessions and end them
      try {
        const { data: sessionsData } = await api.get('/sessions')
        const myActiveSession = sessionsData.sessions.find((s: any) => 
          s.broadcaster?.id === auth.user?.id && s.status === 'LIVE'
        )
        if (myActiveSession) {
          // End the existing session
          await api.post(`/sessions/${myActiveSession.id}/end`)
        }
      } catch (e) {
        // Ignore errors when checking/ending sessions
      }

      // Then start the new session
      const { data } = await api.post('/sessions/start', { isPrivate })
      setShowGoLiveModal(false)
      // Redirect to broadcast page - it will start video when ready
      router.push(`/broadcast?sessionId=${data.session.id}`)
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to go live')
    } finally {
      setGoingLive(false)
    }
  }

  // Hide navbar on live pages
  const isLivePage = router.pathname === '/broadcast' || router.pathname === '/live'

  return (
    <div className="min-h-screen flex flex-col">
      {!isLivePage && (
      <header className="sticky top-0 z-10 border-b-2 border-pink-200 bg-white/90 backdrop-blur shadow-sm">
        <nav className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-purple-500 to-pink-600 text-xl md:text-2xl logo-font tracking-wide hover:scale-[1.02] transition-transform">OnlyOne</Link>
          
          {/* Desktop Search Bar */}
          <div className="hidden md:flex items-center flex-1 justify-center px-4">
            <input placeholder="Search..." className="w-full max-w-md h-10 rounded-full border-2 border-pink-200 px-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-400 transition girly-input" />
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-3 text-sm">
            <Link href="/" className="hover:text-pink-600 transition-colors font-medium">Home</Link>
            <Link href="/browse" className="hover:text-pink-600 transition-colors font-medium">Live</Link>
            <Link href="/chat" className="hover:text-pink-600 transition-colors font-medium">Chat</Link>
            {!mounted ? (
              <span className="hover:text-pink-600 transition-colors font-medium">Go Live</span>
            ) : (
              <button 
                onClick={handleGoLiveClick}
                className="hover:text-pink-600 transition-colors font-medium"
              >
                Go Live
              </button>
            )}
            <Link href="/wallet" className="hover:text-pink-600 transition-colors font-medium">Wallet</Link>
            {!mounted ? (
              <div className="h-10 w-20"></div>
            ) : !auth.token ? (
              <>
                <Link href="/auth/login"><Button variant="outline" className="h-9 px-4">Login</Button></Link>
                <Link href="/auth/register"><Button className="h-9 px-4">Sign up</Button></Link>
              </>
            ) : (
              <div className="relative" ref={menuRef}>
                <button 
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen((v)=>!v)
                  }} 
                  className="h-10 px-4 rounded-full border-2 border-pink-200 flex items-center gap-2 hover:bg-pink-50 transition girly-card"
                >
                  <span className="font-medium text-pink-700">{auth.user?.username || 'Me'}</span>
                  <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-full">{balance !== null ? `${balance} tokens` : '—'}</span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-2xl border-2 border-pink-200 bg-white shadow-lg p-2 fade-in girly-card z-50">
                    <Link href="/profile" className="block px-4 py-2 rounded-xl hover:bg-pink-50 text-pink-700 transition" onClick={() => setMenuOpen(false)}>Profile</Link>
                    {auth.user?.role === 'BROADCASTER' && (
                      <Link href="/settings" className="block px-4 py-2 rounded-xl hover:bg-pink-50 text-pink-700 transition" onClick={() => setMenuOpen(false)}>Settings</Link>
                    )}
                    {auth.user?.role !== 'BROADCASTER' && (
                      <Link href="/become-creator" className="block px-4 py-2 rounded-xl hover:bg-pink-50 text-pink-700 transition" onClick={() => setMenuOpen(false)}>Become a Creator</Link>
                    )}
                    <button 
                      type="button"
                      className="w-full text-left px-4 py-2 rounded-xl hover:bg-pink-50 text-pink-700 transition" 
                      onMouseDown={(e) => {
                        // Prevent menu from closing on mousedown
                        e.stopPropagation()
                      }}
                      onClick={(e) => {
                        console.log('[Layout] Desktop logout button clicked')
                        e.stopPropagation()
                        e.preventDefault()
                        console.log('[Layout] Event prevented, calling handleLogout...')
                        // Close menu first, then logout
                        setMenuOpen(false)
                        // Use setTimeout to ensure menu closes before navigation
                        setTimeout(() => {
                          handleLogout().catch(err => {
                            console.error('[Layout] Unhandled error in handleLogout:', err)
                          })
                        }, 0)
                      }}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile Menu Button and User Menu */}
          <div className="md:hidden flex items-center gap-2">
            {mounted && auth.token && (
              <div className="relative" ref={menuRef}>
                <button 
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen((v)=>!v)
                  }} 
                  className="h-10 px-3 rounded-full border-2 border-pink-200 flex items-center gap-1 hover:bg-pink-50 transition girly-card"
                >
                  <span className="font-medium text-pink-700 text-sm">{auth.user?.username || 'Me'}</span>
                  <span className="text-xs font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">{balance !== null ? `${balance}` : '—'}</span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-2xl border-2 border-pink-200 bg-white shadow-lg p-2 fade-in girly-card z-50">
                    <Link href="/profile" className="block px-4 py-2 rounded-xl hover:bg-pink-50 text-pink-700 transition" onClick={() => setMenuOpen(false)}>Profile</Link>
                    {auth.user?.role === 'BROADCASTER' && (
                      <Link href="/settings" className="block px-4 py-2 rounded-xl hover:bg-pink-50 text-pink-700 transition" onClick={() => setMenuOpen(false)}>Settings</Link>
                    )}
                    {auth.user?.role !== 'BROADCASTER' && (
                      <Link href="/become-creator" className="block px-4 py-2 rounded-xl hover:bg-pink-50 text-pink-700 transition" onClick={() => setMenuOpen(false)}>Become a Creator</Link>
                    )}
                    <button 
                      type="button"
                      className="w-full text-left px-4 py-2 rounded-xl hover:bg-pink-50 text-pink-700 transition" 
                      onMouseDown={(e) => {
                        // Prevent menu from closing on mousedown
                        e.stopPropagation()
                      }}
                      onClick={(e) => {
                        console.log('[Layout] Mobile logout button clicked')
                        e.stopPropagation()
                        e.preventDefault()
                        console.log('[Layout] Event prevented, calling handleLogout...')
                        // Close menu first, then logout
                        setMenuOpen(false)
                        // Use setTimeout to ensure menu closes before navigation
                        setTimeout(() => {
                          handleLogout().catch(err => {
                            console.error('[Layout] Unhandled error in handleLogout:', err)
                          })
                        }, 0)
                      }}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            )}
            {mounted && !auth.token && (
              <div className="flex items-center gap-2">
                <Link href="/auth/login"><Button variant="outline" className="h-9 px-3 text-sm">Login</Button></Link>
              </div>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                setMobileMenuOpen(!mobileMenuOpen)
              }}
              className="h-10 w-10 flex items-center justify-center rounded-full border-2 border-pink-200 hover:bg-pink-50 transition girly-card"
              aria-label="Toggle menu"
            >
              <svg
                className="w-6 h-6 text-pink-600"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                {mobileMenuOpen ? (
                  <path d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </nav>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t-2 border-pink-200 bg-white" data-mobile-menu>
            <div className="max-w-6xl mx-auto px-4 py-4 space-y-2">
              {/* Mobile Search */}
              <input placeholder="Search..." className="w-full h-10 rounded-full border-2 border-pink-200 px-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-400 transition girly-input mb-2" />
              
              {/* Mobile Navigation Links */}
              <Link 
                href="/" 
                className="block px-4 py-2 rounded-xl hover:bg-pink-50 text-pink-700 transition font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                Home
              </Link>
              <Link 
                href="/browse" 
                className="block px-4 py-2 rounded-xl hover:bg-pink-50 text-pink-700 transition font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                Live
              </Link>
              <Link 
                href="/chat" 
                className="block px-4 py-2 rounded-xl hover:bg-pink-50 text-pink-700 transition font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                Chat
              </Link>
              {mounted && (
                <button 
                  onClick={(e) => {
                    e.preventDefault()
                    setMobileMenuOpen(false)
                    handleGoLiveClick(e)
                  }}
                  className="w-full text-left px-4 py-2 rounded-xl hover:bg-pink-50 text-pink-700 transition font-medium"
                >
                  Go Live
                </button>
              )}
              <Link 
                href="/wallet" 
                className="block px-4 py-2 rounded-xl hover:bg-pink-50 text-pink-700 transition font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                Wallet
              </Link>
              {mounted && !auth.token && (
                <>
                  <Link 
                    href="/auth/register" 
                    className="block px-4 py-2 rounded-xl hover:bg-pink-50 text-pink-700 transition font-medium"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>
      )}
      <main className="flex-1">{children}</main>
      <footer className="border-t-2 border-pink-200 bg-white/50">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center text-xs text-gray-500">© {new Date().getFullYear()} OnlyOne - Your Therapy Hub</div>
      </footer>

      {/* Become Creator Modal */}
      {showBecomeCreatorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowBecomeCreatorModal(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 girly-card border-2 border-pink-300" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-pink-600 mb-4">Become a Creator</h2>
            <p className="text-sm text-gray-600 mb-4">Enter your email to start live sessions and earn tokens</p>
            <div className="space-y-4">
              <div>
                <Label className="text-pink-700 font-medium">Email *</Label>
                <Input 
                  className="girly-input" 
                  type="email" 
                  placeholder="your@email.com" 
                  value={creatorEmail} 
                  onChange={(e)=>setCreatorEmail(e.target.value)} 
                  required 
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={becomeCreator} 
                  disabled={becomingCreator}
                  className="flex-1 girly-button"
                >
                  {becomingCreator ? 'Processing...' : 'Continue'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowBecomeCreatorModal(false)
                    setCreatorEmail('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Go Live Modal */}
      {showGoLiveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowGoLiveModal(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 girly-card border-2 border-pink-300" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-pink-600 mb-4">Go Live</h2>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">Select session type:</p>
              
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setIsPrivate(false)
                    startLiveSession()
                  }}
                  disabled={goingLive}
                  className="w-full p-4 rounded-xl border-2 border-pink-300 hover:bg-pink-50 transition text-left girly-card"
                >
                  <div className="font-semibold text-pink-700">🌐 Public Session</div>
                  <div className="text-xs text-gray-600 mt-1">Multiple viewers can join</div>
                </button>
                
                <button
                  onClick={() => {
                    setIsPrivate(true)
                    startLiveSession()
                  }}
                  disabled={goingLive}
                  className="w-full p-4 rounded-xl border-2 border-purple-300 hover:bg-purple-50 transition text-left girly-card"
                >
                  <div className="font-semibold text-purple-700">🔒 Private Session</div>
                  <div className="text-xs text-gray-600 mt-1">Only one viewer can join</div>
                </button>
              </div>
              
              <p className="text-xs text-gray-500 text-center pt-2 border-t-2 border-pink-200">
                Set your rates in <Link href="/settings" className="text-pink-600 hover:underline">Settings</Link>
              </p>
              
              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowGoLiveModal(false)
                    setIsPrivate(false)
                  }}
                  disabled={goingLive}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
