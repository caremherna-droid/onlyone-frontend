import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import api from '../../lib/api'
import { useAuth } from '../../store/auth'
import { getImageUrl } from '../../lib/utils'
import PostCard from '../../components/PostCard'
import { Button } from '../../components/ui/button'

export default function CreatorProfile() {
  const router = useRouter()
  const { id } = router.query
  const [creator, setCreator] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isFollowing, setIsFollowing] = useState(false)
  const auth = useAuth()

  useEffect(() => {
    if (id) {
      loadCreator()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function loadCreator() {
    if (!id || typeof id !== 'string') return
    
    try {
      setLoading(true)
      const { data } = await api.get(`/users/${id}`)
      setCreator(data.user)
      setPosts(data.posts || [])
    } catch (e: any) {
      console.error('Error loading creator:', e)
      if (e.response?.status === 404) {
        // Creator not found
      }
    } finally {
      setLoading(false)
    }
  }

  const isOwnProfile = auth.user?.id === id

  if (loading || !id) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
      </div>
    )
  }

  if (!creator) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-pink-600 mb-4">Creator Not Found</h1>
          <Button onClick={() => router.push('/')}>Go Home</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Profile Header */}
        <div className="bg-white rounded-xl shadow-sm border-2 border-pink-200 p-6 mb-6 girly-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            {/* Profile Photo */}
            <div className="relative">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-pink-300 shadow-lg">
                {creator.profilePhoto ? (
                  <img 
                    src={getImageUrl(creator.profilePhoto) || ''} 
                    alt={creator.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-r from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold text-4xl">
                    {creator.username?.charAt(0).toUpperCase() || 'C'}
                  </div>
                )}
              </div>
              {creator.isLive && (
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full border-4 border-white shadow-lg animate-pulse"></div>
              )}
            </div>
            
            {/* Profile Info */}
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-3xl font-bold text-pink-600 mb-2">{creator.username}</h1>
              {creator.bio && (
                <p className="text-gray-600 mb-4">{creator.bio}</p>
              )}
              
              {/* Stats */}
              <div className="flex gap-6 justify-center md:justify-start mb-4">
                <div>
                  <div className="text-2xl font-bold text-pink-600">{posts.length}</div>
                  <div className="text-sm text-gray-500">Posts</div>
                </div>
                {creator.ratePerMinute && (
                  <div>
                    <div className="text-2xl font-bold text-purple-600">{creator.ratePerMinute}</div>
                    <div className="text-sm text-gray-500">Tokens/min</div>
                  </div>
                )}
              </div>
              
              {/* Actions */}
              <div className="flex gap-3 justify-center md:justify-start">
                {isOwnProfile && creator.role === 'BROADCASTER' && (
                  <Button 
                    onClick={() => router.push('/broadcast')}
                    className="girly-button"
                  >
                    🎥 Go Live
                  </Button>
                )}
                {!isOwnProfile && (
                  <Button 
                    onClick={() => setIsFollowing(!isFollowing)}
                    variant={isFollowing ? "outline" : "default"}
                    className={isFollowing ? "" : "girly-button"}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </Button>
                )}
                {!isOwnProfile && creator.isLive && (
                  <Button 
                    onClick={() => {
                      // Find active session and join
                      router.push('/browse')
                    }}
                    className="girly-button bg-red-500 hover:bg-red-600"
                  >
                    🔴 Join Live
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Posts */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-pink-700">Posts</h2>
          <span className="text-sm text-gray-500">{posts.length} total</span>
        </div>

        {/* Posts Grid */}
        {posts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} showAuthor={false} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📸</div>
            <h2 className="text-xl font-semibold text-pink-600 mb-2">No Posts Yet</h2>
            <p className="text-gray-500">This creator hasn't shared any posts yet.</p>
          </div>
        )}
      </div>
  )
}

