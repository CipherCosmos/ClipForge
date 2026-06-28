"use client"

import { memo, useState } from "react"
import { Film, Loader2, Sparkles, CheckCircle2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

interface ProcessingOverlayProps {
  videoUrl: string | null
  progress: number
  message: string
  status: "processing" | "completed" | "failed" | "pending"
  error?: string
}

function stageLabel(progress: number): string {
  if (progress < 10) return "Uploading video..."
  if (progress < 30) return "Transcribing via Metal GPU..."
  if (progress < 80) return "Parallel processing (NLP & Scene Detect)..."
  if (progress < 100) return "Rendering clips..."
  return "Complete!"
}

export const ProcessingOverlay = memo(function ProcessingOverlay({
  videoUrl,
  progress,
  message,
  status,
  error,
}: ProcessingOverlayProps) {
  const [videoError, setVideoError] = useState(false)
  const label = message || stageLabel(progress)

  const progressColor =
    progress >= 100 ? "bg-emerald-500"
    : progress >= 70 ? "bg-brand-500"
    : progress >= 30 ? "bg-brand-400"
    : "bg-indigo-500"

  return (
    <Card>
      {/* Video player */}
      <div className="relative aspect-video bg-muted">
        {videoUrl && !videoError ? (
          <video
            src={videoUrl}
            controls
            preload="metadata"
            className="absolute inset-0 h-full w-full object-contain"
            onError={() => setVideoError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film size={40} className="text-muted-foreground" />
          </div>
        )}

        {/* Processing overlay */}
        {status === "processing" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/20">
              <Sparkles size={28} className="text-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              Processing Your Video
            </h3>
            <p className="mb-6 text-sm text-muted-foreground">
              AI is analyzing, scoring, and generating your clips
            </p>

            {/* Determinate progress bar */}
            <div className="w-full max-w-md space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono text-sm font-semibold text-brand-400">
                  {Math.round(progress)}%
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700 ease-out",
                    progressColor
                  )}
                  style={{ width: `${Math.round(progress)}%` }}
                />
              </div>
              {message && (
                <p className="text-center text-xs text-muted-foreground">{message}</p>
              )}
            </div>
          </div>
        )}

        {/* Completed state — brief green indicator that doesn't block video */}
        {status === "completed" && (
          <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1.5 backdrop-blur-sm">
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">Done</span>
          </div>
        )}

        {/* Error state */}
        {status === "failed" && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <div className="flex flex-col items-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/20">
                <AlertCircle size={28} className="text-red-400" />
              </div>
              <p className="text-lg font-semibold text-foreground">Processing failed</p>
              {error && (
                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
})
