"use client"

import { memo, useState, useRef, useEffect } from "react"
import { Download, Copy, Check, Clock, TrendingUp, Hash, Film, Globe, Calendar } from "lucide-react"
import { formatDuration, cn } from "@/lib/utils"
import { clipsAPI, scheduleAPI } from "@/lib/api"

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
  if (score >= 0.7) return "text-emerald-400 bg-emerald-900/20 border-emerald-700/30"
  if (score >= 0.4) return "text-amber-400 bg-amber-900/20 border-amber-700/30"
  return "text-red-400 bg-red-900/20 border-red-700/30"
}

function scoreLabel(score: number): string {
  if (score >= 0.7) return "High"
  if (score >= 0.4) return "Medium"
  return "Low"
}

export const ClipCard = memo(function ClipCard({ clip }: ClipCardProps) {
  const [localClip, setLocalClip] = useState<Clip>(clip)
  const [selectedLang, setSelectedLang] = useState<string>("original")
  const [dubbing, setDubbing] = useState<boolean>(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [publishError, setPublishError] = useState("")
  const [publishSuccess, setPublishSuccess] = useState(false)
  const [publishForm, setPublishForm] = useState<{platform: string; token: string; title: string; description: string} | null>(null)
  const [scheduleForm, setScheduleForm] = useState<boolean>(false)
  const [schedulePlatform, setSchedulePlatform] = useState<string>("youtube_shorts")
  const [scheduleToken, setScheduleToken] = useState<string>("")
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
      showToast("Description copied to clipboard!")
      setTimeout(() => setCopiedDesc(false), 2000)
    } catch {}
  }

  const handleCopyTags = async () => {
    try {
      if (!clip.hashtags) return
      const rawTags = clip.hashtags.split(/[\s,]+/).filter(t => t.trim().length > 0).map(t => (t.startsWith("#") ? t : `#${t}`)).join(" ")
      await navigator.clipboard.writeText(rawTags)
      setCopiedTags(true)
      showToast("Viral tags copied to clipboard!")
      setTimeout(() => setCopiedTags(false), 2000)
    } catch {}
  }

  const videoSrc = selectedLang !== "original" && localClip.dubs?.[selectedLang]
    ? localClip.dubs[selectedLang]
    : clip.file_url

  const openPublishForm = (platform: string) => {
    setPublishForm({ platform, token: "", title: clip.title || "", description: clip.caption || "" })
  }

  const submitPublish = async () => {
    if (!publishForm) return
    setPublishing(publishForm.platform)
    setPublishError("")
    setPublishSuccess(false)
    try {
      const res = await clipsAPI.publish(clip.id, publishForm.platform, publishForm.token, publishForm.title, publishForm.description, clip.hashtags || "")
      if (res.data.success) {
        setPublishSuccess(true)
        setPublishForm(null)
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
    setScheduling(true)
    setScheduleError("")
    setScheduleSuccess(false)
    try {
      const res = await scheduleAPI.create({
        clip_id: clip.id,
        platform: schedulePlatform,
        title: scheduleTitle || clip.title || "",
        description: scheduleDesc || clip.caption || "",
        hashtags: scheduleTags || clip.hashtags || "",
        access_token: scheduleToken,
        scheduled_at: new Date(scheduleAt).toISOString(),
      })
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
    showToast(`Started dubbing clip to ${lang.toUpperCase()}...`)
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
            showToast(`Dubbing to ${lang.toUpperCase()} completed successfully!`)
            clearInterval(interval)
          } else if (attempts >= maxAttempts) {
            setDubbing(false)
            showToast("Dubbing timed out. Please try again.")
            clearInterval(interval)
          }
        } catch {
          // Keep polling
        }
      }, 3000)
    } catch (err) {
      setDubbing(false)
      showToast("Failed to start dubbing. Please try again.")
    }
  }

  return (
    <div className="card group relative animate-scale-in overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-black/5 border border-slate-800/80 bg-slate-900/40 backdrop-blur-md">
      {toastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in bg-slate-900/90 text-slate-100 text-xs font-semibold px-4 py-2 rounded-full border border-brand-500/30 backdrop-blur-md flex items-center gap-1.5 shadow-lg shadow-black/40">
          <Check size={14} className="text-emerald-400" />
          {toastMessage}
        </div>
      )}

      <div className="relative overflow-hidden bg-slate-900 flex items-center justify-center min-h-[200px]">
        {videoSrc && !videoError ? (
          <video
            key={videoSrc}
            ref={videoRef}
            src={videoSrc}
            poster={clip.thumbnail_url || undefined}
            controls
            preload="metadata"
            className="w-full h-auto max-h-[500px] object-contain"
            onError={() => setVideoError(true)}
          >
            Your browser does not support video playback.
          </video>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film size={32} className="text-slate-700" />
          </div>
        )}
        <div className="absolute bottom-2 left-2 flex gap-1.5 z-10 pointer-events-none">
          <span className={cn("badge border text-[11px] font-semibold bg-black/60 backdrop-blur-md", scoreColor(clip.score))}>
            <TrendingUp size={12} className="mr-1" />
            {scoreLabel(clip.score)} &middot; {(clip.score * 100).toFixed(0)}
          </span>
          <span className="badge-slate gap-1 text-[11px] bg-black/60 backdrop-blur-md text-white border border-white/10">
            <Clock size={12} />
            {formatDuration(dur)}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {clip.title && (
          <p className="text-base font-bold leading-snug text-slate-100">
            {clip.title}
          </p>
        )}

        <div className="flex flex-col gap-2 bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Audio Language</span>
            <select
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
            >
              <option value="original">Original Language</option>
              <option value="es">Spanish (ES)</option>
              <option value="fr">French (FR)</option>
              <option value="de">German (DE)</option>
              <option value="pt">Portuguese (PT)</option>
              <option value="hi">Hindi (HI)</option>
            </select>
          </div>

          {selectedLang !== "original" && (
            <div className="mt-2">
              {localClip.dubs?.[selectedLang] ? (
                <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 bg-emerald-950/20 border border-emerald-800/20 px-2 py-1 rounded-md">
                  <Check size={12} /> Dubbed audio ready! Playing in player.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] text-slate-400">
                    Dubbed version for this language has not been generated yet.
                  </p>
                  <button
                    onClick={() => handleDubClick(selectedLang)}
                    disabled={dubbing}
                    className="w-full btn-ghost py-1.5 text-xs flex items-center justify-center gap-2 border border-slate-700 bg-slate-800/60 hover:bg-slate-700/80 disabled:opacity-50"
                  >
                    {dubbing ? (
                      <>
                        <div className="h-3 w-3 animate-spin rounded-full border border-slate-400 border-t-transparent" />
                        Dubbing clip...
                      </>
                    ) : (
                      <>Dub Audio to {selectedLang.toUpperCase()}</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {clip.caption && (
          <div className="rounded-lg bg-slate-800/40 p-3 border border-slate-700/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</span>
              <button
                onClick={handleCopyDesc}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  copiedDesc ? "bg-emerald-900/30 text-emerald-400" : "bg-slate-700 hover:bg-slate-600 text-slate-300"
                )}
                title="Copy Description"
              >
                {copiedDesc ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">
              {clip.caption}
            </p>
          </div>
        )}

        {clip.hashtags && clip.hashtags.length > 0 && (
          <div className="rounded-lg bg-slate-800/40 p-3 border border-slate-700/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Viral Tags</span>
              <button
                onClick={handleCopyTags}
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  copiedTags ? "bg-emerald-900/30 text-emerald-400" : "bg-slate-700 hover:bg-slate-600 text-slate-300"
                )}
                title="Copy Tags"
              >
                {copiedTags ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {clip.hashtags.split(/[\s,]+/).filter(t => t.trim().length > 0).map((tag) => {
                const clean = tag.replace("#", "")
                return (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md bg-brand-900/15 px-2 py-1 text-xs text-brand-400/80 border border-brand-800/30"
                  >
                    <Hash size={12} />
                    {clean}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Publish section */}
        {clip.file_url && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Publish To</span>
            </div>
            <div className="flex gap-2">
              {["youtube_shorts", "tiktok", "instagram_reels", "linkedin"].map((platform) => (
                <button key={platform} onClick={() => openPublishForm(platform)} disabled={!!publishForm}
                  className="flex-1 btn-ghost py-1.5 text-xs flex items-center justify-center gap-1.5">
                  {platform === "youtube_shorts" ? "YouTube" : platform === "tiktok" ? "TikTok" : platform === "instagram_reels" ? "Instagram" : "LinkedIn"}
                </button>
              ))}
            </div>
            <button onClick={() => setScheduleForm(true)} disabled={!!publishForm}
              className="w-full btn-ghost py-1.5 text-xs flex items-center justify-center gap-1.5 mt-1">
              <Calendar size={14} /> Schedule
            </button>
            
            {/* Publish form popup */}
            {publishForm && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3 space-y-2 mt-2">
                <p className="text-xs font-semibold text-white">Publish to {publishForm.platform}</p>
                <input value={publishForm.token} onChange={e => setPublishForm({...publishForm, token: e.target.value})}
                  placeholder="Access token" className="w-full rounded bg-slate-900 border border-slate-600 px-2 py-1.5 text-xs text-white" />
                <input value={publishForm.title} onChange={e => setPublishForm({...publishForm, title: e.target.value})}
                  placeholder="Title" className="w-full rounded bg-slate-900 border border-slate-600 px-2 py-1.5 text-xs text-white" />
                <div className="flex gap-2">
                  <button onClick={() => setPublishForm(null)} className="flex-1 btn-ghost py-1 text-xs">Cancel</button>
                  <button onClick={submitPublish} disabled={!publishForm.token || publishing === publishForm.platform}
                    className="flex-1 btn-primary py-1 text-xs">
                    {publishing === publishForm.platform ? "Publishing..." : "Publish"}
                  </button>
                </div>
              </div>
            )}
            
            {/* Schedule form popup */}
            {scheduleForm && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/80 p-3 space-y-2 mt-2">
                <p className="text-xs font-semibold text-white">Schedule Publication</p>
                <select value={schedulePlatform} onChange={e => setSchedulePlatform(e.target.value)}
                  className="w-full rounded bg-slate-900 border border-slate-600 px-2 py-1.5 text-xs text-white">
                  <option value="youtube_shorts">YouTube Shorts</option>
                  <option value="tiktok">TikTok</option>
                  <option value="instagram_reels">Instagram Reels</option>
                  <option value="linkedin">LinkedIn</option>
                </select>
                <input value={scheduleToken} onChange={e => setScheduleToken(e.target.value)}
                  placeholder="Access token" className="w-full rounded bg-slate-900 border border-slate-600 px-2 py-1.5 text-xs text-white" />
                <input value={scheduleTitle} onChange={e => setScheduleTitle(e.target.value)}
                  placeholder="Title" className="w-full rounded bg-slate-900 border border-slate-600 px-2 py-1.5 text-xs text-white" />
                <textarea value={scheduleDesc} onChange={e => setScheduleDesc(e.target.value)}
                  placeholder="Description" rows={2} className="w-full rounded bg-slate-900 border border-slate-600 px-2 py-1.5 text-xs text-white resize-none" />
                <input value={scheduleTags} onChange={e => setScheduleTags(e.target.value)}
                  placeholder="Hashtags" className="w-full rounded bg-slate-900 border border-slate-600 px-2 py-1.5 text-xs text-white" />
                <input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)}
                  className="w-full rounded bg-slate-900 border border-slate-600 px-2 py-1.5 text-xs text-white" />
                <div className="flex gap-2">
                  <button onClick={() => setScheduleForm(false)} className="flex-1 btn-ghost py-1 text-xs">Cancel</button>
                  <button onClick={submitSchedule} disabled={!scheduleToken || !scheduleAt || scheduling}
                    className="flex-1 btn-primary py-1 text-xs">
                    {scheduling ? "Scheduling..." : "Schedule"}
                  </button>
                </div>
              </div>
            )}

            {publishError && <p className="text-xs text-red-400 mt-1">{publishError}</p>}
            {publishSuccess && <p className="text-xs text-emerald-400 mt-1">Published successfully!</p>}
            {scheduleError && <p className="text-xs text-red-400 mt-1">{scheduleError}</p>}
            {scheduleSuccess && <p className="text-xs text-emerald-400 mt-1">Scheduled successfully!</p>}
          </div>
        )}

        <button
          onClick={handleDownload}
          className="btn-primary w-full py-2.5 mt-2 shadow-lg shadow-brand-500/20"
        >
          <Download size={16} className="mr-2" />
          Download Video
        </button>
      </div>
    </div>
  )
})
