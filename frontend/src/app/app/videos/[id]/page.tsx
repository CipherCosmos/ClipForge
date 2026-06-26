"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { useDispatch, useSelector, shallowEqual } from "react-redux"
import { AppDispatch, RootState } from "@/store/store"
import { fetchVideo } from "@/store/videoSlice"
import { fetchClips as fetchClipsThunk, Clip } from "@/store/clipSlice"
import {
  ArrowLeft, Sparkles, Globe, Monitor, TrendingUp, RefreshCw,
  Loader2, Film, FileText, Download, Languages
} from "lucide-react"
import { ClipCard } from "@/components/ClipCard"
import { ProcessingOverlay } from "@/components/ProcessingOverlay"
import { DetailSkeleton } from "@/components/LoadingSkeleton"
import { formatScore, cn } from "@/lib/utils"
import { videosAPI } from "@/lib/api"
import { useVideoProgress } from "@/hooks/useVideoProgress"

const SORT_OPTIONS = [
  { key: "score", label: "Score" },
  { key: "duration", label: "Duration" },
  { key: "newest", label: "Newest" },
] as const

type SortKey = typeof SORT_OPTIONS[number]["key"]

export default function VideoDetailPage() {
  const params = useParams()
  const router = useRouter()
  const dispatch = useDispatch<AppDispatch>()
  const { currentVideo: video, loading: videoLoading } = useSelector((s: RootState) => ({
    currentVideo: s.videos.currentVideo,
    loading: s.videos.loading,
  }), shallowEqual)
  const { clips, loading: clipsLoading } = useSelector((s: RootState) => ({
    clips: s.clips.clips,
    loading: s.clips.loading,
  }), shallowEqual)
  const [sortKey, setSortKey] = useState<SortKey>("score")
  const id = params.id as string

  const isProcessing = video?.status === "uploaded" || video?.status === "processing"
  const { state: progressState, completed, error: progressError } = useVideoProgress(
    isProcessing ? id : null
  )

  // Stable dispatch — fetch only once per id
  const fetchedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!id) return
    if (fetchedRef.current === id) return
    fetchedRef.current = id
    dispatch(fetchVideo(id))
    dispatch(fetchClipsThunk(id))
  }, [id, dispatch])

  // Refresh when processing completes
  useEffect(() => {
    if (completed) {
      dispatch(fetchVideo({ id, force: true }))
      dispatch(fetchClipsThunk({ video_id: id, force: true }))
    }
  }, [completed, id, dispatch])

  const handleRefresh = useCallback(() => {
    if (id) {
      dispatch(fetchVideo({ id, force: true }))
      dispatch(fetchClipsThunk({ video_id: id, force: true }))
    }
  }, [id, dispatch])

  const [isReprocessing, setIsReprocessing] = useState(false)
  const handleReprocess = async () => {
    if (!id || !confirm("Reprocessing will delete all existing clips. Continue?")) return
    setIsReprocessing(true)
    try {
      const { videosAPI } = await import("@/lib/api")
      await videosAPI.reprocess(id)
      window.location.reload()
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to reprocess video. Make sure the processing backend (Celery + Redis) is running."
      alert(msg)
    } finally {
      setIsReprocessing(false)
    }
  }

  const sortedClips = useMemo(() => [...clips].sort((a: Clip, b: Clip) => {
    if (sortKey === "score") return b.score - a.score
    if (sortKey === "duration") {
      return (b.end_time - b.start_time) - (a.end_time - a.start_time)
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  }), [clips, sortKey])

  if (videoLoading && !video) return <DetailSkeleton />

  if (!video) {
    return (
      <div className="flex flex-col items-center py-20">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800">
          <Film size={28} className="text-slate-600" />
        </div>
        <p className="text-lg text-slate-400">Video not found</p>
        <p className="mt-1 text-sm text-slate-500">It may have been deleted or the link is invalid.</p>
        <button onClick={() => router.push("/app")} className="btn-primary mt-6">
          Back to Dashboard
        </button>
      </div>
    )
  }

  // Determine overlay status
  const overlayStatus = progressError ? "failed"
    : completed ? "completed"
    : isProcessing ? "processing"
    : "completed"

  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => router.push("/app")} className="btn-ghost -ml-2 shrink-0">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-lg sm:text-xl font-bold text-white dark:text-white">
            {video.title || "Untitled Video"}
          </h1>
          <p className="text-sm text-slate-400">
            {new Date(video.created_at).toLocaleDateString("en-US", {
              month: "long", day: "numeric", year: "numeric",
              hour: "2-digit", minute: "2-digit"
            })}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={clipsLoading}
          className="btn-ghost p-2"
          title="Refresh"
        >
          <RefreshCw size={16} className={cn(clipsLoading && "animate-spin")} />
        </button>
        {video.segments && video.segments.length > 0 && (
          <button
            onClick={() => router.push(`/app/videos/${id}/transcript`)}
            className="btn-secondary text-xs px-2.5 sm:px-3 whitespace-nowrap"
            title="Edit Transcript"
          >
            <FileText size={14} className="mr-1" />
            Edit Transcript
          </button>
        )}
        {!isProcessing && clips.length > 0 && (
          <button
            onClick={async () => {
              try {
                const res = await videosAPI.exportZip(id)
                const url = URL.createObjectURL(res.data as Blob)
                const a = document.createElement("a")
                a.href = url
                a.download = `${video.title || "clipforge-export"}.zip`
                a.click()
                URL.revokeObjectURL(url)
              } catch {
                alert("Failed to export ZIP")
              }
            }}
            className="btn-secondary text-xs px-2.5 sm:px-3 whitespace-nowrap"
            title="Download All Clips as ZIP"
          >
            <Download size={14} className="mr-1" />
            Export ZIP
          </button>
        )}
        {!isProcessing && clips.length > 0 && (
          <button
            onClick={async () => {
              const lang = prompt("Target language code (e.g. es, fr, de):", "es")
              if (!lang) return
              try {
                await videosAPI.dub(id, lang)
                alert(`Dubbing queued for all clips to ${lang}`)
              } catch {
                alert("Failed to queue dubbing")
              }
            }}
            className="btn-secondary text-xs px-2.5 sm:px-3 whitespace-nowrap"
            title="Dub all clips to another language"
          >
            <Languages size={14} className="mr-1" />
            Dub All
          </button>
        )}
        <button
          onClick={handleReprocess}
          disabled={isReprocessing}
          className="btn-secondary text-xs px-2.5 sm:px-3 whitespace-nowrap"
          title="Reprocess Video (or Force Restart)"
        >
          {isReprocessing ? "Reprocessing..." : "Force Reprocess"}
        </button>
      </div>

      {/* Video player + processing overlay */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        <div className="w-full lg:flex-1">
          <ProcessingOverlay
            videoUrl={video.source_url}
            progress={progressState.progress}
            message={progressState.message}
            status={overlayStatus}
            error={progressError}
          />
        </div>

        {/* Stats cards (only visible when not actively processing) - stacked on mobile, side panel on desktop */}
        {!isProcessing && (
          <div className="w-full lg:w-72 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-3">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10">
                <Sparkles size={16} className="text-brand-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">{clips.length}</p>
                <p className="text-[11px] text-slate-500">Clips</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                <TrendingUp size={16} className="text-amber-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">
                  {clips.length > 0 ? formatScore(Math.max(...clips.map(c => c.score))) : "0"}
                </p>
                <p className="text-[11px] text-slate-500">Top Score</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                <Monitor size={16} className="text-blue-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">
                  {formatScore(clips.reduce((a, b) => a + b.score, 0) / Math.max(1, clips.length))}
                </p>
                <p className="text-[11px] text-slate-500">Avg Score</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
                <Globe size={16} className="text-purple-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white uppercase">{video.language || "EN"}</p>
                <p className="text-[11px] text-slate-500">Detected Language</p>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Sort Controls */}
      {!isProcessing && clips.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Generated Clips</h2>
          <div className="flex gap-2 overflow-x-auto">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSortKey(opt.key)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  sortKey === opt.key
                    ? "bg-brand-500 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Clips Grid */}
      {!isProcessing && clips.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {sortedClips.map((clip: Clip) => (
            <ClipCard key={clip.id} clip={clip} />
          ))}
        </div>
      )}

      {!clipsLoading && clips.length === 0 && !isProcessing && (
        <div className="card flex flex-col items-center py-12 sm:py-16 px-4">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800">
            <Film size={28} className="text-slate-600" />
          </div>
          <p className="text-lg text-slate-400">No clips generated</p>
          <p className="mt-1 text-sm text-slate-500">
            Try uploading a different video or check the processing status.
          </p>
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleReprocess}
              disabled={isReprocessing}
              className="btn-secondary"
            >
              {isReprocessing ? "Reprocessing..." : "Force Reprocess Video"}
            </button>
            <button onClick={() => router.push("/app/new")} className="btn-primary">
              Create New Project
            </button>
          </div>
        </div>
      )}

      {clipsLoading && clips.length === 0 && !isProcessing && (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse overflow-hidden">
              <div className="aspect-video bg-slate-800" />
              <div className="space-y-3 p-4">
                <div className="h-4 w-3/4 rounded bg-slate-800" />
                <div className="h-3 w-full rounded bg-slate-800" />
                <div className="flex gap-2">
                  <div className="h-8 flex-1 rounded-lg bg-slate-800" />
                  <div className="h-8 w-16 rounded-lg bg-slate-800" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
