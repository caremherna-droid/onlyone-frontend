import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import api from '../lib/api'
import { useAuth } from '../store/auth'
import { getImageUrl } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'

export default function ChatPage() {
  const [conversations, setConversations] = useState<any[]>([])
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [creators, setCreators] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const auth = useAuth()

  useEffect(() => {
    if (!auth.token) {
      router.push('/auth/login?redirect=/chat')
      return
    }
    loadConversations()
    loadCreators()
  }, [auth.token])

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation)
      const interval = setInterval(() => loadMessages(selectedConversation), 2000)
      return () => clearInterval(interval)
    }
  }, [selectedConversation])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadConversations() {
    try {
      const { data } = await api.get('/chat/conversations')
      setConversations(data.conversations || [])
    } catch {}
  }

  async function loadCreators() {
    try {
      const { data } = await api.get('/users/creators')
      setCreators(data.creators || [])
    } catch {}
  }

  async function loadMessages(userId: string) {
    try {
      const { data } = await api.get(`/chat/conversation/${userId}`)
      setMessages(data.chats || [])
    } catch {}
  }

  async function startConversation(creatorId: string) {
    setSelectedConversation(creatorId)
    await loadMessages(creatorId)
  }

  async function sendMessage() {
    if (!messageInput.trim() || !selectedConversation || sending) return

    setSending(true)
    try {
      await api.post('/chat/send', {
        receiverId: selectedConversation,
        message: messageInput.trim()
      })
      setMessageInput('')
      await loadMessages(selectedConversation)
      await loadConversations()
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const selectedPartner = selectedConversation 
    ? conversations.find(c => c.partnerId === selectedConversation)?.partner ||
      creators.find(c => c.id === selectedConversation)
    : null

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 h-[calc(100vh-200px)] flex gap-4">
      {/* Conversations List */}
      <div className="w-80 flex-shrink-0 border-r-2 border-pink-200 flex flex-col">
        <div className="p-4 border-b-2 border-pink-200">
          <h2 className="text-xl font-bold text-pink-600 mb-4">Chat</h2>
          <div className="text-xs text-gray-500 mb-2">💬 0.01 tokens per message</div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {/* Existing Conversations */}
          {conversations.length > 0 && (
            <div className="p-2">
              <div className="text-xs font-semibold text-gray-500 mb-2 px-2">Recent</div>
              {conversations.map((conv) => (
                <div
                  key={conv.partnerId}
                  onClick={() => startConversation(conv.partnerId)}
                  className={`p-3 rounded-lg cursor-pointer mb-2 transition-colors ${
                    selectedConversation === conv.partnerId
                      ? 'bg-pink-100 border-2 border-pink-300'
                      : 'hover:bg-pink-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {conv.partner?.profilePhoto ? (
                      <img
                        src={getImageUrl(conv.partner.profilePhoto) || ''}
                        alt={conv.partner.username}
                        className="w-12 h-12 rounded-full object-cover border-2 border-pink-200"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-r from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold">
                        {conv.partner?.username?.charAt(0).toUpperCase() || 'C'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-pink-700 truncate">
                        {conv.partner?.username || 'Unknown'}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {conv.lastMessage?.message}
                      </div>
                    </div>
                    {conv.unreadCount > 0 && (
                      <div className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                        {conv.unreadCount}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Available Creators */}
          <div className="p-2 border-t-2 border-pink-200 mt-4">
            <div className="text-xs font-semibold text-gray-500 mb-2 px-2">Start Chat</div>
            {creators
              .filter(c => !conversations.find(conv => conv.partnerId === c.id))
              .slice(0, 10)
              .map((creator) => (
                <div
                  key={creator.id}
                  onClick={() => startConversation(creator.id)}
                  className={`p-3 rounded-lg cursor-pointer mb-2 transition-colors ${
                    selectedConversation === creator.id
                      ? 'bg-pink-100 border-2 border-pink-300'
                      : 'hover:bg-pink-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {creator.profilePhoto ? (
                      <img
                        src={getImageUrl(creator.profilePhoto) || ''}
                        alt={creator.username}
                        className="w-12 h-12 rounded-full object-cover border-2 border-pink-200"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-r from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold">
                        {creator.username?.charAt(0).toUpperCase() || 'C'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-pink-700 truncate">
                        {creator.username}
                      </div>
                      <div className="text-xs text-gray-500">Creator</div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Chat Window */}
      <div className="flex-1 flex flex-col">
        {selectedConversation && selectedPartner ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b-2 border-pink-200 flex items-center gap-3">
              {selectedPartner.profilePhoto ? (
                <img
                  src={getImageUrl(selectedPartner.profilePhoto) || ''}
                  alt={selectedPartner.username}
                  className="w-12 h-12 rounded-full object-cover border-2 border-pink-200"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-r from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold">
                  {selectedPartner.username?.charAt(0).toUpperCase() || 'C'}
                </div>
              )}
              <div>
                <div className="font-semibold text-pink-700">{selectedPartner.username}</div>
                <div className="text-xs text-gray-500">0.01 tokens per message</div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => {
                const isMe = msg.senderId === auth.user?.id
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                        isMe
                          ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white'
                          : 'bg-pink-100 text-gray-800'
                      }`}
                    >
                      <div className="text-sm">{msg.message}</div>
                      <div className={`text-xs mt-1 ${isMe ? 'text-pink-100' : 'text-gray-500'}`}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 border-t-2 border-pink-200 flex gap-2">
              <Input
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message... (0.01 tokens)"
                className="flex-1"
              />
              <Button
                onClick={sendMessage}
                disabled={sending || !messageInput.trim()}
                className="girly-button"
              >
                {sending ? '...' : 'Send'}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-6xl mb-4">💬</div>
              <p>Select a creator to start chatting</p>
              <p className="text-sm mt-2">0.01 tokens per message</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

