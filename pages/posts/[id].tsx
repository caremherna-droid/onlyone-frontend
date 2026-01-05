import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import api from '../../lib/api'
import { useAuth } from '../../store/auth'
import { getImageUrl } from '../../lib/utils'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'

export default function PostDetailsPage() {
  const router = useRouter()
  const { id } = router.query
  const auth = useAuth()
  const [post, setPost] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([])
  const [isLiked, setIsLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [commentInput, setCommentInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sendingComment, setSendingComment] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  useEffect(() => {
    if (id) {
      loadPost()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function loadPost() {
    if (!id) return
    try {
      setLoading(true)
      const { data } = await api.get(`/posts/${id}`)
      setPost(data.post)
      setComments(data.comments || [])
      setIsLiked(data.post?.isLiked || false)
      setLikeCount(data.post?.likeCount || 0)
    } catch (e: any) {
      console.error('Error loading post:', e)
    } finally {
      setLoading(false)
    }
  }

  async function toggleLike() {
    if (!id) return
    try {
      const { data } = await api.post(`/posts/${id}/like`)
      setIsLiked(data.isLiked)
      setLikeCount(data.likeCount)
    } catch (e: any) {
      console.error('Error toggling like:', e)
    }
  }

  async function sendComment() {
    if (!commentInput.trim() || !id || sendingComment) return
    setSendingComment(true)
    try {
      await api.post(`/posts/${id}/comments`, {
        content: commentInput.trim()
      })
      setCommentInput('')
      await loadPost()
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to send comment')
    } finally {
      setSendingComment(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center">Post not found</div>
      </div>
    )
  }

  // Filter media URLs - moved after early returns but before main return
  const imageUrls: string[] = (post.mediaUrls || []).filter((url: string) => {
    const urlStr = url.toLowerCase()
    return !urlStr.endsWith('.mp4') && !urlStr.endsWith('.webm') && post.kind !== 'VIDEO'
  });

  const videoUrls: string[] = (post.mediaUrls || []).filter((url: string) => {
    const urlStr = url.toLowerCase()
    return urlStr.endsWith('.mp4') || urlStr.endsWith('.webm') || post.kind === 'VIDEO'
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-2 text-pink-600 hover:text-pink-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Back</span>
        </button>
        
        {/* Author Header */}
        <div className="flex items-center gap-4 mb-6 pb-4 border-b-2 border-pink-200">
          <div 
            onClick={() => post.author?.id && router.push(`/creators/${post.author.id}`)}
            className="cursor-pointer"
          >
            {post.author?.profilePhoto ? (
              <img 
                src={getImageUrl(post.author.profilePhoto) || ''} 
                alt={post.author.username}
                className="w-16 h-16 rounded-full object-cover border-2 border-pink-300 hover:border-pink-500 transition-colors"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold text-xl border-2 border-pink-300">
                {post.author?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
          </div>
          <div className="flex-1">
            <h2 
              onClick={() => post.author?.id && router.push(`/creators/${post.author.id}`)}
              className="text-xl font-bold text-pink-700 cursor-pointer hover:text-pink-600"
            >
              {post.author?.username || 'Unknown'}
            </h2>
            <p className="text-sm text-gray-500">
              {new Date(post.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
          <button className="text-gray-500 hover:text-gray-700">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
        </div>

        {/* Title */}
        {post.title && (
          <h1 className="text-3xl font-bold text-pink-700 mb-4">{post.title}</h1>
        )}

        {/* Content */}
        {post.content && (
          <p className="text-lg text-gray-700 mb-6 whitespace-pre-wrap leading-relaxed">
            {post.content}
          </p>
        )}

        {/* Media - Horizontal Scroll */}
        {(imageUrls.length > 0 || videoUrls.length > 0) && (
          <div className="mb-6">
            <div className="relative overflow-hidden rounded-xl border-2 border-pink-200">
              {/* Images */}
              {imageUrls.length > 0 && (
                <div className="relative">
                  <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {imageUrls.map((url: string, index: number) => (
                      <div key={url} className="min-w-full snap-start">
                        <img 
                          src={getImageUrl(url) || ''} 
                          alt={post.title}
                          className="w-full h-auto max-h-[600px] object-contain bg-pink-50"
                        />
                      </div>
                    ))}
                  </div>
                  {imageUrls.length > 1 && (
                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2">
                      {imageUrls.map((_: any, index: number) => (
                        <button
                          key={index}
                          onClick={() => {
                            const container = document.querySelector('.flex.overflow-x-auto')
                            if (container) {
                              container.scrollTo({ left: index * container.clientWidth, behavior: 'smooth' })
                            }
                          }}
                          className={`w-2 h-2 rounded-full transition-colors ${
                            index === currentImageIndex ? 'bg-pink-500' : 'bg-pink-200'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {/* Videos */}
              {videoUrls.length > 0 && (
                <div className="relative">
                  <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {videoUrls.map((url: string, index: number) => (
                      <div key={url} className="min-w-full snap-start">
                        <video 
                          src={getImageUrl(url) || ''}
                          controls
                          className="w-full h-auto max-h-[600px] object-contain bg-black"
                        >
                          Your browser does not support the video tag.
                        </video>
                      </div>
                    ))}
                  </div>
                  {videoUrls.length > 1 && (
                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2">
                      {videoUrls.map((_: any, index: number) => (
                        <button
                          key={index}
                          onClick={() => {
                            const container = document.querySelector('.flex.overflow-x-auto')
                            if (container) {
                              container.scrollTo({ left: index * container.clientWidth, behavior: 'smooth' })
                            }
                          }}
                          className={`w-2 h-2 rounded-full transition-colors ${
                            index === currentImageIndex ? 'bg-pink-500' : 'bg-pink-200'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Engagement Actions */}
        <div className="flex items-center gap-6 mb-6 pb-6 border-b-2 border-pink-200">
          <button
            onClick={toggleLike}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              isLiked 
                ? 'bg-pink-500 text-white' 
                : 'bg-pink-100 text-pink-700 hover:bg-pink-200'
            }`}
          >
            <span className="text-xl">{isLiked ? '❤️' : '🤍'}</span>
            <span className="font-semibold">{likeCount}</span>
          </button>
          <div className="flex items-center gap-2 text-gray-600">
            <span className="text-xl">💬</span>
            <span className="font-semibold">{comments.length}</span>
          </div>
        </div>

        {/* Comments Section */}
        <div className="mb-6">
          <h3 className="text-xl font-bold text-pink-700 mb-4">Comments</h3>
          
          {/* Comment Input */}
          {auth.token && (
            <div className="flex gap-2 mb-6">
              <Input
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendComment()}
                placeholder="Write a comment..."
                className="flex-1"
              />
              <Button
                onClick={sendComment}
                disabled={sendingComment || !commentInput.trim()}
                className="girly-button"
              >
                {sendingComment ? '...' : 'Post'}
              </Button>
            </div>
          )}

          {/* Comments List */}
          <div className="space-y-4">
            {comments.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No comments yet. Be the first to comment!</p>
            ) : (
              comments.map((comment: any) => (
                <div key={comment.id} className="flex gap-3 p-4 bg-pink-50 rounded-xl">
                  {comment.author?.profilePhoto ? (
                    <img 
                      src={getImageUrl(comment.author.profilePhoto) || ''} 
                      alt={comment.author.username}
                      className="w-10 h-10 rounded-full object-cover border-2 border-pink-200"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold">
                      {comment.author?.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-pink-700">{comment.author?.username || 'Unknown'}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-gray-700">{comment.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  )
}

