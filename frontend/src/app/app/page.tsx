"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useDispatch, useSelector } from "react-redux"
import { AppDispatch, RootState } from "@/store/store"
import { fetchVideos, removeVideo, removeVideos, setPage } from "@/store/videoSlice"
import {
  PlusCircle, Film, TrendingUp, Clock, Trash2, Download, CheckSquare, Square,
  ChevronLeft, ChevronRight, Search, SlidersHorizontal, Sparkles, Loader2,
  Filter, RotateCcw
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { VideoCard } from "@/components/VideoCard"
import { VideoListSkeleton } from "@/components/LoadingSkeleton"
import { formatScore, formatDuration, cn } from "@/lib/utils"
import { videosAPI } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
  const [showFilters, setShowFilters] = useState(false)

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

  const totalDuration = videos.reduce((acc, v) => acc + (v.duration || 0), 0)
  const avgScore = videos.reduce((acc, v) => acc + (v.viral_score || 0), 0) / Math.max(videos.length, 1)
  const completedCount = videos.filter((v) => v.status === "completed" || v.status === "ready").length

  const allSelected = filteredAndSortedVideos.length > 0 && selectedIds.size === filteredAndSortedVideos.length

  const handleDelete = useCallback((id: string) => { dispatch(removeVideo(id)) }, [dispatch])
  const handleSelectChange = useCallback((id: string, sel: boolean) => {
    setSelectedIds((prev) => { const n = new Set(prev); sel ? n.add(id) : n.delete(id); return n })
  }, [])
  const handleSelectAll = useCallback(() => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(filteredAndSortedVideos.map((v) => v.id)))
  }, [filteredAndSortedVideos, allSelected])

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
    } finally { setBatchDeleting(false) }
  }

  const handleBatchExport = async () => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    if (ids.length === 1) { router.push(`/app/videos/${ids[0]}`); return }
    try {
      await Promise.all(ids.map((id) => videosAPI.exportZip(id)))
    } catch { alert("Batch export not available for multiple videos yet. Export from individual video pages.") }
  }

  return (
    <div className="animate-fade-in space-y-6 pb-24 sm:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {total} video{total !== 1 ? "s" : ""} &bull; Page {page} of {totalPages || 1}
          </p>
        </div>
        <Button onClick={() => router.push("/app/new")} className="h-10 px-4 text-sm font-semibold shrink-0 shadow-md">
          <PlusCircle size={16} className="mr-1.5" />
          New Project
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Film, label: "Total Videos", value: total.toString(), gradient: "from-brand-500/10 to-violet-500/10 border-brand-500/20", iconColor: "text-brand-400" },
          { icon: Clock, label: "Total Duration", value: formatDuration(totalDuration), gradient: "from-blue-500/10 to-cyan-500/10 border-blue-500/20", iconColor: "text-blue-400" },
          { icon: TrendingUp, label: "Avg Score", value: completedCount ? `${formatScore(avgScore)}%` : "--", gradient: "from-emerald-500/10 to-teal-500/10 border-emerald-500/20", iconColor: "text-emerald-400" },
          { icon: Sparkles, label: "Completed", value: `${completedCount}/${total}`, gradient: "from-amber-500/10 to-orange-500/10 border-amber-500/20", iconColor: "text-amber-400" },
        ].map((s) => (
          <Card key={s.label} className={cn("overflow-hidden border bg-card/40 backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-card/70")}>
            <div className={cn("p-4 flex items-center gap-4 border-l-4", s.iconColor.replace("text-", "border-"))}>
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border", s.gradient)}>
                <s.icon size={18} className={s.iconColor} />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground leading-none">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Cohesive Search & Filters Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 bg-muted/30 border border-border p-2 rounded-xl">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search videos by title..."
              className="pl-9 h-9 text-xs bg-background border-border"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "h-9 text-xs font-medium shrink-0 bg-background border-border",
              showFilters && "bg-brand-500/10 border-brand-500/30 text-brand-400"
            )}
          >
            <SlidersHorizontal size={14} className="mr-1.5" />
            Filters
            { (platformFilter !== "all" || sortBy !== "newest") && (
              <span className="ml-1.5 size-2 rounded-full bg-brand-500" />
            )}
          </Button>
          {(platformFilter !== "all" || sortBy !== "newest" || search) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSearch("")
                setPlatformFilter("all")
                setSortBy("newest")
              }}
              title="Reset Filters"
            >
              <RotateCcw size={14} />
            </Button>
          )}
        </div>

        {showFilters && (
          <Card className="border border-border bg-card/40 p-4 animate-slide-up-fade">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Platform Preset</label>
                <Select value={platformFilter} onValueChange={(val) => setPlatformFilter(val ?? "all")}>
                  <SelectTrigger className="w-full h-9 bg-background border-border text-xs">
                    <SelectValue placeholder="All Platforms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    <SelectItem value="youtube_shorts">YouTube Shorts</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="instagram_reels">Instagram Reels</SelectItem>
                    <SelectItem value="landscape">Landscape 16:9</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Sort Orders</label>
                <Select value={sortBy} onValueChange={(val) => setSortBy(val ?? "newest")}>
                  <SelectTrigger className="w-full h-9 bg-background border-border text-xs">
                    <SelectValue placeholder="Newest First" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="score_desc">Highest Viral Score</SelectItem>
                    <SelectItem value="duration_desc">Longest Duration</SelectItem>
                    <SelectItem value="title_asc">Title A-Z</SelectItem>
                    <SelectItem value="title_desc">Title Z-A</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Video Grid Section */}
      {initialLoad && loading ? (
        <VideoListSkeleton count={pageSize} />
      ) : filteredAndSortedVideos.length === 0 ? (
        <Card className="border border-dashed border-border bg-card/10 p-12 text-center">
          <Film size={40} className="mx-auto text-muted-foreground/60 mb-4" />
          <h3 className="text-base font-semibold text-foreground">No videos found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Try adjusting your search queries or upload a new project to start clipping.
          </p>
          <Button onClick={() => router.push("/app/new")} className="mt-5 h-9 text-xs font-semibold">
            <PlusCircle size={14} className="mr-1.5" /> Upload Video
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Action Bar */}
          <div className="flex items-center justify-between bg-muted/10 border border-border/40 px-3 py-2 rounded-lg">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {allSelected ? (
                <CheckSquare size={16} className="text-brand-400" />
              ) : (
                <Square size={16} />
              )}
              <span>Select All on Page</span>
            </button>
            {selectedIds.size > 0 && (
              <span className="text-xs font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full border border-brand-500/20">
                {selectedIds.size} Selected
              </span>
            )}
          </div>

          {/* Grid list */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAndSortedVideos.map((v) => (
              <VideoCard
                key={v.id}
                video={v}
                onDelete={handleDelete}
                selected={selectedIds.has(v.id)}
                onSelectChange={handleSelectChange}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-6 border-t border-border/40">
              <Button
                variant="outline"
                size="icon"
                onClick={() => dispatch(setPage(Math.max(1, page - 1)))}
                disabled={page <= 1}
                aria-label="Previous page"
                className="h-9 w-9 bg-card border-border"
              >
                <ChevronLeft size={16} />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  onClick={() => dispatch(setPage(p))}
                  variant={p === page ? "default" : "outline"}
                  className={cn(
                    "h-9 w-9 p-0 text-xs font-semibold border-border",
                    p === page ? "bg-brand-500 hover:bg-brand-600" : "bg-card"
                  )}
                >
                  {p}
                </Button>
              ))}
              <Button
                variant="outline"
                size="icon"
                onClick={() => dispatch(setPage(Math.min(totalPages, page + 1)))}
                disabled={page >= totalPages}
                aria-label="Next page"
                className="h-9 w-9 bg-card border-border"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Batch Operations Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-xl px-4 py-3 shadow-2xl lg:left-64 md:left-64 animate-slide-up-fade">
          <div className="mx-auto max-w-6xl flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground">
              {selectedIds.size} video{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleBatchExport} className="h-8 text-xs bg-background border-border">
                <Download size={14} className="mr-1.5" /> Export All
              </Button>
              <Button variant="destructive" size="sm" onClick={handleBatchDelete} disabled={batchDeleting} className="h-8 text-xs">
                {batchDeleting ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Trash2 size={14} className="mr-1.5" />}
                Delete Selected
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
