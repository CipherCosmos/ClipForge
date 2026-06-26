"use client"

import { useRouter } from "next/navigation"
import { Film, Clock, TrendingUp, Trash2, CheckSquare, Square } from "lucide-react"
import { cn, formatDuration, formatDate, formatScore, statusLabel, statusColor } from "@/lib/utils"
import { useState } from "react"
import { videosAPI } from "@/lib/api"

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
  onSelectChange?: (selected: boolean) => void
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
    onSelectChange?.(!selected)
  }

  const thumbnailUrl = video.thumbnail_url

  return (
    <div
      onClick={() => router.push(`/app/videos/${video.id}`)}
      className={cn(
        "card-hover group cursor-pointer animate-slide-up overflow-hidden",
        deleting && "opacity-50 pointer-events-none"
      )}
    >
      <div className="relative aspect-video overflow-hidden bg-slate-900">
        {onSelectChange && (
          <button
            onClick={handleSelectClick}
            className="absolute top-2 left-2 z-10 p-1 rounded-md bg-black/50 hover:bg-black/70 transition-colors"
            title={selected ? "Deselect" : "Select"}
          >
            {selected ? (
              <CheckSquare size={18} className="text-brand-400" />
            ) : (
              <Square size={18} className="text-slate-400" />
            )}
          </button>
        )}
        {thumbnailUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt={"Thumbnail for " + (video.title || "video")}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film size={32} className="text-slate-700" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent opacity-60" />
        {deleting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
          </div>
        )}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
          <span className={statusColor(video.status)}>
            {statusLabel(video.status)}
          </span>
          {video.duration && (
            <span className="badge-slate flex items-center gap-1">
              <Clock size={12} />
              {formatDuration(video.duration)}
            </span>
          )}
        </div>
      </div>

      <div className="p-4">
        <h3 className="mb-1 truncate text-sm font-semibold text-slate-100">
          {video.title || "Untitled Video"}
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          {video.language && `${video.language} · `}
          {formatDate(video.created_at)}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {video.viral_score !== null && (
              <span className="flex items-center gap-1 rounded-md bg-amber-900/20 px-2 py-0.5 text-xs font-medium text-amber-400">
                <TrendingUp size={12} />
                {formatScore(video.viral_score)}%
              </span>
            )}
            {video.platform && (
              <span className="badge-slate text-[10px] uppercase tracking-wider">
                {video.platform.replace(/_/g, " ")}
              </span>
            )}
          </div>
          <button
            onClick={handleDelete}
            className="btn-ghost p-1 text-slate-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100 max-sm:opacity-100"
            title="Delete video"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
