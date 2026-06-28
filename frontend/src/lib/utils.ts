import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number): string {
  if (seconds === 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function formatTime(seconds: number): string {
  if (seconds === 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(2).padStart(5, "0")}`
}

export function formatScore(score: number): string {
  return (score * 100).toFixed(0)
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    uploaded: "Queued",
    processing: "Processing",
    completed: "Completed",
    ready: "Ready",
    failed: "Failed",
  }
  return map[status] || status
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    uploaded: "badge-yellow",
    processing: "badge-blue",
    completed: "badge-green",
    ready: "badge-green",
    failed: "badge-red",
  }
  return map[status] || "badge-slate"
}
