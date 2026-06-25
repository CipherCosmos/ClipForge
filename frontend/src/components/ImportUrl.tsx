"use client"

import { useState } from "react"
import { Link2, Sparkles, Loader2, AlertCircle } from "lucide-react"

interface ImportUrlProps {
  onImport: (url: string) => void
  busy?: boolean
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export function ImportUrl({ onImport, busy }: ImportUrlProps) {
  const [url, setUrl] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    const trimmed = url.trim()
    if (!trimmed) {
      setError("Please enter a URL")
      return
    }
    if (!isValidUrl(trimmed)) {
      setError("Please enter a valid URL (http:// or https://)")
      return
    }
    onImport(trimmed)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="relative">
        <Link2 size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="url"
          placeholder="Paste YouTube or video URL..."
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError("") }}
          disabled={busy}
          className="input pl-10"
          autoFocus
        />
      </div>
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-900/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <button
        type="submit"
        disabled={busy || !url.trim()}
        className="btn-primary w-full"
      >
        {busy ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Sparkles size={16} />
        )}
        {busy ? "Importing..." : "Import & Analyze"}
      </button>
    </form>
  )
}
