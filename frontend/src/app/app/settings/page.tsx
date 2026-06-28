"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Palette, Music, Globe, Save, Sparkles, Key, Settings } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { CaptionStyleSelector } from "@/components/CaptionStyleSelector"
import { ConnectedAccounts } from "@/components/ConnectedAccounts"
import { authAPI } from "@/lib/api"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const COLOR_PRESETS = [
  { hex: "#6366f1", name: "Indigo" },
  { hex: "#f43f5e", name: "Rose" },
  { hex: "#eab308", name: "Amber" },
  { hex: "#10b981", name: "Emerald" },
  { hex: "#8b5cf6", name: "Violet" },
  { hex: "#ef4444", name: "Red" },
]

export default function SettingsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("brand")
  const [watermark, setWatermark] = useState("")
  const [color, setColor] = useState("#6366f1")
  const [captionStyle, setCaptionStyle] = useState("classic")
  const [musicTrack, setMusicTrack] = useState("")
  const [researchLocation, setResearchLocation] = useState("US")
  const [enableModeration, setEnableModeration] = useState(true)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const res = await authAPI.getSettings()
        const s = res.data
        setWatermark(s.watermark_text || "")
        setColor(s.primary_color || "#6366f1")
        setCaptionStyle(s.caption_style || "classic")
        setMusicTrack(s.music_track || "")
        setResearchLocation(s.research_location || "US")
        setEnableModeration(s.enable_moderation !== false)
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
        enable_moderation: enableModeration,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError("Failed to save settings")
    }
    setLoading(false)
  }

  if (loading && !watermark && color === "#6366f1") {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="animate-spin text-brand-400 size-5" />
        <span>Loading settings...</span>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6 w-full max-w-4xl mx-auto">
      {/* Header section */}
      <div className="border-b border-border pb-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push("/app")}
            className="h-9 w-9 rounded-lg border-border bg-card hover:bg-muted"
          >
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">Settings</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Customize branding default properties and configure social media integrations
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Layout */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="bg-muted p-1 rounded-lg">
          <TabsTrigger value="brand" className="text-xs py-1.5 px-4">
            <Palette size={14} className="mr-1.5" /> Brand & Defaults
          </TabsTrigger>
          <TabsTrigger value="integrations" className="text-xs py-1.5 px-4">
            <Key size={14} className="mr-1.5" /> Social Channels
          </TabsTrigger>
        </TabsList>

        {/* Brand & Creation Defaults Tab Content */}
        <TabsContent value="brand" className="m-0 focus-visible:outline-none">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Branding Details Form */}
            <div className="md:col-span-2 space-y-6">
              <Card className="border border-border bg-card shadow-sm">
                <CardHeader className="p-6 pb-2">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Palette size={18} className="text-brand-400" /> Branding Config
                  </CardTitle>
                  <CardDescription className="text-xs">Configure watermarks, colors, and subtitle themes</CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-4 space-y-6">
                  {/* Watermark Input */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Watermark Text</Label>
                    <Input
                      value={watermark}
                      onChange={e => setWatermark(e.target.value)}
                      placeholder="e.g. @yourchannel"
                      className="bg-background border-border"
                    />
                    <p className="text-[10px] text-muted-foreground">Shown as a burning overlay on exported clips for free plan users</p>
                  </div>

                  {/* Brand Color Presets + Picker */}
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Primary Brand Color</Label>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={color}
                          onChange={e => setColor(e.target.value)}
                          className="h-10 w-14 rounded-lg cursor-pointer bg-card border border-border"
                        />
                        <span className="text-xs font-mono bg-muted/60 border border-border px-2.5 py-1 rounded text-foreground">{color}</span>
                      </div>
                      
                      {/* Swatches preset list */}
                      <div className="flex flex-wrap gap-2">
                        {COLOR_PRESETS.map(preset => (
                          <button
                            key={preset.hex}
                            type="button"
                            onClick={() => setColor(preset.hex)}
                            className={cn(
                              "h-7 px-2.5 rounded-full text-[10px] font-bold border transition-all duration-200 cursor-pointer flex items-center gap-1",
                              color.toLowerCase() === preset.hex.toLowerCase()
                                ? "border-foreground bg-foreground/10 text-foreground shadow-sm"
                                : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
                            )}
                          >
                            <span className="size-2 rounded-full" style={{ backgroundColor: preset.hex }} />
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Subtitle styles */}
                  <div className="space-y-2 pt-2 border-t border-border">
                    <CaptionStyleSelector value={captionStyle} onChange={setCaptionStyle} />
                  </div>

                  {/* Content Moderation */}
                  <div className="space-y-3 pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Content Moderation Gate</Label>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Skip clips containing profanity, violence, or sensitive keywords automatically</p>
                    </div>
                    <Select value={enableModeration ? "true" : "false"} onValueChange={(v) => setEnableModeration(v === "true")}>
                      <SelectTrigger className="w-full sm:w-[170px] bg-background border-border text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Enabled (Skip Flagged)</SelectItem>
                        <SelectItem value="false">Disabled (Show All)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Side Column: Track & Localization Settings */}
            <div className="md:col-span-1 space-y-6">
              {/* Background Music Card */}
              <Card className="border border-border bg-card shadow-sm">
                <CardHeader className="p-6 pb-2">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Music size={18} className="text-brand-400" /> Default Soundtrack
                  </CardTitle>
                  <CardDescription className="text-xs">Choose default backing tracks</CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-2">
                  <Select value={musicTrack} onValueChange={(v) => v !== null && setMusicTrack(v)}>
                    <SelectTrigger className="w-full bg-background border-border">
                      <SelectValue placeholder="No background music" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No music</SelectItem>
                      <SelectItem value="upbeat_corporate">Upbeat Corporate</SelectItem>
                      <SelectItem value="cinematic_drama">Cinematic Drama</SelectItem>
                      <SelectItem value="lo-fi_chill">Lo-fi Chill</SelectItem>
                      <SelectItem value="energetic_edm">Energetic EDM</SelectItem>
                      <SelectItem value="calm_piano">Calm Piano</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Research Defaults Card */}
              <Card className="border border-border bg-card shadow-sm">
                <CardHeader className="p-6 pb-2">
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Globe size={18} className="text-brand-400" /> Trends Locale
                  </CardTitle>
                  <CardDescription className="text-xs">Select target location for trends</CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-2">
                  <Select value={researchLocation} onValueChange={(v) => v !== null && setResearchLocation(v)}>
                    <SelectTrigger className="w-full bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="US">United States</SelectItem>
                      <SelectItem value="IN">India</SelectItem>
                      <SelectItem value="GB">United Kingdom</SelectItem>
                      <SelectItem value="CA">Canada</SelectItem>
                      <SelectItem value="AU">Australia</SelectItem>
                      <SelectItem value="DE">Germany</SelectItem>
                      <SelectItem value="FR">France</SelectItem>
                      <SelectItem value="BR">Brazil</SelectItem>
                      <SelectItem value="JP">Japan</SelectItem>
                      <SelectItem value="global">Global</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Error Message and Save Action bar */}
          <div className="mt-6 flex flex-col gap-4 items-stretch">
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-semibold text-destructive shadow-sm">
                {error}
              </div>
            )}
            <Button
              onClick={handleSave}
              disabled={loading}
              className="w-full h-11 text-sm font-semibold shadow-md"
            >
              {loading ? (
                <Loader2 className="animate-spin mr-1.5 size-4" />
              ) : (
                <Save size={16} className="mr-1.5" />
              )}
              {saved ? "All Settings Saved!" : "Save Configuration Settings"}
            </Button>
          </div>
        </TabsContent>

        {/* Social Channels Tab Content */}
        <TabsContent value="integrations" className="m-0 focus-visible:outline-none">
          <div className="space-y-6">
            <Card className="border border-border bg-card shadow-sm">
              <CardHeader className="p-6">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Key size={18} className="text-brand-400" /> Channel Integrations
                </CardTitle>
                <CardDescription className="text-xs">
                  Connect platform API credentials to automatically schedule and publish generated short clips
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 pt-0">
                <ConnectedAccounts />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Loader2(props: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
