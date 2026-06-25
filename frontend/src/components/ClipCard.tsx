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
  const [copied, setCopied] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const dur = clip.end_time - clip.start_time

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(clip.caption)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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
      <div className="relative aspect-video overflow-hidden bg-slate-900">
        {clip.file_url && !videoError ? (
          <video
            ref={videoRef}
            src={clip.file_url}
            poster={clip.thumbnail_url || undefined}
            controls
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setVideoError(true)}
          >
            Your browser does not support video playback.
          </video>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film size={32} className="text-slate-700" />
          </div>
        )}
        <div className="absolute bottom-2 left-2 flex gap-1.5">
          <span className={cn("badge border text-[11px] font-semibold", scoreColor(clip.score))}>
            <TrendingUp size={12} className="mr-1" />
            {scoreLabel(clip.score)} &middot; {(clip.score * 100).toFixed(0)}
          </span>
          <span className="badge-slate gap-1 text-[11px]">
            <Clock size={12} />
            {formatDuration(dur)}
          </span>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {clip.title && (
          <p className="text-sm font-semibold leading-snug text-slate-100">
            {clip.title}
          </p>
        )}
        {clip.caption && (
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-400">
            {clip.caption}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="btn-primary flex-1 text-xs"
          >
            <Download size={14} />
            Download
          </button>
          <button
            onClick={handleCopy}
            className={cn(
              "btn-secondary px-3 text-xs",
              copied && "border-emerald-700 bg-emerald-900/20 text-emerald-400"
            )}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>

        {clip.hashtags && clip.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {clip.hashtags.split(/[\s,]+/).filter(t => t.trim().length > 0).slice(0, 5).map((tag) => {
              const clean = tag.replace("#", "")
              return (
                <span
                  key={tag}
                  className="inline-flex items-center gap-0.5 rounded-md bg-brand-900/15 px-1.5 py-0.5 text-[10px] text-brand-400/70"
                >
                  <Hash size={10} />
                  {clean}
                </span>
              )
            })}
            {clip.hashtags.split(/[\s,]+/).filter(t => t.trim().length > 0).length > 5 && (
              <span className="text-[10px] text-slate-600">+{clip.hashtags.split(/[\s,]+/).filter(t => t.trim().length > 0).length - 5}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
