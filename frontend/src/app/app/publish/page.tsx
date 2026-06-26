"use client"

import { useState, useEffect, useCallback } from "react"
import { useSelector } from "react-redux"
import { RootState } from "@/store/store"
import { publishAPI, clipsAPI, videosAPI, accountsAPI, scheduleAPI } from "@/lib/api"
import {
  Send, History, Calendar, CheckCircle, XCircle, Clock, Loader2, Key,
  TrendingUp, Video, Globe, Plus, Sparkles, PlusCircle, Check, ExternalLink,
  Share2, Grid, FileText, Trash2
} from "lucide-react"
import { cn, formatScore } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"

type Tab = "publish" | "history" | "scheduled"

interface Clip {
  id: string
  video_id: string
  start_time: number
  end_time: number
  caption: string
  score: number
  title?: string
  hashtags?: string
  thumbnail_url?: string | null
}
interface Video { id: string; title: string; source_url: string }
interface PublishEntry { id: string; clip_id: string; platform: string; platform_label: string; status: string; title: string; published_at: string; result: any }
interface ScheduledEntry {
  id: string
  clip_id: string
  platform: string
  title?: string
  description?: string
  scheduled_at: string
  status: string
  dub_language?: string
}

const PLATFORMS = [
  { id: "youtube_shorts", label: "YouTube Shorts", color: "text-red-500 hover:bg-red-500/5 hover:border-red-500/30", activeClass: "border-red-500 bg-red-500/5 shadow-red-500/10 text-red-500" },
  { id: "tiktok", label: "TikTok", color: "text-cyan-400 hover:bg-cyan-500/5 hover:border-cyan-500/30", activeClass: "border-cyan-500 bg-cyan-500/5 shadow-cyan-500/10 text-cyan-400" },
  { id: "instagram_reels", label: "Instagram Reels", color: "text-pink-500 hover:bg-pink-500/5 hover:border-pink-500/30", activeClass: "border-pink-500 bg-pink-500/5 shadow-pink-500/10 text-pink-500" },
  { id: "linkedin", label: "LinkedIn", color: "text-blue-500 hover:bg-blue-500/5 hover:border-blue-500/30", activeClass: "border-blue-500 bg-blue-500/5 shadow-blue-500/10 text-blue-500" },
]

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  success: "default",
  failed: "destructive",
  pending: "secondary",
}

