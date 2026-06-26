"use client"

import { memo, useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Download, Copy, Check, Clock, TrendingUp, Hash, Film, Globe, Calendar, Key, Loader2, Play } from "lucide-react"
import { formatDuration, cn } from "@/lib/utils"
import { clipsAPI, scheduleAPI, publishAPI, accountsAPI } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Clip {
  id: string
  video_id: string
  start_time: number
  end_time: number
  caption: string
  score: number
  file_url: string
  thumbnail_url: string | null
  title: string | null
  hashtags: string | null
  dubs?: Record<string, string>
  created_at: string
}

interface ClipCardProps {
  clip: Clip
}

function scoreColor(score: number): string {
  if (score >= 0.7) return "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
  if (score >= 0.4) return "text-amber-400 border-amber-500/20 bg-amber-500/10"
  return "text-rose-400 border-rose-500/20 bg-rose-500/10"
}

function scoreLabel(score: number): string {
  if (score >= 0.7) return "Viral Potential"
  if (score >= 0.4) return "Moderate"
  return "Low Interest"
}

export const ClipCard = memo(function ClipCard({ clip }: ClipCardProps) {
  const router = useRouter()
  const [localClip, setLocalClip] = useState<Clip>(clip)
  const [selectedLang, setSelectedLang] = useState<string>("original")
  const [dubbing, setDubbing] = useState<boolean>(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [publishError, setPublishError] = useState("")
  const [publishSuccess, setPublishSuccess] = useState(false)
  const [accounts, setAccounts] = useState<any[]>([])
  const [scheduleForm, setScheduleForm] = useState<boolean>(false)
  const [schedulePlatform, setSchedulePlatform] = useState<string>("youtube_shorts")
  const [scheduleTitle, setScheduleTitle] = useState<string>(clip.title || "")
  const [scheduleDesc, setScheduleDesc] = useState<string>(clip.caption || "")
  const [scheduleTags, setScheduleTags] = useState<string>(clip.hashtags || "")
  const [scheduleAt, setScheduleAt] = useState<string>("")
  const [scheduling, setScheduling] = useState<boolean>(false)
  const [scheduleError, setScheduleError] = useState("")
  const [scheduleSuccess, setScheduleSuccess] = useState(false)

  const [copiedDesc, setCopiedDesc] = useState(false)
  const [copiedTags, setCopiedTags] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const dur = clip.end_time - clip.start_time

  useEffect(() => {
    setLocalClip(clip)
  }, [clip])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  const handleCopyDesc = async () => {
    try {
      await navigator.clipboard.writeText(clip.caption)
      setCopiedDesc(true)
      showToast("Description copied!")
      setTimeout(() => setCopiedDesc(false), 2000)
    } catch {}
  }

  const handleCopyTags = async () => {
    try {
      if (!clip.hashtags) return
      const rawTags = clip.hashtags.split(/[\s,]+/).filter(t => t.trim().length > 0).map(t => (t.startsWith("#") ? t : `#${t}`)).join(" ")
      await navigator.clipboard.writeText(rawTags)
      setCopiedTags(true)
      showToast("Tags copied!")
      setTimeout(() => setCopiedTags(false), 2000)
    } catch {}
  }

  const videoSrc = selectedLang !== "original" && localClip.dubs?.[selectedLang]
    ? localClip.dubs[selectedLang]
    : clip.file_url

  // Fetch connected accounts on mount
  useEffect(() => {
    accountsAPI.list().then(r => setAccounts(r.data || [])).catch(() => {})
  }, [])

  const publishWithAccount = async (platform: string) => {
    const account = accounts.find((a: any) => a.platform === platform)
    if (!account) {
      router.push("/app/settings")
      return
    }
    setPublishing(platform)
    setPublishError("")
    try {
      const res = await publishAPI.publish({
        clip_id: clip.id,
        platform,
        title: clip.title || clip.caption || "",
        description: clip.caption || "",
        hashtags: clip.hashtags || "",
        platform_account_id: account.id,
        dub_language: selectedLang !== "original" ? selectedLang : undefined,
      })
      if (res.data.success) {
        setPublishSuccess(true)
        setTimeout(() => setPublishSuccess(false), 5000)
      } else {
        setPublishError(res.data.error || "Publish failed")
      }
    } catch (err: any) {
      setPublishError(err.response?.data?.detail || err.message || "Publish failed")
    } finally {
      setPublishing(null)
    }
  }

  const submitSchedule = async () => {
    if (!scheduleAt) {
      setScheduleError("Please select a date and time")
      return
    }
    const account = accounts.find((a: any) => a.platform === schedulePlatform)
    setScheduling(true)
    setScheduleError("")
    setScheduleSuccess(false)
    try {
      const payload: any = {
        clip_id: clip.id,
        platform: schedulePlatform,
        title: scheduleTitle || clip.title || "",
        description: scheduleDesc || clip.caption || "",
        hashtags: scheduleTags || clip.hashtags || "",
        scheduled_at: new Date(scheduleAt).toISOString(),
        dub_language: selectedLang !== "original" ? selectedLang : undefined,
      }
      if (account) {
        payload.platform_account_id = account.id
      }
      const res = await scheduleAPI.create(payload)
      if (res.data) {
        setScheduleSuccess(true)
        setScheduleForm(false)
        setTimeout(() => setScheduleSuccess(false), 5000)
      }
    } catch (err: any) {
      setScheduleError(err.response?.data?.detail || err.message || "Schedule failed")
    } finally {
      setScheduling(false)
    }
  }

  const handleDownload = async () => {
    showToast("Starting clip download...")
    try {
      const res = await fetch(videoSrc)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `clip-${clip.id.slice(0, 8)}-${selectedLang}.mp4`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast("Download completed!")
    } catch {
      window.open(videoSrc, "_blank")
    }
  }

  const handleDubClick = async (lang: string) => {
    setDubbing(true)
    showToast(`Dubbing clip to ${lang.toUpperCase()}...`)
    try {
      await clipsAPI.dub(clip.id, lang)
      // Start polling
      let attempts = 0
      const maxAttempts = 40 // ~2 minutes
      const interval = setInterval(async () => {
        attempts++
        try {
          const res = await clipsAPI.get(clip.id)
          const updatedClip = res.data as Clip
          if (updatedClip.dubs?.[lang]) {
            setLocalClip(updatedClip)
            setDubbing(false)
            showToast(`Dubbed audio ready in ${lang.toUpperCase()}!`)
            clearInterval(interval)
          } else if (attempts >= maxAttempts) {
            setDubbing(false)
            showToast("Dubbing timed out. Please retry.")
            clearInterval(interval)
          }
        } catch {
          // Keep polling
        }
      }, 3000)
    } catch (err) {
      setDubbing(false)
      showToast("Failed to start dubbing.")
    }
  }

  const getPlatformGradientClass = (platform: string) => {
    switch (platform) {
      case "youtube_shorts":
        return "text-red-400 hover:text-white bg-red-500/10 hover:bg-red-600 border-red-500/20"
      case "tiktok":
        return "text-zinc-100 hover:text-white bg-zinc-800 hover:bg-zinc-700 border-zinc-700"
      case "instagram_reels":
        return "text-pink-400 hover:text-white bg-pink-500/10 hover:bg-gradient-to-r hover:from-purple-500 hover:via-pink-500 hover:to-orange-500 border-pink-500/20"
      case "linkedin":
        return "text-blue-400 hover:text-white bg-blue-600/10 hover:bg-blue-600 border-blue-600/20"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  return (
    <Card className="group relative overflow-hidden border border-border bg-card/45 backdrop-blur-md transition-all duration-300 hover:border-brand-500/30 hover:bg-card/75 hover:shadow-lg hover:shadow-brand-500/5 hover:-translate-y-0.5">
      {toastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-background/90 text-foreground text-xs font-bold px-4 py-1.5 rounded-full border border-brand-500/30 backdrop-blur-md flex items-center gap-1.5 shadow-md animate-scale-in">
          <Check size={13} className="text-emerald-400 stroke-[3px]" />
          {toastMessage}
        </div>
      )}

      {/* Video Player Box */}
      <div className="relative overflow-hidden bg-black aspect-video flex items-center justify-center border-b border-border/40">
        {videoSrc && !videoError ? (
          <video
            key={videoSrc}
            ref={videoRef}
            src={videoSrc}
            poster={clip.thumbnail_url || undefined}
            controls
            preload="metadata"
            className="w-full h-full object-contain block"
            onError={() => setVideoError(true)}
          >
            Your browser does not support video playback.
          </video>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <Film size={32} className="stroke-[1.5]" />
            <span className="text-[10px] uppercase font-mono tracking-wider">No Video Rendered</span>
          </div>
        )}

        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex gap-1.5 z-10 pointer-events-none">
          <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold backdrop-blur-md shadow-sm", scoreColor(clip.score))}>
            <TrendingUp size={11} className="mr-1 shrink-0" />
            {scoreLabel(clip.score)} &bull; {(clip.score * 100).toFixed(0)}%
          </span>
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold bg-black/50 border-white/10 backdrop-blur-md text-white shadow-sm">
            <Clock size={11} className="mr-1 shrink-0 text-brand-400" />
            {formatDuration(dur)} duration
          </span>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {/* Title */}
        {clip.title && (
          <h4 className="text-sm font-bold leading-snug text-foreground group-hover:text-brand-400 transition-colors">
            {clip.title}
          </h4>
        )}

        {/* Audio Language Dub Section */}
        <div className="flex flex-col gap-2 bg-muted/20 p-3 rounded-lg border border-border/40">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Audio Soundtrack</Label>
            <Select value={selectedLang} onValueChange={(v) => v !== null && setSelectedLang(v)}>
              <SelectTrigger className="w-[120px] h-7 text-xs bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">Original EN</SelectItem>
                <SelectItem value="es">Spanish (ES)</SelectItem>
                <SelectItem value="fr">French (FR)</SelectItem>
                <SelectItem value="de">German (DE)</SelectItem>
                <SelectItem value="pt">Portuguese (PT)</SelectItem>
                <SelectItem value="hi">Hindi (HI)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedLang !== "original" && (
            <div className="mt-1">
              {localClip.dubs?.[selectedLang] ? (
                <div className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                  <Check size={12} className="stroke-[2.5]" /> Dub track active in player!
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Dubbed version for this language has not been generated yet.
                  </p>
                  <Button
                    onClick={() => handleDubClick(selectedLang)}
                    disabled={dubbing}
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-7 font-semibold border-border bg-background"
                  >
                    {dubbing ? (
                      <>
                        <Loader2 size={12} className="animate-spin mr-1.5" />
                        Generating dubbing...
                      </>
                    ) : (
                      `Dub Audio to ${selectedLang.toUpperCase()}`
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Description Outline */}
        {clip.caption && (
          <div className="rounded-lg bg-muted/20 p-3 border border-border/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Social Caption</span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleCopyDesc}
                className={cn(
                  "h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer",
                  copiedDesc && "bg-emerald-500/10 text-emerald-400 hover:text-emerald-400 border border-emerald-500/25"
                )}
                title="Copy Description"
              >
                {copiedDesc ? <Check size={12} className="stroke-[2.5]" /> : <Copy size={12} />}
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap font-medium">
              {clip.caption}
            </p>
          </div>
        )}

        {/* Viral tags outlines */}
        {clip.hashtags && clip.hashtags.length > 0 && (
          <div className="rounded-lg bg-muted/20 p-3 border border-border/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Hashtags</span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleCopyTags}
                className={cn(
                  "h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer",
                  copiedTags && "bg-emerald-500/10 text-emerald-400 hover:text-emerald-400 border border-emerald-500/25"
                )}
                title="Copy Hashtags"
              >
                {copiedTags ? <Check size={12} className="stroke-[2.5]" /> : <Copy size={12} />}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {clip.hashtags.split(/[\s,]+/).filter(t => t.trim().length > 0).map((tag) => {
                const clean = tag.replace("#", "")
                return (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 rounded-md bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 text-[10px] font-bold text-brand-400"
                  >
                    <Hash size={10} />
                    {clean}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Publish / Scheduling Actions */}
        {clip.file_url && (
          <div className="space-y-3 pt-2 border-t border-border/40">
            <div className="flex items-center gap-1.5">
              <Globe size={13} className="text-brand-400" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Social Publication Pipeline</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {["youtube_shorts", "tiktok", "instagram_reels", "linkedin"].map((platform) => {
                const hasAccount = accounts.some((a: any) => a.platform === platform)
                const nameMap: Record<string, string> = {
                  youtube_shorts: "YouTube",
                  tiktok: "TikTok",
                  instagram_reels: "Instagram",
                  linkedin: "LinkedIn",
                }
                return (
                  <Button
                    key={platform}
                    onClick={() => publishWithAccount(platform)}
                    disabled={!!publishing}
                    variant="outline"
                    className={cn("h-8 text-xs font-semibold border-border bg-card", getPlatformGradientClass(platform))}
                  >
                    {nameMap[platform]}
                    {!hasAccount && <Key size={9} className="text-amber-400 ml-1 shrink-0" />}
                  </Button>
                )
              })}
            </div>

            {!accounts.some((a: any) => ["youtube_shorts","tiktok","instagram_reels","linkedin"].includes(a.platform)) && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <Key size={12} className="text-amber-500 shrink-0" />
                <p className="text-[10px] font-semibold text-amber-500/90 leading-relaxed">
                  No accounts linked. <button onClick={() => router.push("/app/settings")} className="underline font-bold hover:text-amber-400 cursor-pointer">Link account in Settings</button>
                </p>
              </div>
            )}

            <Button
              onClick={() => setScheduleForm(!scheduleForm)}
              variant="outline"
              size="sm"
              className={cn("w-full text-xs h-8 font-semibold border-border bg-card hover:bg-muted/40", scheduleForm && "bg-brand-500/10 border-brand-500/35 text-brand-400")}
            >
              <Calendar size={13} className="mr-1.5" />
              {scheduleForm ? "Close Scheduler" : "Schedule Publication Date"}
            </Button>

            {/* Collapsible schedule form */}
            {scheduleForm && (
              <Card className="border border-border/60 bg-muted/20 p-3 space-y-3 mt-2 animate-scale-in">
                <p className="text-xs font-bold text-foreground">Configure Scheduled Task</p>
                {selectedLang !== "original" && localClip.dubs?.[selectedLang] && (
                  <div className="text-[10px] font-semibold text-brand-400 bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <Globe size={11} /> Dub track ({selectedLang.toUpperCase()}) will be published
                  </div>
                )}
                {selectedLang !== "original" && !localClip.dubs?.[selectedLang] && (
                  <div className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                    ⚠️ No dub file ready for {selectedLang.toUpperCase()} - original will be used
                  </div>
                )}
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Channel Destination</label>
                    <Select value={schedulePlatform} onValueChange={(v) => v !== null && setSchedulePlatform(v)}>
                      <SelectTrigger className="w-full h-8 text-xs bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="youtube_shorts">YouTube Shorts</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                        <SelectItem value="instagram_reels">Instagram Reels</SelectItem>
                        <SelectItem value="linkedin">LinkedIn Video</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {accounts.filter((a: any) => a.platform === schedulePlatform).length > 0 ? (
                    <p className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Check size={11} className="stroke-[3px]" /> Linked channel credentials available
                    </p>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-400">
                      <Key size={11} /> Credentials missing. <button onClick={() => router.push("/app/settings")} className="underline font-bold hover:text-amber-300">Add in Settings</button>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Custom Title Override</label>
                    <Input
                      value={scheduleTitle}
                      onChange={e => setScheduleTitle(e.target.value)}
                      placeholder="Title"
                      className="h-8 text-xs bg-background border-border"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Custom Description</label>
                    <Textarea
                      value={scheduleDesc}
                      onChange={e => setScheduleDesc(e.target.value)}
                      placeholder="Description"
                      rows={2}
                      className="text-xs bg-background border-border resize-none min-h-[50px]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Hashtags</label>
                    <Input
                      value={scheduleTags}
                      onChange={e => setScheduleTags(e.target.value)}
                      placeholder="Hashtags"
                      className="h-8 text-xs bg-background border-border"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Publish Date & Time</label>
                    <Input
                      type="datetime-local"
                      value={scheduleAt}
                      onChange={e => setScheduleAt(e.target.value)}
                      className="h-8 text-xs bg-background border-border"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-border/40">
                  <Button onClick={() => setScheduleForm(false)} variant="ghost" size="sm" className="flex-1 text-xs h-8 bg-card border-border font-semibold">Cancel</Button>
                  <Button onClick={submitSchedule} disabled={!scheduleAt || scheduling} size="sm" className="flex-1 text-xs h-8 font-semibold">
                    {scheduling ? "Scheduling..." : "Schedule Task"}
                  </Button>
                </div>
              </Card>
            )}

            {publishError && <p className="text-[10px] font-semibold text-rose-400 mt-1">{publishError}</p>}
            {publishSuccess && <p className="text-[10px] font-semibold text-emerald-400 mt-1">Clip published successfully!</p>}
            {scheduleError && <p className="text-[10px] font-semibold text-rose-400 mt-1">{scheduleError}</p>}
            {scheduleSuccess && <p className="text-[10px] font-semibold text-emerald-400 mt-1">Clip scheduled successfully!</p>}
          </div>
        )}

        <Button
          onClick={handleDownload}
          className="w-full h-9 mt-2 text-xs font-semibold shadow-md bg-brand-500 hover:bg-brand-600 text-white"
        >
          <Download size={14} className="mr-1.5" />
          {selectedLang !== "original" && localClip.dubs?.[selectedLang]
            ? `Download Clip (${selectedLang.toUpperCase()})`
            : "Download Clip Video"
          }
        </Button>
      </div>
    </Card>
  )
})

ClipCard.displayName = "ClipCard"
