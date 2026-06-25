"use client"

import { CheckCircle2, Loader2, Circle } from "lucide-react"
import { cn } from "@/lib/utils"

interface Stage {
  key: string
  label: string
}

interface ProcessingPipelineProps {
  stages: Stage[]
  currentStage: number
}

export function ProcessingPipeline({ stages, currentStage }: ProcessingPipelineProps) {
  return (
    <div className="w-full max-w-md space-y-4">
      {stages.map((stage, idx) => {
        const isDone = idx < currentStage
        const isCurrent = idx === currentStage

        return (
          <div
            key={stage.key}
            className={cn(
              "flex items-center gap-4 rounded-xl border px-5 py-4 transition-all duration-500",
              isDone && "border-emerald-800/50 bg-emerald-900/10",
              isCurrent && "border-brand-700/50 bg-brand-900/10 shadow-lg shadow-brand-900/10",
              !isDone && !isCurrent && "border-slate-700/50 bg-slate-800/20 opacity-50"
            )}
          >
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
              {isDone ? (
                <CheckCircle2 size={24} className="text-emerald-400" />
              ) : isCurrent ? (
                <Loader2 size={22} className="animate-spin text-brand-400" />
              ) : (
                <Circle size={22} className="text-slate-600" />
              )}
            </div>
            <div className="flex-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  isDone && "text-emerald-300",
                  isCurrent && "text-brand-300",
                  !isDone && !isCurrent && "text-slate-500"
                )}
              >
                {stage.label}
              </p>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    isDone && "bg-emerald-500 w-full",
                    isCurrent && "bg-brand-500 w-1/3 animate-progress",
                    !isDone && !isCurrent && "w-0"
                  )}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
