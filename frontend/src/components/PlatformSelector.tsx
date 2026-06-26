"use client"

import { useState, useEffect } from "react"
import { Youtube, Instagram, Smartphone, Facebook, Monitor, Square, LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

interface Platform {
  value?: string
  name?: string
  label: string
  description: string
  width: number
  height: number
  max_duration: number
}

interface PlatformSelectorProps {
  value: string
  onChange: (value: string) => void
}

const FALLBACK_PLATFORMS: Platform[] = [
  { value: "youtube_shorts", name: "youtube_shorts", label: "YouTube Shorts", description: "Vertical 9:16 format for YouTube Shorts", width: 1080, height: 1920, max_duration: 60 },
  { value: "instagram_reels", name: "instagram_reels", label: "Instagram Reels", description: "Vertical 9:16 format for Instagram Reels", width: 1080, height: 1920, max_duration: 90 },
  { value: "tiktok", name: "tiktok", label: "TikTok", description: "Vertical 9:16 format for TikTok", width: 1080, height: 1920, max_duration: 180 },
  { value: "facebook_reels", name: "facebook_reels", label: "Facebook Reels", description: "Vertical 9:16 format for Facebook Reels", width: 1080, height: 1920, max_duration: 60 },
  { value: "twitter_video", name: "twitter_video", label: "X/Twitter Video", description: "Landscape 16:9 format for X/Twitter", width: 1920, height: 1080, max_duration: 140 },
  { value: "landscape", name: "landscape", label: "Landscape 16:9", description: "Standard landscape 16:9 format", width: 1920, height: 1080, max_duration: 600 },
  { value: "square", name: "square", label: "Square 1:1", description: "Square 1:1 format for all platforms", width: 1080, height: 1080, max_duration: 600 },
]

const PLATFORM_ICONS: Record<string, LucideIcon> = {
  youtube_shorts: Youtube,
  instagram_reels: Instagram,
  tiktok: Smartphone,
  facebook_reels: Facebook,
  twitter_video: Monitor,
  landscape: Monitor,
  square: Square,
}

const PLATFORM_COLORS: Record<string, { activeBorder: string; activeBg: string; iconColor: string; shadow: string }> = {
  youtube_shorts: {
    activeBorder: "border-red-500",
    activeBg: "bg-red-500/5",
    iconColor: "text-red-500",
    shadow: "shadow-red-500/10",
  },
  instagram_reels: {
    activeBorder: "border-pink-500",
    activeBg: "bg-pink-500/5",
    iconColor: "text-pink-500",
    shadow: "shadow-pink-500/10",
  },
  tiktok: {
    activeBorder: "border-cyan-500",
    activeBg: "bg-cyan-500/5",
    iconColor: "text-cyan-400",
    shadow: "shadow-cyan-500/10",
  },
  facebook_reels: {
    activeBorder: "border-blue-600",
    activeBg: "bg-blue-600/5",
    iconColor: "text-blue-500",
    shadow: "shadow-blue-500/10",
  },
  twitter_video: {
    activeBorder: "border-foreground",
    activeBg: "bg-foreground/5",
    iconColor: "text-foreground",
    shadow: "shadow-foreground/10",
  },
  landscape: {
    activeBorder: "border-brand-500",
    activeBg: "bg-brand-500/5",
    iconColor: "text-brand-400",
    shadow: "shadow-brand-500/10",
  },
  square: {
    activeBorder: "border-emerald-500",
    activeBg: "bg-emerald-500/5",
    iconColor: "text-emerald-400",
    shadow: "shadow-emerald-500/10",
  },
}

export function PlatformSelector({ value, onChange }: PlatformSelectorProps) {
  const [platforms, setPlatforms] = useState<Platform[]>(FALLBACK_PLATFORMS)

  useEffect(() => {
    import("@/lib/api").then(({ videosAPI }) =>
      videosAPI.platforms()
        .then((res) => {
          if (res.data && Array.isArray(res.data) && res.data.length > 0) {
            setPlatforms(res.data)
          }
        })
        .catch(() => {})
    )
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-semibold text-foreground">Select Preset / Platform</Label>
        <p className="text-xs text-muted-foreground mt-0.5">Choose the output format optimized for your target feed</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {platforms.map((p, idx) => {
          const val = p.value || p.name || ""
          const active = val === value
          const Icon = PLATFORM_ICONS[val] || Monitor
          const colors = PLATFORM_COLORS[val] || {
            activeBorder: "border-brand-500",
            activeBg: "bg-brand-500/5",
            iconColor: "text-brand-400",
            shadow: "shadow-brand-500/10",
          }

          // Aspect ratio preview dimension styles
          const isVertical = p.height > p.width
          const isSquare = p.width === p.height

          return (
            <button
              key={val || idx}
              type="button"
              onClick={() => val && onChange(val)}
              className={cn(
                "group relative flex flex-col justify-between items-start rounded-xl border p-4 text-left transition-all duration-300 hover:shadow-md cursor-pointer",
                active
                  ? cn("border-2 bg-muted/20 shadow-md", colors.activeBorder, colors.shadow)
                  : "border-border bg-card hover:border-muted-foreground/30"
              )}
            >
              {/* Aspect Ratio Box Visual */}
              <div className="absolute top-4 right-4 flex items-center justify-center opacity-40 group-hover:opacity-75 transition-opacity duration-300">
                <div
                  className={cn(
                    "border border-muted-foreground/50 rounded-sm bg-muted-foreground/10",
                    isVertical ? "h-6 w-3.5" : isSquare ? "h-5 w-5" : "h-3.5 w-6",
                    active && "border-primary bg-primary/10"
                  )}
                />
              </div>

              <div className="space-y-3">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 transition-transform duration-300 group-hover:scale-110",
                  active && cn("bg-muted/85", colors.iconColor)
                )}>
                  <Icon className="size-4" />
                </div>

                <div>
                  <h3 className="text-xs font-bold text-foreground truncate max-w-[120px]">{p.label}</h3>
                  <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                    {p.width} × {p.height}
                  </p>
                </div>
              </div>

              <div className="mt-4 w-full flex items-center justify-between text-[9px] text-muted-foreground">
                <span className="font-semibold uppercase tracking-wider bg-muted/50 px-1.5 py-0.5 rounded">
                  {isVertical ? "9:16" : isSquare ? "1:1" : "16:9"}
                </span>
                <span className="font-medium">
                  Max {Math.floor(p.max_duration / 60)}m
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
