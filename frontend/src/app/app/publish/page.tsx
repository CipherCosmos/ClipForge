"use client"

import { useState, useEffect } from "react"
import { useSelector } from "react-redux"
import { RootState } from "@/store/store"
import { publishAPI, clipsAPI, videosAPI, accountsAPI } from "@/lib/api"
import { Send, History, Calendar, CheckCircle, XCircle, Clock, Loader2, Key } from "lucide-react"
import { cn } from "@/lib/utils"

type Tab = "publish" | "history" | "scheduled"

interface Clip { id: string; video_id: string; start_time: number; end_time: number; caption: string; score: number; title?: string; hashtags?: string }
interface Video { id: string; title: string; source_url: string }
interface PublishEntry { id: string; clip_id: string; platform: string; platform_label: string; status: string; title: string; published_at: string; result: any }

const PLATFORMS = [
  { id: "youtube_shorts", label: "YouTube Shorts" },
  { id: "tiktok", label: "TikTok" },
  { id: "instagram_reels", label: "Instagram Reels" },
  { id: "linkedin", label: "LinkedIn" },
]

export default function PublishPage() {
  const { token } = useSelector((s: RootState) => s.auth)
  const [tab, setTab] = useState<Tab>("publish")
  const [videos, setVideos] = useState<Video[]>([])
  const [clips, setClips] = useState<Clip[]>([])
  const [selectedVideo, setSelectedVideo] = useState("")
  const [selectedClip, setSelectedClip] = useState("")
  const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set())
  const [platform, setPlatform] = useState("youtube_shorts")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [hashtags, setHashtags] = useState("")
  const [publishing, setPublishing] = useState(false)
  const [pubResult, setPubResult] = useState<any>(null)
  const [privacy, setPrivacy] = useState("public")
  const [history, setHistory] = useState<PublishEntry[]>([])
  const [selectedClipData, setSelectedClipData] = useState<Clip | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccount, setSelectedAccount] = useState("")
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    videosAPI.list().then(r => setVideos(r.data.items || [])).catch(() => setLoadError("Failed to load videos"))
    accountsAPI.list().then(r => setAccounts(r.data || [])).catch(() => setLoadError("Failed to load accounts"))
  }, [])

  // Auto-select account when platform changes
  useEffect(() => {
    const match = accounts.find((a: any) => a.platform === platform)
    setSelectedAccount(match ? match.id : "")
  }, [platform, accounts])

  useEffect(() => {
    if (!selectedVideo) { setClips([]); return }
    clipsAPI.list(selectedVideo).then(r => setClips(r.data.items || [])).catch(() => setLoadError("Failed to load clips"))
  }, [selectedVideo])

  // Auto-fill title/description/hashtags when a clip is selected
  useEffect(() => {
    if (!selectedClip || !clips.length) return
    const clip = clips.find(c => c.id === selectedClip)
    if (!clip) return
    setSelectedClipData(clip)
    // Find the video for its title
    const vid = videos.find(v => v.id === clip.video_id)
    if (vid) setTitle(vid.title?.replace(/^Importing from YouTube\.\.\.$/, "") || clip.caption || "")
    setDescription(clip.caption || "")
    setHashtags(clip.hashtags || "")
  }, [selectedClip, clips, videos])

  const publishOne = async (clipId: string, clipTitle: string, clipDesc: string, clipTags: string) => {
    const res = await publishAPI.publish({
      clip_id: clipId, platform,
      title: clipTitle || title,
      description: clipDesc || description,
      hashtags: clipTags || hashtags,
      platform_account_id: selectedAccount || undefined,
      privacy,
    })
    return res.data
  }

  const handlePublish = async () => {
    if (!platform) return
    const ids = selectedClips.size > 0 ? Array.from(selectedClips) : (selectedClip ? [selectedClip] : [])
    if (ids.length === 0) return
    
    // Fire all in parallel — no blocking
    setPublishing(true)
    setPubResult(null)
    
    const promises = ids.map(clipId => {
      const clip = clips.find(c => c.id === clipId)
      return publishOne(clipId, clip?.caption || title, clip?.caption || description, clip?.hashtags || hashtags)
        .then(r => ({ id: clipId, ...r }))
        .catch(err => ({ id: clipId, success: false, error: err.response?.data?.detail || err.message }))
    })

    // Don't await — let them complete in background
    Promise.allSettled(promises).then(results => {
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.success).length
      setPubResult({ multi: true, total: ids.length, successCount, done: true })
      setPublishing(false)
      setSelectedClips(new Set())
      loadHistory()
    })
    
    // Show immediate feedback
    setPubResult({ multi: true, total: ids.length, successCount: 0, publishing: true })
  }

  const loadHistory = async () => {
    setLoadingHistory(true)
    try {
      const res = await publishAPI.history()
      setHistory(res.data.items || [])
    } catch {
      setLoadError("Failed to load publish history")
    }
    setLoadingHistory(false)
  }

  useEffect(() => { if (tab === "history") loadHistory() }, [tab])

  const tabs: { key: Tab; icon: any; label: string }[] = [
    { key: "publish", icon: Send, label: "Quick Publish" },
    { key: "history", icon: History, label: "History" },
    { key: "scheduled", icon: Calendar, label: "Scheduled" },
  ]

  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Publish Hub</h1>
        <p className="mt-1 text-sm text-slate-400">Publish clips to your social platforms</p>
      </div>

      {/* Quick start guide */}
      <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-4 text-sm text-slate-300 space-y-2">
        <p className="font-medium text-brand-400">How to publish a clip</p>
        <ol className="list-decimal list-inside space-y-1 text-xs text-slate-400">
          <li>Connect your accounts in <a href="/app/settings" className="text-brand-400 hover:underline">Settings → Connected Accounts</a></li>
          <li>Select a video below, then pick a clip</li>
          <li>Choose your platform, add title/hashtags, click Publish</li>
        </ol>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-800/50 p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              tab === t.key ? "bg-brand-500 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
            )}>
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "publish" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Selectors */}
          <div className="lg:col-span-1 space-y-4">
            <div className="card-glass p-4">
              <label htmlFor="pub-video" className="text-xs font-medium text-slate-400 mb-2 block">Select Video</label>
              <select id="pub-video" aria-label="Select video" value={selectedVideo} onChange={e => { setSelectedVideo(e.target.value); setSelectedClip("") }}
                className="input">
                <option value="">Choose a video...</option>
                {videos.map(v => <option key={v.id} value={v.id}>{v.title || v.id.slice(0, 8)}</option>)}
              </select>
            </div>
            {clips.length > 0 && (
              <div className="card-glass p-4 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-400">Clips ({clips.length})</label>
                  <button onClick={() => {
                    if (selectedClips.size === clips.length) setSelectedClips(new Set())
                    else setSelectedClips(new Set(clips.map(c => c.id)))
                  }} className="text-[10px] text-brand-400 hover:underline">
                    {selectedClips.size === clips.length ? "Deselect all" : "Select all"}
                  </button>
                </div>
                {clips.map(c => (
                  <label key={c.id} onClick={() => {
                    const next = new Set(selectedClips)
                    if (next.has(c.id)) next.delete(c.id); else next.add(c.id)
                    setSelectedClips(next)
                    setSelectedClip(c.id)
                  }}
                    className={cn(
                      "flex items-start gap-3 rounded-lg p-3 text-xs transition-all border cursor-pointer",
                      selectedClips.has(c.id)
                        ? "border-brand-500 bg-brand-500/10"
                        : "border-slate-700/30 hover:border-slate-600/50"
                    )}>
                    <input type="checkbox" checked={selectedClips.has(c.id)}
                      onChange={() => {}} className="mt-0.5 accent-brand-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-slate-200 font-medium truncate">{c.caption || "No caption"}</p>
                      <p className="text-slate-500 mt-1">{(c.end_time - c.start_time).toFixed(1)}s · score {c.score.toFixed(2)}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <div className="card-glass p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-2 block">Platform</label>
                <select value={platform} onChange={e => setPlatform(e.target.value)} className="input">
                  {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-2 block">Account</label>
                {accounts.filter((a: any) => a.platform === platform).length > 0 ? (
                  <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} className="input">
                    {accounts.filter((a: any) => a.platform === platform).map((a: any) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xs text-slate-500 flex items-center gap-2 p-2">
                    <Key size={12} />
                    No account connected. <a href="/app/settings" className="text-brand-400 hover:underline">Add one in Settings</a>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Publish form */}
          <div className="lg:col-span-2 space-y-4">
            <div className="card-glass p-6 space-y-4">
              <h2 className="text-sm font-semibold text-white">Publish Details</h2>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} className="input" placeholder="Video title" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} className="input min-h-[80px]" placeholder="Video description" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Hashtags</label>
                <input value={hashtags} onChange={e => setHashtags(e.target.value)} className="input" placeholder="#viral #shorts" />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Privacy</label>
                <select value={privacy} onChange={e => setPrivacy(e.target.value)} className="input">
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                </select>
              </div>

              <button onClick={handlePublish} disabled={(selectedClips.size === 0 && !selectedClip) || publishing}
                className="btn-primary w-full">
                {publishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {publishing ? "Publishing..." : `Publish${selectedClips.size > 1 ? ` All (${selectedClips.size})` : selectedClips.size === 1 ? " Selected" : " Now"}`}
              </button>

              {pubResult && (
                <div className={cn(
                  "rounded-lg p-4 text-sm",
                  pubResult.publishing ? "bg-brand-500/10 border border-brand-500/20 text-brand-400" :
                  pubResult.done ? "bg-emerald-900/20 border border-emerald-700/30 text-emerald-400" :
                  "bg-red-900/20 border border-red-700/30 text-red-400"
                )}>
                  {pubResult.publishing ? (
                    <div className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      <span>Publishing {pubResult.total} clips in background...</span>
                    </div>
                  ) : pubResult.multi ? (
                    <div className="flex items-start gap-2">
                      <CheckCircle size={16} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">{pubResult.successCount}/{pubResult.total} clips published</p>
                        <p className="text-xs mt-1 opacity-70">You can now navigate to other pages</p>
                      </div>
                    </div>
                  ) : pubResult.success ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle size={16} />
                      <div>
                        <p className="font-medium">Published!</p>
                        {pubResult.platform_url && (
                          <a href={pubResult.platform_url} target="_blank" rel="noopener noreferrer"
                            className="underline text-xs mt-1 inline-block">View on {PLATFORMS.find(p=>p.id===platform)?.label || platform}</a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <XCircle size={16} className="mt-0.5 shrink-0" />
                      <span>{pubResult.error || "Publish failed"}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="card-glass p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Publish History</h2>
          {loadingHistory ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No publish history yet.</p>
          ) : (
            <div className="space-y-3">
              {history.map(h => (
                <div key={h.id} className="flex items-center justify-between rounded-lg border border-slate-700/30 p-4 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-200 font-medium truncate">{h.title || h.platform_label}</p>
                    <p className="text-xs text-slate-500 mt-1">{h.platform_label} · {new Date(h.published_at).toLocaleString()}</p>
                  </div>
                  <span className={cn(
                    "badge shrink-0 ml-3",
                    h.status === "success" ? "badge-green" : h.status === "failed" ? "badge-red" : "badge-yellow"
                  )}>
                    {h.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "scheduled" && (
        <div className="card-glass p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Scheduled Publications</h2>
          <p className="text-sm text-slate-500 py-8 text-center">
            <a href="/app/schedule" className="text-brand-400 hover:underline">View schedule page</a>
          </p>
        </div>
      )}
    </div>
  )
}
