"use client"

import { useState, useEffect } from "react"
import { Monitor } from "lucide-react"

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

  const selected = platforms.find((p) => (p.value || p.name) === value)

  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-slate-400 uppercase tracking-wider">
        Export For
      </label>
      <div className="relative">
        <Monitor size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input pl-10 appearance-none"
        >
          {platforms.map((p, idx) => (
            <option key={p.value || p.name || idx} value={p.value || p.name}>
              {p.label} ({p.width}x{p.height})
            </option>
          ))}
        </select>
      </div>
      {selected && (
        <p className="mt-1.5 text-xs text-slate-500">
          {selected.description} &middot; Max {Math.floor(selected.max_duration / 60)}min
        </p>
      )}
    </div>
  )
}
