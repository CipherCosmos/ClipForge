"use client"

import { useRef, useState, useCallback } from "react"
import { Upload, Film, Loader2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const MAX_SIZE = 2 * 1024 * 1024 * 1024
const ALLOWED_TYPES = [".mp4", ".mov", ".mp3", ".wav", ".webm", ".mkv", ".avi"]
const ALLOWED_MIME = [
  "video/mp4", "video/quicktime", "audio/mpeg", "audio/wav",
  "video/webm", "video/x-matroska", "video/avi",
]

interface UploadZoneProps {
  onFile: (file: File) => void
  busy?: boolean
}

export function UploadZone({ onFile, busy }: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFile = useCallback((file: File): string | null => {
    if (file.size > MAX_SIZE) {
      return "File exceeds 2GB limit. Please choose a smaller file."
    }
    const ext = "." + file.name.split(".").pop()?.toLowerCase()
    if (!ALLOWED_TYPES.includes(ext) && !ALLOWED_MIME.includes(file.type)) {
      return "Unsupported file format. Please use MP4, MOV, WebM, MP3, or WAV."
    }
    return null
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    setError("")
    const file = e.dataTransfer.files?.[0]
    if (!file || busy) return
    const err = validateFile(file)
    if (err) { setError(err); return }
    onFile(file)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("")
    const file = e.target.files?.[0]
    if (!file || busy) return
    const err = validateFile(file)
    if (err) { setError(err); return }
    onFile(file)
    e.target.value = ""
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !busy && fileInputRef.current?.click()}
        className={cn(
          "relative flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-16 transition-all duration-200",
          dragOver
            ? "border-brand-500 bg-brand-500/5"
            : "border-border bg-muted/20 hover:border-border hover:bg-muted/30",
          busy && "cursor-wait opacity-60"
        )}
      >
        <div className={cn(
          "mb-4 flex h-14 w-14 items-center justify-center rounded-xl transition-all duration-300",
          dragOver ? "bg-brand-500/10 scale-110" : "bg-muted"
        )}>
          {busy ? (
            <Loader2 size={24} className="animate-spin text-brand-400" />
          ) : (
            <Upload size={24} className={dragOver ? "text-brand-400" : "text-muted-foreground"} />
          )}
        </div>
        <p className="text-sm font-medium text-foreground">
          {busy ? "Uploading..." : "Drop your video here or click to browse"}
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          MP4, MOV, WebM, MP3, WAV &middot; Max 2GB
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp4,.mov,.mp3,.wav,.webm,.mkv,.avi"
          className="hidden"
          onChange={handleChange}
          disabled={busy}
        />
      </div>
      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-900/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
