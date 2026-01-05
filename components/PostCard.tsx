import { Card, CardContent } from './ui/card'
import { getImageUrl } from '../lib/utils'
import { useRouter } from 'next/router'

export default function PostCard({
  post,
  showAuthor = true,
}: {
  post: any
  showAuthor?: boolean
}){
  const router = useRouter()
  const imageUrls = (post.mediaUrls || []).filter((url: string) => {
    const urlStr = url.toLowerCase()
    return !urlStr.endsWith('.mp4') && !urlStr.endsWith('.webm') && post.kind !== 'VIDEO'
  })

  return (
    <div className="girly-card p-5 hover:shadow-lg transition-all border-2 border-pink-100 rounded-2xl">
      {/* Author Header */}
      {showAuthor && (
        <div className="flex items-start gap-3 mb-4">
          <div 
            onClick={() => post.author?.id && router.push(`/creators/${post.author.id}`)}
            className="cursor-pointer"
          >
            {post.author?.profilePhoto ? (
              <img 
                src={getImageUrl(post.author.profilePhoto) || ''} 
                alt={post.author.username}
                className="w-12 h-12 rounded-full object-cover border-2 border-pink-300 hover:border-pink-500 transition-colors"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg border-2 border-pink-300">
                {post.author?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 
                onClick={() => post.author?.id && router.push(`/creators/${post.author.id}`)}
                className="font-bold text-lg text-pink-700 cursor-pointer hover:text-pink-600"
              >
                {post.author?.username || 'Unknown'}
              </h3>
              {post.author?.isLive && (
                <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">LIVE</span>
              )}
            </div>
            {post.title && (
              <p className="text-sm font-semibold text-gray-800 mt-1">{post.title}</p>
            )}
          </div>
        </div>
      )}

      {/* Title (when author header is hidden) */}
      {!showAuthor && post.title && (
        <h3 className="text-lg font-bold text-pink-700 mb-3">
          {post.title}
        </h3>
      )}

      {/* Content */}
      {post.content && (
        <p className="text-sm text-gray-700 mb-4 whitespace-pre-wrap leading-relaxed">
          {post.content}
        </p>
      )}

      {/* Media Grid */}
      {imageUrls.length > 0 && (
        <div className={`mb-4 rounded-xl overflow-hidden ${
          imageUrls.length === 1 
            ? 'grid-cols-1' 
            : imageUrls.length === 2
            ? 'grid grid-cols-2 gap-2'
            : 'grid grid-cols-2 gap-2'
        }`}>
          {imageUrls.slice(0, 4).map((url: string, index: number) => {
            const imageUrl = getImageUrl(url)
            const isLast = index === 3 && imageUrls.length > 4
            return (
              <div key={url} className={`relative bg-pink-50 flex items-center justify-center border-2 border-pink-200 rounded-lg overflow-hidden ${
                imageUrls.length === 1 ? 'min-h-[300px] max-h-[500px]' : 'min-h-[200px] max-h-[300px]'
              }`}>
                <img 
                  src={imageUrl || ''} 
                  alt={post.title} 
                  className="w-full h-full object-contain"
                />
                {isLast && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                    <span className="text-white text-2xl font-bold">+{imageUrls.length - 4}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Video Player */}
      {post.mediaUrls && post.mediaUrls.some((url: string) => 
        url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm') || url.toLowerCase().endsWith('.mov') || url.toLowerCase().endsWith('.avi') || post.kind === 'VIDEO'
      ) && (() => {
        const videoUrl = post.mediaUrls.find((url: string) => 
          url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm') || url.toLowerCase().endsWith('.mov') || url.toLowerCase().endsWith('.avi') || post.kind === 'VIDEO'
        )
        return videoUrl ? (
          <div className="mb-4 rounded-xl overflow-hidden border-2 border-pink-200">
            <video 
              src={getImageUrl(videoUrl) || ''}
              controls
              className="w-full h-auto max-h-96 object-contain bg-black"
              style={{ maxHeight: '400px' }}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        ) : (
          <div className="mb-4 rounded-xl overflow-hidden border-2 border-pink-200 bg-gradient-to-r from-pink-100 to-purple-100 p-12 text-center">
            <div className="text-4xl mb-2">🎥</div>
            <p className="text-pink-600 font-semibold">Video Content</p>
          </div>
        )
      })()}

      {/* Engagement Stats */}
      <div className="flex items-center gap-4 text-sm text-gray-600 pt-3 border-t-2 border-pink-100">
        <span>❤️ {post.likeCount || 0}</span>
        <span>💬 {post.commentCount || 0}</span>
        <span className="ml-auto text-xs text-gray-400">
          {new Date(post.createdAt).toLocaleDateString()}
        </span>
      </div>
      
      {/* Click to view details */}
      <div 
        onClick={() => router.push(`/posts/${post.id}`)}
        className="mt-3 text-center text-pink-600 hover:text-pink-700 cursor-pointer text-sm font-semibold"
      >
        View Details →
      </div>
    </div>
  )
}
