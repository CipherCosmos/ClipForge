"use client"

import { useRouter } from "next/navigation"
import { Clock, TrendingUp, Trash2, Check, Sparkles, AlertCircle, Play, Film, Loader2 } from "lucide-react"
import { cn, formatDuration, formatDate, formatScore, statusLabel } from "@/lib/utils"
import { useState } from "react"
import { videosAPI } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface Video {
  id: string
  source_url: string
  status: string
  duration: number | null
  title: string | null
  language: string | null
  platform: string | null
  viral_score: number | null
  thumbnail_url?: string | null
  created_at: string
}

interface VideoCardProps {
  video: Video
  onDelete?: (id: string) => void
  selected?: boolean
  onSelectChange?: (id: string, selected: boolean) => void
}

export function VideoCard({ video, onDelete, selected, onSelectChange }: VideoCardProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [imgError, setImgError] = useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm("Delete this video and all its clips?")) return
    setDeleting(true)
    try {
      await videosAPI.delete(video.id)
      onDelete?.(video.id)
    } catch {
      alert("Failed to delete video. Please try again.")
    } finally {
      setDeleting(false)
    }
  }

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelectChange?.(video.id, !selected)
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "uploaded":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20"
      case "processing":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse"
      case "completed":
      case "ready":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      case "failed":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20"
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/20"
    }
  }

  const getPlatformStyle = (platform: string | null) => {
    if (!platform) return "bg-muted text-muted-foreground"
    const p = platform.toLowerCase()
    if (p.includes("youtube")) return "bg-red-500/10 text-red-400 border-red-500/20"
    if (p.includes("tiktok")) return "bg-slate-800 text-slate-200 border-slate-700"
    if (p.includes("instagram")) return "bg-pink-500/10 text-pink-400 border-pink-500/20"
    if (p.includes("linkedin")) return "bg-blue-600/10 text-blue-400 border-blue-600/20"
    return "bg-muted text-muted-foreground"
  }

  const thumbnailUrl = video.thumbnail_url

  return (
    <Card
      onClick={() => router.push(`/app/videos/${video.id}`)}
      className={cn(
        "group relative cursor-pointer overflow-hidden border border-border bg-card/40 transition-all duration-300 hover:border-brand-500/30 hover:bg-card/80 hover:shadow-lg hover:shadow-brand-500/5 hover:-translate-y-0.5",
        selected && "border-brand-500/50 bg-brand-500/[0.02]",
        deleting && "opacity-50 pointer-events-none"
      )}
    >
      <div className="relative aspect-video overflow-hidden bg-muted/30">
        {onSelectChange && (
          <button
            onClick={handleSelectClick}
            className={cn(
              "absolute top-2.5 left-2.5 z-20 flex size-6 items-center justify-center rounded-md border border-border backdrop-blur-md transition-all duration-200 cursor-pointer",
              selected
                ? "bg-brand-500 border-brand-500 text-white"
                : "bg-black/40 border-white/20 text-white/60 hover:text-white hover:bg-black/60"
            )}
            title={selected ? "Deselect" : "Select"}
          >
            {selected && <Check size={14} className="stroke-[3px]" />}
          </button>
        )}

        {thumbnailUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt={"Thumbnail for " + (video.title || "video")}
            className="absolute inset-0 h-full w-full object-cover transition-all duration-500 group-hover:scale-105"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted/50 to-card">
            <div className="flex flex-col items-center gap-1.5 text-muted-foreground group-hover:text-brand-400 transition-colors">
              <Film size={28} className="stroke-[1.5]" />
              <span className="text-[10px] font-mono uppercase tracking-wider">No Thumbnail</span>
            </div>
          </div>
        )}

        {/* Hover overlay play button */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <div className="size-11 rounded-full bg-brand-500 text-white flex items-center justify-center shadow-lg shadow-brand-500/30 scale-90 group-hover:scale-100 transition-transform duration-300">
            <Play size={18} className="fill-current translate-x-0.5" />
          </div>
        </div>

        {deleting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <Loader2 className="h-7 w-7 animate-spin text-brand-400" />
          </div>
        )}

        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between z-10 pointer-events-none">
          <span className={cn("text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border backdrop-blur-md", getStatusStyle(video.status))}>
            {statusLabel(video.status)}
          </span>
          {video.duration && (
            <span className="flex items-center gap-1 rounded-full bg-black/50 border border-white/10 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-white">
              <Clock size={10} />
              {formatDuration(video.duration)}
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="space-y-1">
          <h3 className="truncate text-sm font-bold text-foreground group-hover:text-brand-400 transition-colors">
            {video.title || "Untitled Video"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {video.language && `${video.language.toUpperCase()} · `}
            {formatDate(video.created_at)}
          </p>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-border/40">
          <div className="flex items-center gap-2">
            {video.viral_score !== null && (
              <span className="flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                <TrendingUp size={11} />
                {formatScore(video.viral_score)}% score
              </span>
            )}
            {video.platform && (
              <span className={cn("rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider", getPlatformStyle(video.platform))}>
                {video.platform.replace(/_/g, " ")}
              </span>
            )}
          </div>
          <Button
            onClick={handleDelete}
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground opacity-0 transition-all hover:text-destructive hover:bg-destructive/10 group-hover:opacity-100 max-sm:opacity-100 cursor-pointer"
            title="Delete video"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>
    </Card>
  )
}
