"use client"

import { useState } from "react"
import { ArrowLeft, Palette, Music, Type } from "lucide-react"
import { useRouter } from "next/navigation"
import { CaptionStyleSelector } from "@/components/CaptionStyleSelector"

export default function SettingsPage() {
  const router = useRouter()
  const [watermark, setWatermark] = useState("")
  const [color, setColor] = useState("#FF6B35")
  const [captionStyle, setCaptionStyle] = useState("classic")
  const [musicTrack, setMusicTrack] = useState("")
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    localStorage.setItem("clipforge_brand", JSON.stringify({
      watermark_text: watermark,
      primary_color: color,
      caption_style: captionStyle,
      music_track: musicTrack,
    }))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="animate-fade-in space-y-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <button onClick={() => router.push("/app")} className="btn-ghost -ml-2">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="mt-1 text-sm text-slate-400">Customize your brand and output</p>
        </div>
      </div>

      <div className="card p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <Palette size={20} className="text-brand-400" />
          <h2 className="text-lg font-bold text-white">Branding</h2>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Watermark Text</label>
          <input
            value={watermark}
            onChange={(e) => setWatermark(e.target.value)}
            placeholder="e.g. @yourchannel"
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white"
          />
          <p className="text-[10px] text-slate-500">Shown on all exported clips</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Brand Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-16 rounded-lg cursor-pointer bg-slate-800 border border-slate-700"
            />
            <span className="text-sm text-slate-300">{color}</span>
          </div>
        </div>

        <CaptionStyleSelector value={captionStyle} onChange={setCaptionStyle} />

        <div className="flex items-center gap-3 pb-4 border-b border-slate-800 pt-4">
          <Music size={20} className="text-brand-400" />
          <h2 className="text-lg font-bold text-white">Background Music</h2>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Default Track</label>
          <select
            value={musicTrack}
            onChange={(e) => setMusicTrack(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white"
          >
            <option value="">No music</option>
            <option value="upbeat_corporate">Upbeat Corporate</option>
            <option value="cinematic_drama">Cinematic Drama</option>
            <option value="lo-fi_chill">Lo-fi Chill</option>
            <option value="energetic_edm">Energetic EDM</option>
            <option value="calm_piano">Calm Piano</option>
          </select>
        </div>

        <button
          onClick={handleSave}
          className="btn-primary w-full py-2.5"
        >
          {saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  )
}
