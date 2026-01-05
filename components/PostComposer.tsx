import { useState } from 'react'
import api from '../lib/api'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardHeader } from './ui/card'

export default function PostComposer({ onCreated }: { onCreated: ()=>void }){
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<FileList | null>(null)
  const [kind, setKind] = useState<'IMAGE'|'VIDEO'>('IMAGE')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent){
    e.preventDefault()
    setLoading(true)
    try{
      const form = new FormData()
      form.append('title', title)
      form.append('content', content)
      form.append('kind', kind)
      if (files) Array.from(files).forEach(f => form.append('media', f))
      await api.post('/posts', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setTitle(''); setContent(''); setFiles(null)
      onCreated()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card data-post-composer>
      <CardHeader>
        <h2 className="font-semibold">Create Post</h2>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input placeholder="Title" value={title} onChange={(e)=>setTitle(e.target.value)} />
          <Input placeholder="Say something..." value={content} onChange={(e)=>setContent(e.target.value)} />
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1"><input type="radio" name="kind" checked={kind==='IMAGE'} onChange={()=>setKind('IMAGE')} /> Images</label>
            <label className="flex items-center gap-1"><input type="radio" name="kind" checked={kind==='VIDEO'} onChange={()=>setKind('VIDEO')} /> 30s Video</label>
          </div>
          <input type="file" multiple onChange={(e)=>setFiles(e.target.files)} accept={kind==='IMAGE' ? 'image/*' : 'video/*'} />
          <Button type="submit" disabled={loading}>{loading ? 'Posting...' : 'Post'}</Button>
        </form>
      </CardContent>
    </Card>
  )
}


