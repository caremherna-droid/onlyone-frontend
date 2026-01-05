import { useEffect, useState } from 'react'
import api from '../../lib/api'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Card, CardContent, CardHeader } from '../../components/ui/card'

export default function AdsPage(){
  const [ads, setAds] = useState<any[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')

  async function load(){
    const { data } = await api.get('/ads')
    setAds(data.ads || [])
  }

  useEffect(()=>{ load() },[])

  async function create(){
    await api.post('/ads', { title, body, mediaUrl })
    setTitle(''); setBody(''); setMediaUrl('')
    await load()
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 grid md:grid-cols-3 gap-6">
      <Card className="md:col-span-1">
        <CardHeader>
          <h2 className="font-semibold">Create Ad</h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input placeholder="Title" value={title} onChange={(e)=>setTitle(e.target.value)} />
          <Input placeholder="Body" value={body} onChange={(e)=>setBody(e.target.value)} />
          <Input placeholder="Media URL" value={mediaUrl} onChange={(e)=>setMediaUrl(e.target.value)} />
          <Button onClick={create}>Publish</Button>
        </CardContent>
      </Card>

      <div className="md:col-span-2 grid gap-4">
        {ads.map((ad) => (
          <Card key={ad.id}>
            <CardContent className="p-4">
              <h3 className="font-semibold">{ad.title}</h3>
              <p className="text-sm text-gray-600">{ad.body}</p>
              {ad.mediaUrl && <img src={ad.mediaUrl} className="mt-2 rounded-lg border" />}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
