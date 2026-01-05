import { create } from 'zustand'

export type User = { 
  id: string; 
  username: string; 
  role: 'USER'|'ADMIN'|'BROADCASTER';
  accountStatus?: 'ACTIVE'|'SUSPENDED'|'BANNED';
  userType?: 'ADMIN'|'BROADCASTER'|'USER';
  creatorStatus?: 'PENDING'|'APPROVED'|'REJECTED';
  walletBalance?: number;
}

type AuthState = {
  token: string | null
  user: User | null
  walletBalance: number | null
  setAuth: (token: string, user: User) => void
  setWalletBalance: (balance: number) => void
  logout: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  user: null,
  walletBalance: null,
  setAuth: (token, user) => {
    if (typeof window !== 'undefined') localStorage.setItem('token', token)
    set({ token, user, walletBalance: user.walletBalance || null })
  },
  setWalletBalance: (balance) => {
    set((state) => ({
      walletBalance: balance,
      user: state.user ? { ...state.user, walletBalance: balance } : null
    }))
  },
  logout: async () => {
    console.log('[Auth] logout() called')
    console.log('[Auth] Current state before logout:', {
      hasToken: !!useAuth.getState().token,
      hasUser: !!useAuth.getState().user,
      username: useAuth.getState().user?.username
    })
    
    // Stop all media tracks FIRST before logging out
    if (typeof window !== 'undefined') {
      console.log('[Auth] Stopping media tracks...')
      try {
        // Get all media tracks from all sources
        const allTracks: MediaStreamTrack[] = []
        
        // Stop tracks from any video/audio elements
        const videoElements = document.querySelectorAll('video')
        console.log('[Auth] Found video elements:', videoElements.length)
        videoElements.forEach(video => {
          if (video.srcObject) {
            const stream = video.srcObject as MediaStream
            stream.getTracks().forEach(track => {
              allTracks.push(track)
            })
            video.srcObject = null
            video.pause()
          }
        })
        
        console.log('[Auth] Total tracks to stop:', allTracks.length)
        // Stop all collected tracks
        allTracks.forEach(track => {
          try {
            if (track.readyState !== 'ended') {
              track.stop()
              track.enabled = false
            }
          } catch (e) {
            console.error('[Auth] Error stopping track on logout:', e)
          }
        })
        console.log('[Auth] Media tracks stopped')
      } catch (e) {
        console.error('[Auth] Error stopping media on logout:', e)
      }
    } else {
      console.log('[Auth] Window undefined, skipping media cleanup')
    }
    
    // Disconnect socket
    console.log('[Auth] Disconnecting socket...')
    try {
      const { disconnectSocket } = await import('../lib/socket')
      disconnectSocket()
      console.log('[Auth] Socket disconnected')
    } catch (e) {
      console.error('[Auth] Error disconnecting socket on logout:', e)
    }
    
    // End any active sessions before logging out
    const currentUser = useAuth.getState().user
    console.log('[Auth] Checking for active sessions, user:', currentUser?.id)
    if (typeof window !== 'undefined' && currentUser) {
      try {
        console.log('[Auth] Fetching sessions...')
        const api = (await import('../lib/api')).default
        const { data } = await api.get('/sessions')
        console.log('[Auth] Sessions response:', data)
        const activeSession = data.sessions.find((s: any) => 
          s.broadcaster.id === currentUser.id && s.status === 'LIVE'
        )
        console.log('[Auth] Active session found:', !!activeSession)
        if (activeSession) {
          console.log('[Auth] Ending active session:', activeSession.id)
          await api.post(`/sessions/${activeSession.id}/end`)
          console.log('[Auth] Session ended')
        }
      } catch (e) {
        console.error('[Auth] Error ending session on logout:', e)
      }
    } else {
      console.log('[Auth] Skipping session cleanup - window undefined or no user')
    }
    
    // Clear localStorage
    console.log('[Auth] Clearing localStorage...')
    if (typeof window !== 'undefined') {
      const hadToken = !!localStorage.getItem('token')
      localStorage.removeItem('token')
      console.log('[Auth] Token removed from localStorage, had token:', hadToken)
    } else {
      console.log('[Auth] Window undefined, cannot clear localStorage')
    }
    
    // Update state
    console.log('[Auth] Updating auth state to null...')
    set({ token: null, user: null, walletBalance: null })
    console.log('[Auth] Auth state updated')
    
    // Verify state was cleared
    const newState = useAuth.getState()
    console.log('[Auth] State after logout:', {
      hasToken: !!newState.token,
      hasUser: !!newState.user,
      walletBalance: newState.walletBalance
    })
    console.log('[Auth] logout() completed')
  }
}))
