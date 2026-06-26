"use client"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

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
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Caption Style
      </Label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {CAPTION_STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            onClick={() => onChange(style.id)}
            className={cn(
              "rounded-lg border p-2.5 text-left transition-all cursor-pointer",
              value === style.id
                ? "border-brand-500 bg-brand-500/10 text-foreground"
                : "border-border bg-card hover:bg-accent hover:text-accent-foreground text-foreground"
            )}
          >
            <p className="text-sm font-medium">{style.label}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{style.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
