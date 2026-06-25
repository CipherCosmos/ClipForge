"use client"

import { useState, useRef } from "react"
import { Download, Copy, Check, Clock, TrendingUp, Hash, Film } from "lucide-react"
import { formatDuration, cn } from "@/lib/utils"

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
  hashtags: string[] | null
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

export function ClipCard({ clip }: ClipCardProps) {
  const [copiedDesc, setCopiedDesc] = useState(false)
  const [copiedTags, setCopiedTags] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const dur = clip.end_time - clip.start_time

  const handleCopyDesc = async () => {
    try {
      await navigator.clipboard.writeText(clip.caption)
      setCopiedDesc(true)
      setTimeout(() => setCopiedDesc(false), 2000)
    } catch {}
  }

  const handleCopyTags = async () => {
    try {
      if (!clip.hashtags) return
      const rawTags = clip.hashtags.split(/[\s,]+/).filter(t => t.trim().length > 0).map(t => (t.startsWith("#") ? t : `#${t}`)).join(" ")
      await navigator.clipboard.writeText(rawTags)
      setCopiedTags(true)
      setTimeout(() => setCopiedTags(false), 2000)
    } catch {}
  }

  const handleDownload = async () => {
    try {
      const res = await fetch(clip.file_url)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `clip-${clip.id.slice(0, 8)}.mp4`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      window.open(clip.file_url, "_blank")
    }
  }

  return (
    <div className="card group animate-scale-in overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-black/5">
      <div className="relative overflow-hidden bg-slate-900 flex items-center justify-center min-h-[200px]">
        {clip.file_url && !videoError ? (
          <video
            ref={videoRef}
            src={clip.file_url}
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
}

