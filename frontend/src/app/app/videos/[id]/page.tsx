"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { useDispatch, useSelector, shallowEqual } from "react-redux"
import { AppDispatch, RootState } from "@/store/store"
import { fetchVideo } from "@/store/videoSlice"
import { fetchClips as fetchClipsThunk, Clip } from "@/store/clipSlice"
import {
  ArrowLeft, Sparkles, Globe, Monitor, TrendingUp, RefreshCw,
  Loader2, Film, FileText, Download, Languages, Play
} from "lucide-react"
import { ClipCard } from "@/components/ClipCard"
import { ProcessingOverlay } from "@/components/ProcessingOverlay"
import { DetailSkeleton } from "@/components/LoadingSkeleton"
import { formatScore, cn } from "@/lib/utils"
import { videosAPI } from "@/lib/api"
import { useVideoProgress } from "@/hooks/useVideoProgress"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const SORT_OPTIONS = [
  { key: "score", label: "Viral Score" },
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
  const [pageLoaded, setPageLoaded] = useState(false)
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
    setPageLoaded(false)
    Promise.all([
      dispatch(fetchVideo(id)),
      dispatch(fetchClipsThunk(id)),
    ]).finally(() => setPageLoaded(true))
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

  if (!pageLoaded || (videoLoading && !video)) return <DetailSkeleton />

  if (!video) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Film size={28} className="text-muted-foreground" />
        </div>
        <p className="text-lg font-bold text-foreground">Video not found</p>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">It may have been deleted or the link is invalid.</p>
        <Button onClick={() => router.push("/app")} className="mt-6">
          Back to Dashboard
        </Button>
      </div>
    )
  }

  // Determine overlay status
  const overlayStatus = progressError ? "failed"
    : completed ? "completed"
    : isProcessing ? "processing"
    : "completed"

  return (
    <div className="animate-fade-in space-y-6">
      {/* Dynamic Header */}
      <div className="flex flex-col gap-4 border-b border-border pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg border-border bg-card shrink-0" onClick={() => router.push("/app")}>
              <ArrowLeft size={16} />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-lg sm:text-xl font-bold text-foreground">
                {video.title || "Untitled Video"}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Uploaded {new Date(video.created_at).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric",
                  hour: "2-digit", minute: "2-digit"
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 bg-card border-border"
              onClick={handleRefresh}
              disabled={clipsLoading}
              title="Refresh Clips"
            >
              <RefreshCw size={14} className={cn(clipsLoading && "animate-spin")} />
            </Button>

            {video.segments && video.segments.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/app/videos/${id}/transcript`)}
                className="text-xs h-9 bg-card border-border font-semibold"
                title="Edit Transcript"
              >
                <FileText size={14} className="mr-1.5" />
                Transcript
              </Button>
            )}

            {!isProcessing && clips.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
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
                  className="text-xs h-9 bg-card border-border font-semibold"
                  title="Download All Clips as ZIP"
                >
                  <Download size={14} className="mr-1.5" />
                  ZIP Export
                </Button>

                <Button
                  variant="outline"
                  size="sm"
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
                  className="text-xs h-9 bg-card border-border font-semibold"
                  title="Dub all clips to another language"
                >
                  <Languages size={14} className="mr-1.5" />
                  Dub All
                </Button>
              </>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleReprocess}
              disabled={isReprocessing}
              className="text-xs h-9 bg-card border-border text-destructive hover:bg-destructive/10 hover:text-destructive font-semibold"
              title="Force Reprocess Video"
            >
              {isReprocessing ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-1.5" />
                  Queued...
                </>
              ) : (
                "Force Reprocess"
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Workspace Split Layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Column: Player / Processing view */}
        <div className="w-full lg:flex-1">
          <div className="relative rounded-xl border border-border overflow-hidden bg-black shadow-lg">
            <ProcessingOverlay
              videoUrl={video.source_url}
              progress={progressState.progress}
              message={progressState.message}
              status={overlayStatus}
              error={progressError}
            />
          </div>
        </div>

        {/* Right Column: Statistics panel */}
        {!isProcessing && (
          <div className="w-full lg:w-72 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-4 shrink-0">
            {[
              { icon: Sparkles, label: "Total Clips", value: clips.length.toString(), color: "text-brand-400 border-brand-500/20 bg-brand-500/5" },
              { icon: TrendingUp, label: "Top Score", value: clips.length > 0 ? `${formatScore(Math.max(...clips.map(c => c.score)))}%` : "0%", color: "text-amber-400 border-amber-500/20 bg-amber-500/5" },
              { icon: Monitor, label: "Avg Score", value: `${formatScore(clips.reduce((a, b) => a + b.score, 0) / Math.max(1, clips.length))}%`, color: "text-blue-400 border-blue-500/20 bg-blue-500/5" },
              { icon: Globe, label: "Detected Language", value: (video.language || "EN").toUpperCase(), color: "text-purple-400 border-purple-500/20 bg-purple-500/5" },
            ].map((stat, i) => (
              <Card key={i} className="border border-border/60 bg-card/40 backdrop-blur-md overflow-hidden transition-all duration-300 hover:bg-card/75">
                <div className="p-4 flex lg:flex-row items-center gap-3.5">
                  <div className={cn("flex size-9 items-center justify-center rounded-lg border shrink-0", stat.color)}>
                    <stat.icon size={16} />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground leading-none">{stat.value}</p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">{stat.label}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Segmented Sort Controls */}
      {!isProcessing && clips.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4 pt-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground">Generated Shorts</h2>
            <p className="text-xs text-muted-foreground">Select clips to schedule, publish, or view transcript references</p>
          </div>
          <div className="flex bg-muted/60 border border-border/40 p-1 rounded-lg w-fit shrink-0">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSortKey(opt.key)}
                className={cn(
                  "px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 cursor-pointer",
                  sortKey === opt.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Clips Grid list */}
      {!isProcessing && clips.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {sortedClips.map((clip: Clip) => (
            <ClipCard key={clip.id} clip={clip} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!clipsLoading && clips.length === 0 && !isProcessing && (
        <Card className="border border-dashed border-border bg-card/10 p-12 text-center">
          <Film size={40} className="mx-auto text-muted-foreground/60 mb-4" />
          <h3 className="text-base font-semibold text-foreground">No clips generated</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Try reprocessing this project or upload a different video to generate shorts.
          </p>
          <div className="mt-5 flex gap-3 justify-center">
            <Button variant="outline" size="sm" onClick={handleReprocess} disabled={isReprocessing} className="text-xs">
              {isReprocessing ? "Reprocessing..." : "Force Reprocess Video"}
            </Button>
            <Button size="sm" onClick={() => router.push("/app/new")} className="text-xs font-semibold">
              Create New Project
            </Button>
          </div>
        </Card>
      )}

      {/* Loading Skeleton */}
      {clipsLoading && clips.length === 0 && !isProcessing && (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border border-border/60 bg-card/40 overflow-hidden">
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="space-y-3 p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 flex-1 rounded-lg" />
                  <Skeleton className="h-8 w-16 rounded-lg" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
