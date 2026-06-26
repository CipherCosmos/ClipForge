"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Palette, Music, Globe, Save } from "lucide-react"
import { useRouter } from "next/navigation"
import { CaptionStyleSelector } from "@/components/CaptionStyleSelector"
import { authAPI } from "@/lib/api"

export default function SettingsPage() {
  const router = useRouter()
  const [watermark, setWatermark] = useState("")
  const [color, setColor] = useState("#FF6B35")
  const [captionStyle, setCaptionStyle] = useState("classic")
  const [musicTrack, setMusicTrack] = useState("")
  const [researchLocation, setResearchLocation] = useState("US")
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const res = await authAPI.getSettings()
        const s = res.data
        setWatermark(s.watermark_text || "")
        setColor(s.primary_color || "#FF6B35")
        setCaptionStyle(s.caption_style || "classic")
        setMusicTrack(s.music_track || "")
        setResearchLocation(s.research_location || "US")
      } catch (e) {
        setError("Failed to load settings")
      }
      setLoading(false)
    })()
  }, [])

  const handleSave = async () => {
    setLoading(true)
    setError("")
    try {
      await authAPI.updateSettings({
        watermark_text: watermark,
        primary_color: color,
        caption_style: captionStyle,
        music_track: musicTrack,
        research_location: researchLocation,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError("Failed to save settings")
    }
    setLoading(false)
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400">Loading...</div>

  return (
    <div className="animate-fade-in space-y-8 w-full max-w-2xl lg:mx-auto">
      <div className="flex items-center gap-4">
        <button onClick={() => router.push("/app")} className="btn-ghost -ml-2 shrink-0">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white truncate">Settings</h1>
          <p className="mt-1 text-sm text-slate-400">Customize your brand, output, and defaults</p>
        </div>
      </div>

      <div className="card p-4 sm:p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <Palette size={20} className="text-brand-400" />
          <h2 className="text-lg font-bold text-white">Branding</h2>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Watermark Text</label>
          <input value={watermark} onChange={e => setWatermark(e.target.value)} placeholder="e.g. @yourchannel"
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white" />
          <p className="text-[10px] text-slate-500">Shown on all exported clips for free users</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Brand Color</label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="h-10 w-16 rounded-lg cursor-pointer bg-slate-800 border border-slate-700" />
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
          <select value={musicTrack} onChange={e => setMusicTrack(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white">
            <option value="">No music</option>
            <option value="upbeat_corporate">Upbeat Corporate</option>
            <option value="cinematic_drama">Cinematic Drama</option>
            <option value="lo-fi_chill">Lo-fi Chill</option>
            <option value="energetic_edm">Energetic EDM</option>
            <option value="calm_piano">Calm Piano</option>
          </select>
        </div>

        <div className="flex items-center gap-3 pb-4 border-b border-slate-800 pt-4">
          <Globe size={20} className="text-brand-400" />
          <h2 className="text-lg font-bold text-white">Research Defaults</h2>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Default Location for Trends</label>
          <select value={researchLocation} onChange={e => setResearchLocation(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white">
            <option value="US">United States</option>
            <option value="IN">India</option>
            <option value="GB">United Kingdom</option>
            <option value="CA">Canada</option>
            <option value="AU">Australia</option>
            <option value="DE">Germany</option>
            <option value="FR">France</option>
            <option value="BR">Brazil</option>
            <option value="JP">Japan</option>
            <option value="global">Global</option>
          </select>
        </div>

        {error && (
          <div className="rounded-lg border border-red-800/50 bg-red-900/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
        <button onClick={handleSave} disabled={loading}
          className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
          <Save size={16} />
          {saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  )
}
