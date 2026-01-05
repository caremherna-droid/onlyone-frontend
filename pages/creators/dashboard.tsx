import { useEffect, useState } from 'react'
import api from '../../lib/api'
import { useAuth } from '../../store/auth'
import { useRouter } from 'next/router'
import { Card, CardContent, CardHeader } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'

export default function CreatorDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [recentSessions, setRecentSessions] = useState<any[]>([])
  const [withdrawAmount, setWithdrawAmount] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const auth = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!auth.token) {
      router.push('/auth/login')
      return
    }
    loadDashboard()
  }, [auth.token])

  async function loadDashboard() {
    try {
      const { data } = await api.get('/creators/dashboard')
      setStats(data.stats)
      setRecentSessions(data.recentSessions || [])
    } catch (e: any) {
      if (e?.response?.status === 403) {
        alert('You need to be a creator to access this page')
        router.push('/')
      }
    }
  }

  async function handleWithdraw() {
    if (withdrawAmount <= 0) {
      alert('Please enter a valid amount')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.post('/creators/withdraw', { amount: withdrawAmount })
      alert(data.message || 'Withdrawal successful')
      setWithdrawAmount(0)
      loadDashboard()
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Withdrawal failed')
    } finally {
      setLoading(false)
    }
  }

  if (!stats) {
    return <div className="min-h-screen p-6 flex items-center justify-center">Loading...</div>
  }

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-pink-600 mb-2">Creator Dashboard</h1>
        <p className="text-gray-600">Track your earnings, views, and manage your content</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <Card className="girly-card">
          <CardContent className="p-6">
            <p className="text-sm text-gray-600 mb-1">Followers</p>
            <p className="text-3xl font-bold text-pink-600">{stats.followers || 0}</p>
          </CardContent>
        </Card>

        <Card className="girly-card">
          <CardContent className="p-6">
            <p className="text-sm text-gray-600 mb-1">Today's Views</p>
            <p className="text-3xl font-bold text-pink-600">{stats.today.views}</p>
            <p className="text-xs text-gray-500 mt-2">
              Yesterday: {stats.yesterday.views}
            </p>
          </CardContent>
        </Card>

        <Card className="girly-card">
          <CardContent className="p-6">
            <p className="text-sm text-gray-600 mb-1">Today's Earnings</p>
            <p className="text-3xl font-bold text-purple-600">{stats.today.earnings.toLocaleString()} tokens</p>
            <p className="text-xs text-gray-500 mt-2">
              ≈ {stats.today.earnings} KES
            </p>
          </CardContent>
        </Card>

        <Card className="girly-card">
          <CardContent className="p-6">
            <p className="text-sm text-gray-600 mb-1">Total Balance</p>
            <p className="text-3xl font-bold text-pink-600">{stats.total.balance.toLocaleString()} tokens</p>
            <p className="text-xs text-gray-500 mt-2">
              Available for withdrawal
            </p>
          </CardContent>
        </Card>

        <Card className="girly-card">
          <CardContent className="p-6">
            <p className="text-sm text-gray-600 mb-1">Total Earnings</p>
            <p className="text-3xl font-bold text-purple-600">{stats.total.earnings.toLocaleString()} tokens</p>
            <p className="text-xs text-gray-500 mt-2">
              All time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Week/Month Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card className="girly-card">
          <CardHeader>
            <h3 className="font-bold text-pink-700">This Week</h3>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-purple-600">{stats.week.views} views</p>
            <p className="text-sm text-gray-600 mt-2">{stats.week.sessions} sessions</p>
          </CardContent>
        </Card>

        <Card className="girly-card">
          <CardHeader>
            <h3 className="font-bold text-pink-700">This Month</h3>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-purple-600">{stats.month.views} views</p>
            <p className="text-sm text-gray-600 mt-2">{stats.month.sessions} sessions</p>
          </CardContent>
        </Card>
      </div>

      {/* Withdraw Section */}
      <Card className="girly-card mb-8">
        <CardHeader>
          <h3 className="font-bold text-pink-700">Withdraw Earnings</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Input
              type="number"
              className="girly-input flex-1"
              placeholder="Amount (tokens)"
              min="1"
              value={withdrawAmount || ''}
              onChange={(e) => setWithdrawAmount(Number(e.target.value))}
            />
            <Button
              onClick={handleWithdraw}
              disabled={loading}
              className="girly-button"
            >
              {loading ? 'Processing...' : 'Withdraw'}
            </Button>
          </div>
          <p className="text-xs text-gray-600">
            Available balance: {stats.total.balance.toLocaleString()} tokens ({stats.total.balance} KES)
          </p>
        </CardContent>
      </Card>

      {/* Recent Sessions */}
      <Card className="girly-card">
        <CardHeader>
          <h3 className="font-bold text-pink-700">Recent Sessions</h3>
        </CardHeader>
        <CardContent>
          {recentSessions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No sessions yet</p>
          ) : (
            <div className="space-y-4">
              {recentSessions.map((session: any) => (
                <div key={session.id} className="p-4 border-2 border-pink-200 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold text-pink-700">
                        {session.isPrivate ? '🔒 Private' : '🌐 Public'} Session
                      </p>
                      <p className="text-sm text-gray-600">
                        {new Date(session.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      session.status === 'LIVE' ? 'success-bg success-text' :
                      session.status === 'ENDED' ? 'info-bg info-text' :
                      'error-bg error-text'
                    }`}>
                      {session.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-4 mt-4">
                    <div>
                      <p className="text-xs text-gray-600">Unique Viewers</p>
                      <p className="text-lg font-bold text-purple-600">{session.uniqueViewerCount || session.viewers.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Total Views</p>
                      <p className="text-lg font-bold text-purple-600">{session.totalViewerCount || session.viewers.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Earnings</p>
                      <p className="text-lg font-bold text-pink-600">{session.earnings || session.totalEarnings || 0} tokens</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Rate</p>
                      <p className="text-lg font-bold text-purple-600">
                        {(session.ratePerSecond * 60).toFixed(1)}/min
                      </p>
                    </div>
                  </div>
                  {session.liveEvents && session.liveEvents.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-pink-200">
                      <p className="text-xs text-gray-600 mb-2">Live Events:</p>
                      <div className="space-y-1">
                        {session.liveEvents.map((event: any) => (
                          <p key={event.id} className="text-xs text-gray-700">
                            • {event.reason} - {new Date(event.createdAt).toLocaleString()}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