const TAG_BANK = ["#viral", "#shorts", "#trending", "#foryou", "#videocreator", "#clipforge", "#ai", "#growth"]

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
  const [scheduled, setScheduled] = useState<ScheduledEntry[]>([])
  const [selectedClipData, setSelectedClipData] = useState<Clip | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingScheduled, setLoadingScheduled] = useState(false)
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccount, setSelectedAccount] = useState("")
  const [loadError, setLoadError] = useState("")

  // Form scheduling options
  const [scheduleForm, setScheduleForm] = useState(false)
  const [scheduleAt, setScheduleAt] = useState("")
  const [scheduling, setScheduling] = useState(false)

  const loadInitialData = useCallback(() => {
    videosAPI.list().then(r => setVideos(r.data.items || [])).catch(() => setLoadError("Failed to load videos"))
    accountsAPI.list().then(r => setAccounts(r.data || [])).catch(() => setLoadError("Failed to load accounts"))
  }, [])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  useEffect(() => {
    const match = accounts.find((a: any) => a.platform === platform)
    setSelectedAccount(match ? match.id : "")
  }, [platform, accounts])

  useEffect(() => {
    if (!selectedVideo) { setClips([]); return }
    clipsAPI.list(selectedVideo).then(r => setClips(r.data.items || [])).catch(() => setLoadError("Failed to load clips"))
  }, [selectedVideo])

  useEffect(() => {
    if (!selectedClip || !clips.length) return
    const clip = clips.find(c => c.id === selectedClip)
    if (!clip) return
    setSelectedClipData(clip)
    const vid = videos.find(v => v.id === clip.video_id)
    if (vid) setTitle(vid.title?.replace(/^Importing from YouTube\.\.\.$/, "") || clip.title || "")
    setDescription(clip.caption || "")
    setHashtags(clip.hashtags || "")
  }, [selectedClip, clips, videos])

  const publishOne = async (clipId: string, clipTitle: string, clipDesc: string, clipTags: string) => {
    const res = await publishAPI.publish({
      clip_id: clipId,
      platform,
      title: clipTitle,
      description: clipDesc,
      hashtags: clipTags,
      platform_account_id: selectedAccount || undefined,
      privacy,
    })
    return res.data
  }

  const handlePublish = async () => {
    if (!platform) return
    const ids = selectedClips.size > 0 ? Array.from(selectedClips) : (selectedClip ? [selectedClip] : [])
    if (ids.length === 0) return

    setPublishing(true)
    setPubResult(null)

    const promises = ids.map(clipId => {
      const clip = clips.find(c => c.id === clipId)
      const clipTitle = clip?.title || clip?.caption || title
      const clipDesc = clip?.caption || description
      const clipTags = clip?.hashtags || hashtags
      return publishOne(clipId, clipTitle, clipDesc, clipTags)
        .then(r => ({ id: clipId, ...r }))
        .catch(err => ({ id: clipId, success: false, error: err.response?.data?.detail || err.message }))
    })

    Promise.allSettled(promises).then(results => {
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.success).length
      setPubResult({ multi: true, total: ids.length, successCount, done: true })
      setPublishing(false)
      setSelectedClips(new Set())
      loadHistory()
    })

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

  const loadScheduled = async () => {
    setLoadingScheduled(true)
    try {
      const res = await scheduleAPI.list()
      setScheduled(res.data.items || [])
    } catch {
      setLoadError("Failed to load scheduled posts")
    }
    setLoadingScheduled(false)
  }

  const submitSchedule = async () => {
    if (!scheduleAt) return
    const clipId = selectedClip || (clips.length > 0 ? clips[0].id : null)
    if (!clipId) return
    setScheduling(true)
    try {
      const payload = {
        clip_id: clipId,
        platform,
        title: title || "",
        description: description || "",
        hashtags: hashtags || "",
        scheduled_at: new Date(scheduleAt).toISOString(),
        platform_account_id: selectedAccount || undefined,
      }
      await scheduleAPI.create(payload)
      setScheduleForm(false)
      setScheduleAt("")
      loadScheduled()
      alert("Publication scheduled successfully!")
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message || "Failed to schedule publication")
    } finally {
      setScheduling(false)
    }
  }

  const handlePublishNow = async (id: string) => {
    try {
      await scheduleAPI.publishNow(id)
      alert("Post published now successfully!")
      loadScheduled()
      loadHistory()
    } catch {
      alert("Failed to publish post immediately")
    }
  }

  const handleCancelSchedule = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this scheduled post?")) return
    try {
      await scheduleAPI.cancel(id)
      alert("Schedule cancelled successfully!")
      loadScheduled()
    } catch {
      alert("Failed to cancel scheduled post")
    }
  }

  useEffect(() => {
    if (tab === "history") loadHistory()
    if (tab === "scheduled") loadScheduled()
  }, [tab])

  const connectedAccountCount = accounts.length
  const scheduledCount = scheduled.length
  const totalPublishedCount = history.filter(h => h.status === "success").length

  return (
    <div className="animate-fade-in space-y-6">
      {/* Page Header */}
      <div className="border-b border-border pb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Publish Hub</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Optimize, schedule, and distribute your generated clips to all social feeds
          </p>
        </div>
      </div>

      {/* Top Statistics Section */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
        <Card className="border border-border bg-card shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalPublishedCount}</p>
              <p className="text-[11px] text-muted-foreground font-medium">Published Clips</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-brand-500/10 text-brand-400 flex items-center justify-center shrink-0">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{scheduledCount}</p>
              <p className="text-[11px] text-muted-foreground font-medium">Scheduled Queue</p>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 sm:col-span-1 border border-border bg-card shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
              <Share2 size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{connectedAccountCount}</p>
              <p className="text-[11px] text-muted-foreground font-medium">Active Channels</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={tab} onValueChange={v => setTab(v as Tab)} className="w-full space-y-6">
        <TabsList className="bg-muted p-1 rounded-lg">
          <TabsTrigger value="publish" className="text-xs py-1.5 px-4"><Send size={14} className="mr-1.5" />Quick Publish</TabsTrigger>
          <TabsTrigger value="history" className="text-xs py-1.5 px-4"><History size={14} className="mr-1.5" />History Log</TabsTrigger>
          <TabsTrigger value="scheduled" className="text-xs py-1.5 px-4"><Calendar size={14} className="mr-1.5" />Scheduled Queue</TabsTrigger>
        </TabsList>

        {/* 1. Quick Publish Tab Content */}
        <TabsContent value="publish" className="m-0 focus-visible:outline-none">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left Column: Selector Panel (1/3 Width) */}
            <div className="lg:col-span-1 space-y-6">
              {/* Select Video Card */}
              <Card className="border border-border bg-card shadow-sm">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Step 1: Select Source</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <Select value={selectedVideo} onValueChange={v => { setSelectedVideo(v ?? ""); setSelectedClip("") }}>
                    <SelectTrigger className="w-full bg-background border-border">
                      <SelectValue placeholder="Choose project video..." />
                    </SelectTrigger>
                    <SelectContent>
                      {videos.map(v => <SelectItem key={v.id} value={v.id}>{v.title || v.id.slice(0, 8)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Clips List Grid Card */}
              {selectedVideo && clips.length > 0 && (
                <Card className="border border-border bg-card shadow-sm">
                  <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Step 2: Choose Clips</CardTitle>
                    <Button variant="ghost" className="h-auto p-0 text-[10px] text-brand-400 hover:text-brand-300 font-bold" onClick={() => {
                      if (selectedClips.size === clips.length) setSelectedClips(new Set())
                      else setSelectedClips(new Set(clips.map(c => c.id)))
                    }}>
                      {selectedClips.size === clips.length ? "Deselect All" : "Select All"}
                    </Button>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 max-h-[350px] overflow-y-auto space-y-2">
                    {clips.map(c => {
                      const isSelected = selectedClips.has(c.id) || selectedClip === c.id
                      const duration = c.end_time - c.start_time
                      return (
                        <div
                          key={c.id}
                          onClick={() => {
                            const next = new Set(selectedClips)
                            if (next.has(c.id)) {
                              next.delete(c.id)
                            } else {
                              next.add(c.id)
                            }
                            setSelectedClips(next)
                            setSelectedClip(c.id)
                          }}
                          className={cn(
                            "flex items-start gap-3 rounded-lg p-3 text-xs border cursor-pointer transition-all duration-200",
                            isSelected
                              ? "border-brand-500 bg-brand-500/5"
                              : "border-border hover:border-muted-foreground/30 bg-muted/10"
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => {}}
                            className="mt-0.5 pointer-events-none"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-foreground font-semibold truncate">{c.title || c.caption || "No caption"}</p>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span className="bg-muted px-1.5 py-0.5 rounded font-medium">{duration.toFixed(1)}s</span>
                              <span className="flex items-center gap-1 font-semibold text-emerald-500">
                                <TrendingUp size={10} />
                                {formatScore(c.score)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column: Platform & Metadata Details (2/3 Width) */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="border border-border bg-card shadow-sm">
                <CardContent className="p-6 space-y-6">
                  {/* Select Destination Platform */}
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Step 3: Select Destination Platform</Label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {PLATFORMS.map(p => {
                        const active = p.id === platform
                        const hasAccount = accounts.some(a => a.platform === p.id)
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setPlatform(p.id)}
                            className={cn(
                              "flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all duration-300 gap-1.5 cursor-pointer text-xs font-bold",
                              active
                                ? p.activeClass
                                : "border-border bg-muted/10 text-muted-foreground hover:bg-muted/30"
                            )}
                          >
                            <Globe size={16} />
                            <span>{p.label}</span>
                            {hasAccount ? (
                              <span className="text-[9px] text-emerald-500 font-medium flex items-center gap-0.5">
                                <Check size={8} /> Connected
                              </span>
                            ) : (
                              <span className="text-[9px] text-amber-500 font-medium flex items-center gap-0.5">
                                <Key size={8} /> Needs Auth
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Account Selector */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Step 4: Choose Channel Account</Label>
                    {accounts.filter(a => a.platform === platform).length > 0 ? (
                      <Select value={selectedAccount} onValueChange={v => setSelectedAccount(v ?? "")}>
                        <SelectTrigger className="w-full bg-background border-border">
                          <SelectValue placeholder="Select connected account..." />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.filter(a => a.platform === platform).map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-2 text-xs border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 rounded-lg text-amber-500">
                        <Key size={14} className="shrink-0" />
                        <span>No connected account found. <a href="/app/settings" className="underline font-bold hover:text-amber-400">Add account in Settings</a></span>
                      </div>
                    )}
                  </div>

                  {/* Metadata Editor */}
                  <div className="space-y-4 pt-2 border-t border-border">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Step 5: Review Social Post Metadata</Label>

                    <div className="space-y-2">
                      <Label className="text-xs text-foreground font-medium">Post Title</Label>
                      <Input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="Add a catchy, hook-based title"
                        className="bg-background border-border"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-foreground font-medium">Caption / Description</Label>
                      <Textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Write a descriptions that keeps users reading or gives a call to action..."
                        rows={3}
                        className="bg-background border-border resize-none"
                      />
                    </div>

                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs text-foreground font-medium">Viral Tags</Label>
                        <span className="text-[10px] text-muted-foreground">Click tags below to append</span>
                      </div>
                      <Input
                        value={hashtags}
                        onChange={e => setHashtags(e.target.value)}
                        placeholder="#viral #shorts #ai"
                        className="bg-background border-border"
                      />
                      {/* Tag suggestion bank */}
                      <div className="flex flex-wrap gap-1.5">
                        {TAG_BANK.map(tag => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              const current = hashtags.trim()
                              if (current.includes(tag)) return
                              setHashtags(current ? `${current} ${tag}` : tag)
                            }}
                            className="inline-flex items-center text-[10px] bg-muted/60 text-muted-foreground border border-border px-2 py-0.5 rounded-md hover:bg-muted transition-colors font-medium"
                          >
                            <Plus size={10} className="mr-0.5" />
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-foreground font-medium">Privacy Status</Label>
                      <Select value={privacy} onValueChange={v => setPrivacy(v ?? "public")}>
                        <SelectTrigger className="w-full bg-background border-border">
                          <SelectValue placeholder="Select visibility" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="public">Public</SelectItem>
                          <SelectItem value="unlisted">Unlisted</SelectItem>
                          <SelectItem value="private">Private</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Dual Action Buttons (Publish vs Schedule) */}
                  <div className="space-y-4 pt-4 border-t border-border">
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button
                        onClick={handlePublish}
                        disabled={(selectedClips.size === 0 && !selectedClip) || publishing}
                        className="flex-1 h-10 shadow-sm"
                      >
                        {publishing ? <Loader2 size={16} className="animate-spin mr-1.5" /> : <Send size={16} className="mr-1.5" />}
                        {publishing ? "Publishing..." : `Publish${selectedClips.size > 1 ? ` All (${selectedClips.size})` : selectedClips.size === 1 ? " Selected" : " Now"}`}
                      </Button>

                      <Button
                        onClick={() => setScheduleForm(!scheduleForm)}
                        variant="outline"
                        className="sm:w-36 h-10"
                      >
                        <Calendar size={16} className="mr-1.5" />
                        {scheduleForm ? "Cancel" : "Schedule"}
                      </Button>
                    </div>

                    {/* Collapsible Schedule Form */}
                    {scheduleForm && (
                      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4 animate-scale-in">
                        <div>
                          <Label className="text-xs text-foreground font-medium">Select Publication Date & Time</Label>
                          <Input
                            type="datetime-local"
                            value={scheduleAt}
                            onChange={e => setScheduleAt(e.target.value)}
                            className="bg-background border-border mt-1.5"
                          />
                        </div>
                        <Button
                          onClick={submitSchedule}
                          disabled={!scheduleAt || scheduling}
                          className="w-full h-9"
                          size="sm"
                        >
                          {scheduling ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Calendar size={14} className="mr-1.5" />}
                          Confirm Queue Schedule
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Results Message Container */}
                  {pubResult && (
                    <div className={cn(
                      "rounded-lg p-4 text-xs border mt-4",
                      pubResult.publishing ? "bg-brand-500/5 border-brand-500/20 text-brand-400 shadow-sm" :
                      pubResult.done ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400 shadow-sm" :
                      "bg-destructive/5 border-destructive/20 text-destructive shadow-sm"
                    )}>
                      {pubResult.publishing ? (
                        <div className="flex items-center gap-2">
                          <Loader2 size={14} className="animate-spin text-brand-400" />
                          <span>Publishing {pubResult.total} clips in the background...</span>
                        </div>
                      ) : pubResult.multi ? (
                        <div className="flex items-start gap-2">
                          <CheckCircle size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                          <div>
                            <p className="font-semibold">{pubResult.successCount}/{pubResult.total} clips published successfully.</p>
                            <p className="text-[10px] mt-0.5 opacity-80">You can now navigate away from this page safely.</p>
                          </div>
                        </div>
                      ) : pubResult.success ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle size={14} className="text-emerald-500" />
                            <span className="font-semibold">Published successfully!</span>
                          </div>
                          {pubResult.platform_url && (
                            <a href={pubResult.platform_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] underline hover:text-foreground">
                              View Live Post <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <XCircle size={14} className="mt-0.5 shrink-0 text-destructive" />
                          <span>{pubResult.error || "Publish failed"}</span>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* 2. History Log Tab Content */}
        <TabsContent value="history" className="m-0 focus-visible:outline-none">
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="p-6">
              <CardTitle className="text-base font-bold text-foreground">Publication History Log</CardTitle>
              <CardDescription className="text-xs">
                Audit feed for all completed and failed social publishing attempts
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              {loadingHistory ? (
                <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>
              ) : history.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
                  <History className="size-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-semibold text-muted-foreground">No publish history yet</p>
                  <p className="text-xs text-muted-foreground/80 mt-1">Ingested project clips will populate here once published.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map(h => {
                    const status = h.status
                    return (
                      <div key={h.id} className="flex items-center justify-between rounded-xl border border-border p-4 text-xs bg-muted/10 hover:bg-muted/20 transition-colors">
                        <div className="min-w-0 flex-1 pr-4 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground truncate">{h.title || h.platform_label}</span>
                            {h.result?.platform_url && (
                              <a href={h.result.platform_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {h.platform_label} &middot; {new Date(h.published_at).toLocaleString()}
                          </p>
                        </div>
                        <Badge variant={STATUS_BADGE[status] || "secondary"} className="shrink-0 capitalize">
                          {status}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. Scheduled Queue Tab Content */}
        <TabsContent value="scheduled" className="m-0 focus-visible:outline-none">
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="p-6">
              <CardTitle className="text-base font-bold text-foreground">Scheduled Queue Manager</CardTitle>
              <CardDescription className="text-xs">
                Inspect, trigger, or cancel upcoming social publications queued in the engine
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              {loadingScheduled ? (
                <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>
              ) : scheduled.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
                  <Calendar className="size-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-semibold text-muted-foreground">No scheduled publications</p>
                  <p className="text-xs text-muted-foreground/80 mt-1">Queue up clips in the publisher tab to see them here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {scheduled.map(s => (
                    <div key={s.id} className="flex items-center justify-between rounded-xl border border-border p-4 text-xs bg-muted/10 hover:bg-muted/20 transition-colors">
                      <div className="min-w-0 flex-1 pr-4 space-y-1">
                        <p className="font-semibold text-foreground truncate">{s.title || "Untitled Scheduled Clip"}</p>
                        <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                          <span className="bg-muted px-1.5 py-0.5 rounded uppercase font-semibold text-[9px]">{s.platform.replace("_", " ")}</span>
                          <span className="flex items-center gap-1 text-brand-400 font-medium">
                            <Clock size={10} />
                            {new Date(s.scheduled_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          onClick={() => handlePublishNow(s.id)}
                          variant="outline"
                          size="xs"
                          className="h-8 text-[10px]"
                        >
                          Publish Now
                        </Button>
                        <Button
                          onClick={() => handleCancelSchedule(s.id)}
                          variant="ghost"
                          size="icon-xs"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          title="Cancel Schedule"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
