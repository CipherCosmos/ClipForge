"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { Calendar, Clock, Globe, CheckCircle2, XCircle, Loader2, Trash2, Send, Filter, AlertCircle, HelpCircle } from "lucide-react"
import { scheduleAPI } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface ScheduleItem {
  id: string
  clip_id: string
  platform: string
  title: string
  description: string
  hashtags: string
  access_token_masked: string
  platform_user_id: string | null
  scheduled_at: string
  status: string
  result: Record<string, any> | null
  created_at: string
  updated_at: string
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube_shorts: "YouTube Shorts",
  tiktok: "TikTok",
  instagram_reels: "Instagram Reels",
  linkedin: "LinkedIn Video",
}

export default function SchedulePage() {
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("")
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, any> = {}
      if (filter) params.status = filter
      const res = await scheduleAPI.list(params)
      setItems(res.data.items || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this scheduled publication?")) return
    setActionLoading(id)
    try {
      await scheduleAPI.cancel(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch {
      alert("Failed to cancel schedule")
    } finally {
      setActionLoading(null)
    }
  }

  const handlePublishNow = async (id: string) => {
    if (!confirm("Publish this item immediately?")) return
    setActionLoading(id)
    try {
      const res = await scheduleAPI.publishNow(id)
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...res.data, status: res.data.status } : i))
      )
    } catch {
      alert("Failed to publish now")
    } finally {
      setActionLoading(null)
    }
  }

  // Calculate status statistics from list items
  const stats = useMemo(() => {
    return {
      pending: items.filter(i => i.status === "pending" || i.status === "publishing").length,
      published: items.filter(i => i.status === "published").length,
      failed: items.filter(i => i.status === "failed").length,
    }
  }, [items])

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20"
      case "publishing":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse"
      case "published":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      case "failed":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20"
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/20"
    }
  }

  const getPlatformStyle = (platform: string) => {
    const p = platform.toLowerCase()
    if (p.includes("youtube")) return "text-red-400 bg-red-500/5 border-red-500/10"
    if (p.includes("tiktok")) return "text-slate-200 bg-slate-800 border-slate-700"
    if (p.includes("instagram")) return "text-pink-400 bg-pink-500/5 border-pink-500/10"
    if (p.includes("linkedin")) return "text-blue-400 bg-blue-600/5 border-blue-600/10"
    return "text-muted-foreground bg-muted border-border"
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Social Scheduled Queue</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Monitor auto-publishing tasks, publish items immediately, or manage upcoming channel schedules.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Pending Tasks", value: stats.pending, color: "border-l-amber-500 text-amber-400 bg-amber-500/5" },
          { label: "Published Clips", value: stats.published, color: "border-l-emerald-500 text-emerald-400 bg-emerald-500/5" },
          { label: "Failed Pipeline", value: stats.failed, color: "border-l-rose-500 text-rose-400 bg-rose-500/5" },
        ].map((stat, i) => (
          <Card key={i} className="border border-border/60 bg-card/40 backdrop-blur-md overflow-hidden transition-all duration-300 hover:bg-card/75">
            <div className={cn("p-4 border-l-4", stat.color)}>
              <p className="text-lg font-bold text-foreground leading-none">{stat.value}</p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1.5">{stat.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Filter and segmented toggle controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex bg-muted/60 border border-border/40 p-1 rounded-lg w-fit shrink-0">
          {[
            { key: "", label: "All Schedules" },
            { key: "pending", label: "Pending" },
            { key: "published", label: "Published" },
            { key: "failed", label: "Failed" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={cn(
                "px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 cursor-pointer",
                filter === opt.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Queue Listing */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
          <span>Retrieving schedules...</span>
        </div>
      ) : items.length === 0 ? (
        <Card className="border border-dashed border-border bg-card/10 p-12 text-center">
          <Calendar size={40} className="mx-auto text-muted-foreground/60 mb-4" />
          <h3 className="text-base font-semibold text-foreground">No scheduled publications</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            You haven&apos;t scheduled any clips yet. Go to your video details page to select clips and configure publication dates.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <Card
              key={item.id}
              className={cn(
                "border border-border bg-card/40 hover:bg-card/75 transition-all duration-300 overflow-hidden border-l-4",
                item.status === "pending" && "border-l-amber-500",
                item.status === "published" && "border-l-emerald-500",
                item.status === "failed" && "border-l-rose-500"
              )}
            >
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-3">
                  {/* Status header tags */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border", getStatusBadgeVariant(item.status))}>
                      {item.status}
                    </span>
                    <span className={cn("text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border flex items-center gap-1", getPlatformStyle(item.platform))}>
                      <Globe size={10} />
                      {PLATFORM_LABELS[item.platform] || item.platform}
                    </span>
                  </div>

                  {/* Metadata fields */}
                  <div className="space-y-1">
                    {item.title && (
                      <h3 className="text-sm font-bold text-foreground truncate">{item.title}</h3>
                    )}
                    <p className="text-xs text-muted-foreground/90 leading-relaxed line-clamp-2">{item.description}</p>
                    {item.hashtags && (
                      <p className="text-[10px] font-mono text-brand-400 truncate mt-0.5">{item.hashtags}</p>
                    )}
                  </div>

                  {/* Timing & Auth Details */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] font-semibold text-muted-foreground pt-1">
                    <span className="flex items-center gap-1.5">
                      <Clock size={12} className="text-brand-400" />
                      Scheduled for {new Date(item.scheduled_at).toLocaleDateString()} at {new Date(item.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="bg-muted px-2 py-0.5 rounded border border-border/40 font-mono">
                      Token: {item.access_token_masked}
                    </span>
                  </div>

                  {/* Failed status log report */}
                  {item.result && !item.result.success && (
                    <div className="flex items-start gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/5 p-2.5 text-[10px] font-semibold text-rose-400">
                      <AlertCircle size={12} className="shrink-0 mt-0.5" />
                      <span>{item.result.error || "Publication pipeline failed due to channel API authorization error."}</span>
                    </div>
                  )}
                </div>

                {/* Card CTA Action panel */}
                <div className="flex gap-2 items-center justify-end shrink-0 sm:self-center">
                  {item.status === "pending" && (
                    <>
                      <Button
                        onClick={() => handlePublishNow(item.id)}
                        disabled={actionLoading === item.id}
                        size="sm"
                        className="h-8 text-xs font-semibold shadow-sm"
                      >
                        {actionLoading === item.id ? (
                          <Loader2 size={12} className="animate-spin mr-1.5" />
                        ) : (
                          <Send size={12} className="mr-1.5" />
                        )}
                        Publish Now
                      </Button>
                      <Button
                        onClick={() => handleCancel(item.id)}
                        disabled={actionLoading === item.id}
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer font-semibold"
                      >
                        <Trash2 size={12} className="mr-1.5" />
                        Cancel
                      </Button>
                    </>
                  )}
                  {item.status === "published" && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold bg-emerald-500/5 border border-emerald-500/10 px-2.5 py-1 rounded-md">
                      <CheckCircle2 size={13} /> Published
                    </span>
                  )}
                  {item.status === "failed" && (
                    <span className="flex items-center gap-1.5 text-xs text-rose-400 font-bold bg-rose-500/5 border border-rose-500/10 px-2.5 py-1 rounded-md">
                      <XCircle size={13} /> Failed
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
