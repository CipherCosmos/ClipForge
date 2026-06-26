"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

const CAPTION_STYLES = [
  { id: "classic", label: "Classic", desc: "Black bg, white text" },
  { id: "neon", label: "Neon", desc: "Cyan + magenta glow" },
  { id: "minimal", label: "Minimal", desc: "No background" },
  { id: "highlight", label: "Highlight", desc: "Gold on orange" },
  { id: "typewriter", label: "Typewriter", desc: "Fade-in animation" },
]

interface Props {
  value: string
  onChange: (style: string) => void
}

export function CaptionStyleSelector({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        Caption Style
      </label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {CAPTION_STYLES.map((style) => (
          <button
            key={style.id}
            onClick={() => onChange(style.id)}
            className={cn(
              "rounded-lg border p-2.5 text-left transition-all",
              value === style.id
                ? "border-brand-500 bg-brand-500/10"
                : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
            )}
          >
            <p className="text-sm font-medium text-white">{style.label}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{style.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
