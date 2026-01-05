import { useEffect, useState, useRef } from 'react'
import PostCard from '../components/PostCard'
import PostComposer from '../components/PostComposer'
import api from '../lib/api'
import { useAuth } from '../store/auth'
import { getImageUrl } from '../lib/utils'
import { useRouter } from 'next/router'

export default function Home() {
  const [posts, setPosts] = useState<any[]>([])
  const [creators, setCreators] = useState<any[]>([])
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showDiscover, setShowDiscover] = useState(true)
  const discoverRef = useRef<HTMLDivElement>(null)
  const auth = useAuth()
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
  }, [])

  async function loadPosts(){
    try {
      const { data } = await api.get('/posts')
      setPosts(data.posts || [])
    } catch {}
  }

  async function loadCreators(){
    try {
      const { data } = await api.get('/users/creators')
      // Randomize and limit to 10
      const shuffled = (data.creators || []).sort(() => Math.random() - 0.5).slice(0, 10)
      setCreators(shuffled)
    } catch {}
  }

  useEffect(()=>{ 
    async function loadAll() {
      setLoading(true)
      await Promise.all([loadPosts(), loadCreators()])
      setLoading(false)
    }
    loadAll()
  }, [])

  // Collapse discover on scroll - only hide when scrolled well past it
  useEffect(() => {
    let ticking = false
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (discoverRef.current) {
            const rect = discoverRef.current.getBoundingClientRect()
            // Only hide when the discover section is completely scrolled past the top
            // Use a more generous threshold to prevent premature hiding
            if (rect.bottom < -50) {
              setShowDiscover(false)
            } else {
              setShowDiscover(true)
            }
          }
          ticking = false
        })
        ticking = true
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Mobile Create Post - Show at top on mobile */}
      {mounted && auth.token && (
        <div className="lg:hidden mb-4">
          <PostComposer onCreated={loadPosts} />
        </div>
      )}

      {/* Discover Section - Collapsible */}
      {!loading && creators.length > 0 && (
        <div 
          ref={discoverRef}
          className={`mb-6 transition-all duration-300 ${showDiscover ? 'opacity-100 max-h-40' : 'opacity-0 max-h-0 overflow-hidden pointer-events-none'}`}
        >
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xl font-bold text-pink-600">Discover</h2>
            <span className="text-sm text-gray-500">• Scroll to see more</span>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {creators.map((creator) => (
            <div
              key={creator.id}
              onClick={() => router.push(`/creators/${creator.id}`)}
              className="flex flex-col items-center gap-2 min-w-[80px] cursor-pointer hover:scale-105 transition-transform"
            >
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-pink-300 shadow-sm bg-white">
                  {creator.profilePhoto ? (
                    <img 
                      src={getImageUrl(creator.profilePhoto) || ''} 
                      alt={creator.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-r from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold text-xl">
                      {creator.username?.charAt(0).toUpperCase() || 'C'}
                    </div>
                  )}
                </div>
                {creator.isLive && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-sm"></div>
                )}
              </div>
              <span className="text-xs text-center text-gray-700 font-medium truncate w-full">
                {creator.username}
              </span>
            </div>
          ))}
          </div>
        </div>
      )}

      <div className="flex gap-6">
        {/* Main Content - Posts */}
        <div className="flex-1 max-w-3xl">
          {loading ? (
            <div className="space-y-4">
              {/* Loading Skeleton Cards */}
              {[1, 2, 3].map((i) => (
                <div key={i} className="girly-card p-5 animate-pulse">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-pink-200"></div>
                    <div className="flex-1">
                      <div className="h-5 bg-pink-200 rounded w-32 mb-2"></div>
                      <div className="h-4 bg-pink-100 rounded w-24"></div>
                    </div>
                  </div>
                  <div className="h-4 bg-pink-100 rounded w-full mb-2"></div>
                  <div className="h-4 bg-pink-100 rounded w-3/4 mb-4"></div>
                  <div className="h-64 bg-pink-100 rounded-xl mb-4"></div>
                  <div className="flex gap-4">
                    <div className="h-4 bg-pink-100 rounded w-16"></div>
                    <div className="h-4 bg-pink-100 rounded w-16"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="girly-card p-8 text-center">
              <div className="text-6xl mb-4">📝</div>
              <p className="text-gray-500 text-lg">No posts yet. Be the first to share!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((p)=> (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          )}
        </div>

        {/* Right Sidebar - Create Post */}
        <aside className="hidden lg:block w-80 flex-shrink-0">
          {mounted && auth.token && (
            <div className="sticky top-6">
              <PostComposer onCreated={loadPosts} />
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
