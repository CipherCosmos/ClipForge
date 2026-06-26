"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useDispatch, useSelector } from "react-redux"
import { AppDispatch, RootState } from "@/store/store"
import { fetchVideos, removeVideo, removeVideos, setPage } from "@/store/videoSlice"
import { PlusCircle, Film, TrendingUp, Clock, Trash2, Download, CheckSquare, Square, ChevronLeft, ChevronRight } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { VideoCard } from "@/components/VideoCard"
import { VideoListSkeleton } from "@/components/LoadingSkeleton"
import { formatScore, formatDuration, cn } from "@/lib/utils"
import { videosAPI } from "@/lib/api"

export default function DashboardPage() {
  const dispatch = useDispatch<AppDispatch>()
  const { videos, loading, total, page, pageSize } = useSelector((s: RootState) => s.videos)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [initialLoad, setInitialLoad] = useState(true)
  const [search, setSearch] = useState(searchParams?.get("search") || "")
  const [platformFilter, setPlatformFilter] = useState(searchParams?.get("platform") || "all")
  const [sortBy, setSortBy] = useState(searchParams?.get("sort") || "newest")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)

  const totalPages = Math.ceil(total / pageSize)

  const fetchPage = useCallback(async (pageNum: number) => {
    const skip = (pageNum - 1) * pageSize
    await dispatch(fetchVideos({ force: true, skip, limit: pageSize }))
  }, [dispatch, pageSize])

  useEffect(() => {
    fetchPage(page).then(() => setInitialLoad(false))
  }, [page, fetchPage])

  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    if (platformFilter !== "all") params.set("platform", platformFilter)
    if (sortBy !== "newest") params.set("sort", sortBy)
    const qs = params.toString()
    router.replace(`/app${qs ? `?${qs}` : ""}`, { scroll: false })
  }, [search, platformFilter, sortBy, router])

  const handleDelete = useCallback((id: string) => {
    dispatch(removeVideo(id))
  }, [dispatch])

  const handleSelectChange = useCallback((id: string, sel: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (sel) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const filteredAndSortedVideos = useMemo(() => videos.filter((video) => {
    const matchesSearch = (video.title || "Untitled Video").toLowerCase().includes(search.toLowerCase())
    const matchesPlatform = platformFilter === "all" || video.platform === platformFilter
    return matchesSearch && matchesPlatform
  }).sort((a, b) => {
    if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (sortBy === "title_asc") return (a.title || "Untitled Video").localeCompare(b.title || "Untitled Video")
    if (sortBy === "title_desc") return (b.title || "Untitled Video").localeCompare(a.title || "Untitled Video")
    if (sortBy === "duration_desc") return (b.duration || 0) - (a.duration || 0)
    if (sortBy === "score_desc") return (b.viral_score || 0) - (a.viral_score || 0)
    return 0
  }), [videos, search, platformFilter, sortBy])

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredAndSortedVideos.length && filteredAndSortedVideos.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredAndSortedVideos.map((v) => v.id)))
    }
  }, [filteredAndSortedVideos, selectedIds])

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} video${selectedIds.size !== 1 ? "s" : ""}?`)) return
    setBatchDeleting(true)
    try {
      const ids = Array.from(selectedIds)
      await videosAPI.batchDelete(ids)
      dispatch(removeVideos(ids))
      setSelectedIds(new Set())
    } catch (e) {
      console.error("Batch delete failed:", e)
      alert("Failed to delete videos. Please try again.")
    } finally {
      setBatchDeleting(false)
    }
  }

  const handleBatchExport = async () => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    if (ids.length === 1) {
      router.push(`/app/videos/${ids[0]}`)
      return
    }
    try {
      await Promise.all(ids.map((id) => videosAPI.exportZip(id)))
    } catch {
      alert("Batch export not available for multiple videos yet. Export from individual video pages.")
    }
  }

  const totalDuration = videos.reduce((acc, v) => acc + (v.duration || 0), 0)
  const avgScore = videos.reduce((acc, v) => acc + (v.viral_score || 0), 0) / Math.max(videos.length, 1)
  const completedCount = videos.filter((v) => v.status === "completed" || v.status === "ready").length

  const allSelected = filteredAndSortedVideos.length > 0 && selectedIds.size === filteredAndSortedVideos.length

  return (
    <div className="animate-fade-in space-y-8 pb-24 sm:pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white truncate">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            {total} video{total !== 1 ? "s" : ""} · Page {page} of {totalPages || 1}
          </p>
        </div>
        <button onClick={() => router.push("/app/new")} className="btn-primary w-full sm:w-auto">
          <PlusCircle size={16} />
          New Project
        </button>
      </div>

      {videos.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="relative group overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 backdrop-blur-md transition-all duration-300 hover:border-brand-500/50 hover:bg-slate-900/60">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-brand-500/10 blur-xl transition-all group-hover:bg-brand-500/20" />
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 border border-brand-500/25 text-brand-400">
                <Film size={20} />
              </div>
              <div>
                <p className="text-3xl font-extrabold tracking-tight text-white">{total}</p>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Videos</p>
              </div>
            </div>
          </div>
          <div className="relative group overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 backdrop-blur-md transition-all duration-300 hover:border-emerald-500/50 hover:bg-slate-900/60">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-500/10 blur-xl transition-all group-hover:bg-emerald-500/20" />
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                <Clock size={20} />
              </div>
              <div>
                <p className="text-3xl font-extrabold tracking-tight text-white">{formatDuration(totalDuration)}</p>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Duration</p>
              </div>
            </div>
          </div>
          <div className="relative group overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 backdrop-blur-md transition-all duration-300 hover:border-amber-500/50 hover:bg-slate-900/60">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-500/10 blur-xl transition-all group-hover:bg-amber-500/20" />
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400">
                <TrendingUp size={20} />
              </div>
              <div>
                <p className="text-3xl font-extrabold tracking-tight text-white">{completedCount ? `${formatScore(avgScore)}%` : "--"}</p>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Avg Viral Score</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {videos.length > 0 && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-slate-900/50 p-4 rounded-xl border border-slate-800/80 backdrop-blur-md">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search videos by title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 transition-all"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 cursor-pointer"
            >
              <option value="all">All Platforms</option>
              <option value="youtube_shorts">YouTube Shorts</option>
              <option value="instagram_reels">Instagram Reels</option>
              <option value="tiktok">TikTok</option>
              <option value="facebook_reels">Facebook Reels</option>
              <option value="x_video">X/Twitter Video</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="title_asc">Title A-Z</option>
              <option value="title_desc">Title Z-A</option>
              <option value="duration_desc">Longest Duration</option>
              <option value="score_desc">Highest Viral Score</option>
            </select>
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
      ) : filteredAndSortedVideos.length === 0 ? (
        <div className="card flex flex-col items-center py-16">
          <h3 className="mb-1 text-lg font-semibold text-slate-300">No matching videos</h3>
          <p className="text-sm text-slate-500">Try adjusting your search query or platform filter</p>
        </div>
      ) : (
        <>
          {/* Select All header */}
          <div className="flex items-center justify-between mb-2 px-1">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              {allSelected ? <CheckSquare size={16} className="text-brand-400" /> : <Square size={16} />}
              {allSelected ? "Deselect All" : "Select All"}
            </button>
            <span className="text-xs text-slate-500">{selectedIds.size} selected</span>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAndSortedVideos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                onDelete={handleDelete}
                selected={selectedIds.has(video.id)}
                onSelectChange={(sel) => handleSelectChange(video.id, sel)}
              />
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 py-4">
          <button
            onClick={() => {
              if (page > 1) {
                setSelectedIds(new Set())
                dispatch(setPage(page - 1))
              }
            }}
            disabled={page <= 1}
            className="btn-secondary text-sm disabled:opacity-30"
          >
            <ChevronLeft size={16} />
            Previous
          </button>
          <span className="text-sm text-slate-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => {
              if (page < totalPages) {
                setSelectedIds(new Set())
                dispatch(setPage(page + 1))
              }
            }}
            disabled={page >= totalPages}
            className="btn-secondary text-sm disabled:opacity-30"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Batch operations floating bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-700 bg-slate-900/95 backdrop-blur-xl px-4 py-3 shadow-2xl shadow-black/50 lg:left-60 lg:ml-0">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-white">
                <span className="text-brand-400">{selectedIds.size}</span> selected
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleBatchDelete}
                disabled={batchDeleting}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600/90 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-red-600 disabled:opacity-50"
              >
                {batchDeleting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Trash2 size={16} />
                )}
                Delete Selected ({selectedIds.size})
              </button>
              <button
                onClick={handleBatchExport}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-600"
              >
                <Download size={16} />
                Export All ({selectedIds.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
