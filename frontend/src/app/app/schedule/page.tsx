"use client"

import { useEffect, useState, useCallback } from "react"
import { Calendar, Clock, Globe, CheckCircle, XCircle, Loader2, Trash2, Send, Filter } from "lucide-react"
import { scheduleAPI } from "@/lib/api"
import { cn } from "@/lib/utils"

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

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: "bg-amber-900/20 text-amber-400 border-amber-700/30",
    published: "bg-emerald-900/20 text-emerald-400 border-emerald-700/30",
    failed: "bg-red-900/20 text-red-400 border-red-700/30",
    publishing: "bg-blue-900/20 text-blue-400 border-blue-700/30",
  }
  return styles[status] || "bg-slate-800 text-slate-400 border-slate-700"
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

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Scheduled Publications</h1>
          <p className="mt-1 text-sm text-slate-400">
            {items.length} schedule{items.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["", "pending", "published", "failed"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
              filter === s
                ? "bg-brand-500/10 text-brand-400 border-brand-500/30"
                : "bg-slate-900/50 text-slate-400 border-slate-700/50 hover:border-slate-600"
            )}
          >
            <Filter size={12} className="inline mr-1" />
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="card flex flex-col items-center py-20">
          <Calendar size={40} className="text-slate-600 mb-4" />
          <h3 className="text-lg font-semibold text-slate-300">No scheduled publications</h3>
          <p className="text-sm text-slate-500 mt-1">Schedule a clip from the clip details page</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-4 backdrop-blur-md transition-all hover:border-slate-700/80"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn("badge border text-[11px] font-semibold", statusBadge(item.status))}>
                      {item.status}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Globe size={12} />
                      {PLATFORM_LABELS[item.platform] || item.platform}
                    </span>
                  </div>
                  {item.title && (
                    <p className="text-sm font-semibold text-slate-200 truncate">{item.title}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {new Date(item.scheduled_at).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(item.scheduled_at).toLocaleTimeString()}
                    </span>
                    <span>Token: {item.access_token_masked}</span>
                  </div>
                  {item.result && !item.result.success && (
                    <p className="text-xs text-red-400 mt-1">{item.result.error || "Unknown error"}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {item.status === "pending" && (
                    <>
                      <button
                        onClick={() => handlePublishNow(item.id)}
                        disabled={actionLoading === item.id}
                        className="btn-primary py-1.5 px-3 text-xs flex items-center gap-1"
                      >
                        {actionLoading === item.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Send size={12} />
                        )}
                        Publish Now
                      </button>
                      <button
                        onClick={() => handleCancel(item.id)}
                        disabled={actionLoading === item.id}
                        className="btn-ghost py-1.5 px-3 text-xs flex items-center gap-1 text-red-400 hover:text-red-300"
                      >
                        <Trash2 size={12} />
                        Cancel
                      </button>
                    </>
                  )}
                  {item.status === "published" && (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle size={14} /> Published
                    </span>
                  )}
                  {item.status === "failed" && (
                    <span className="flex items-center gap-1 text-xs text-red-400">
                      <XCircle size={14} /> Failed
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
