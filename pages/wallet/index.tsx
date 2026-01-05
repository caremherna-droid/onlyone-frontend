import { useEffect, useState } from 'react'
import api from '../../lib/api'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Card, CardContent, CardHeader } from '../../components/ui/card'

export default function WalletPage(){
  const [balance, setBalance] = useState<number>(0)
  const [amount, setAmount] = useState<number>(200)
  const [loading, setLoading] = useState(false)

  useEffect(()=>{
    loadBalance()
  },[])

  async function loadBalance(){
    try {
      const {data} = await api.get('/wallet/balance')
      setBalance(data.balance || 0)
    } catch {}
  }

  async function stripeTopup(){
    if (amount < 1) {
      alert('Minimum amount is 1 token (1 KES)')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.post('/wallet/stripe/create-intent', { amount })
      alert('Stripe client secret: ' + data.clientSecret + '\n(Integrate Stripe.js on production)')
      setTimeout(loadBalance, 2000)
    } catch(e: any) {
      alert(e?.response?.data?.error || 'Failed to create payment')
    } finally {
      setLoading(false)
    }
  }

  async function mpesaTopup(){
    if (amount < 1) {
      alert('Minimum amount is 1 token (1 KES)')
      return
    }
    const phone = prompt('Enter phone (e.g., 2547XXXXXXXX)')
    if (!phone) return
    setLoading(true)
    try {
      await api.post('/wallet/mpesa/stk_push', { amount, phone })
      alert('M-Pesa STK push initiated. Approve on your phone. Tokens will be added automatically.')
      setTimeout(loadBalance, 5000)
    } catch(e: any) {
      alert(e?.response?.data?.error || 'Failed to initiate M-Pesa payment')
    } finally {
      setLoading(false)
    }
  }

  async function cryptoTopup(){
    if (amount < 1) {
      alert('Minimum amount is 1 token (1 KES)')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.post('/wallet/crypto/create-payment', { amount })
      
      // Show payment instructions
      const confirmed = confirm(
        `Crypto Payment Details:\n\n` +
        `Amount: ${amount} KES (${amount} tokens)\n` +
        `Address: ${data.address}\n\n` +
        `Instructions: ${data.instructions}\n\n` +
        `Click OK after you've sent the payment to confirm.`
      )
      
      if (confirmed) {
        // For testing: confirm payment manually
        // In production, this would be automatic via webhook
        try {
          await api.post(`/wallet/crypto/confirm/${data.paymentId}`)
          alert('Payment confirmed! Tokens added to your wallet.')
          loadBalance()
        } catch(e: any) {
          alert('Payment confirmation failed. If you sent the payment, it will be processed automatically.')
        }
      }
    } catch(e: any) {
      alert(e?.response?.data?.error || 'Failed to create crypto payment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen p-6 flex items-center justify-center">
      <Card className="w-full max-w-2xl girly-card">
        <CardHeader className="text-center">
          <h1 className="text-3xl font-bold text-pink-600">My Wallet</h1>
          <div className="mt-4 p-6 rounded-2xl girly-bg border-2 border-pink-200">
            <p className="text-sm text-gray-600 mb-2">Your Balance</p>
            <p className="text-4xl font-bold text-pink-600">{balance.toLocaleString()} <span className="text-2xl text-purple-600">tokens</span></p>
            <p className="text-xs text-gray-500 mt-2">1 token = 1 KES</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-pink-700 mb-2">Purchase Tokens</label>
            <div className="flex items-center gap-3">
              <Input 
                type="number" 
                className="girly-input flex-1" 
                placeholder="Amount (KES)"
                min="1"
                value={amount} 
                onChange={(e)=>setAmount(Number(e.target.value))} 
              />
              <span className="text-sm text-gray-600 font-medium">= {amount} tokens</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button 
              onClick={mpesaTopup} 
              disabled={loading}
              className="bg-green-500 hover:bg-green-600 border-green-300 h-14 flex flex-col items-center justify-center gap-1"
            >
              <span className="text-lg">📱</span>
              <span>M-Pesa</span>
            </Button>
            <Button 
              onClick={stripeTopup} 
              disabled={loading}
              className="bg-purple-500 hover:bg-purple-600 border-purple-300 h-14 flex flex-col items-center justify-center gap-1"
            >
              <span className="text-lg">💳</span>
              <span>Card</span>
            </Button>
            <Button 
              onClick={cryptoTopup} 
              disabled={loading}
              variant="outline"
              className="h-14 flex flex-col items-center justify-center gap-1"
            >
              <span className="text-lg">₿</span>
              <span>Crypto</span>
            </Button>
          </div>

          <div className="mt-6 p-4 rounded-xl bg-pink-50 border border-pink-200">
            <p className="text-xs text-gray-600">
              💡 <strong>How it works:</strong> Purchase tokens to join live therapy sessions. 
              The longer you stay, the more tokens you spend. Unused tokens are refunded when you leave early.
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
