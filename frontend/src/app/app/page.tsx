"use client"

import { useEffect, useState, useCallback } from "react"
import { useDispatch, useSelector } from "react-redux"
import { AppDispatch, RootState } from "@/store/store"
import { fetchVideos, removeVideo, Video } from "@/store/videoSlice"
import { PlusCircle, Film, TrendingUp, Clock, ArrowUpRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { VideoCard } from "@/components/VideoCard"
import { VideoListSkeleton } from "@/components/LoadingSkeleton"
import { formatScore, formatDuration } from "@/lib/utils"

export default function DashboardPage() {
  const dispatch = useDispatch<AppDispatch>()
  const { videos, loading } = useSelector((s: RootState) => s.videos)
  const router = useRouter()
  const [initialLoad, setInitialLoad] = useState(true)

  useEffect(() => {
    dispatch(fetchVideos()).finally(() => setInitialLoad(false))
  }, [dispatch])

  const handleDelete = useCallback((id: string) => {
    dispatch(removeVideo(id))
  }, [dispatch])

  const totalDuration = videos.reduce((acc, v) => acc + (v.duration || 0), 0)
  const avgScore = videos.reduce((acc, v) => acc + (v.viral_score || 0), 0) / Math.max(videos.length, 1)
  const completedCount = videos.filter((v) => v.status === "completed" || v.status === "ready").length

  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            {videos.length} video{videos.length !== 1 ? "s" : ""} processed
          </p>
        </div>
        <button onClick={() => router.push("/app/new")} className="btn-primary">
          <PlusCircle size={16} />
          New Project
        </button>
      </div>

      {videos.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
                <Film size={18} className="text-brand-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{videos.length}</p>
                <p className="text-xs text-slate-500">Total Videos</p>
              </div>
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                <Clock size={18} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{formatDuration(totalDuration)}</p>
                <p className="text-xs text-slate-500">Total Duration</p>
              </div>
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                <TrendingUp size={18} className="text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{completedCount ? formatScore(avgScore) : "--"}</p>
                <p className="text-xs text-slate-500">Avg Viral Score</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {initialLoad && loading ? (
        <VideoListSkeleton />
      ) : videos.length === 0 ? (
        <div className="card flex flex-col items-center py-20">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800">
            <Film size={28} className="text-slate-600" />
          </div>
          <h3 className="mb-1 text-lg font-semibold text-slate-300">No videos yet</h3>
          <p className="mb-6 text-sm text-slate-500">Upload or import a video to get started</p>
          <button onClick={() => router.push("/app/new")} className="btn-primary">
            <PlusCircle size={16} />
            Create Your First Project
          </button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
