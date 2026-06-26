"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Search, Flame, Sparkles, Play, ArrowRight, Clock, Eye, Globe,
  RefreshCw, Check, AlertCircle, Sparkle, Copy, BookOpen,
  Film, MessageSquare, MapPin, Music, Users, Layers, Loader2
} from "lucide-react"
import { researchAPI, videosAPI, authAPI } from "@/lib/api"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

interface Trend {
  topic: string
  traffic: string
  url?: string
  source?: string
}

interface Analysis {
  viral_potential: number
  video_concept: string
  suggested_search_query: string
  punchy_hook: string
  hook_variations: string[]
  script_body: string
  call_to_action: string
  pin_comment: string
  hashtags: string[]
  viral_triggers: string[]
  audio_music_recommendation: string
  target_audience: string
}

interface VideoResult {
  title: string
  url: string
  duration: number | null
  uploader: string
  view_count: number | null
}

const REGIONS = [
  { code: "US", name: "United States" },
  { code: "IN", name: "India" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "JP", name: "Japan" },
  { code: "BR", name: "Brazil" },
]

const TONES = [
  { id: "viral", label: "Viral Hype", icon: Sparkles, color: "text-purple-400 bg-purple-950/20 border-purple-500/30" },
  { id: "clickbait", label: "Sensational", icon: Flame, color: "text-amber-400 bg-amber-950/20 border-amber-500/30" },
  { id: "educational", label: "Educational", icon: BookOpen, color: "text-emerald-400 bg-emerald-950/20 border-emerald-500/30" },
  { id: "dramatic", label: "Dramatic", icon: Film, color: "text-rose-400 bg-rose-950/20 border-rose-500/30" },
  { id: "funny", label: "Humorous", icon: MessageSquare, color: "text-sky-400 bg-sky-950/20 border-sky-500/30" },
]

const SOURCES = [
  { id: "google", label: "Google Trends", icon: Globe, color: "text-blue-400" },
  { id: "youtube", label: "YouTube Viral", icon: Play, color: "text-red-400" },
  { id: "reddit", label: "Reddit Hot", icon: MessageSquare, color: "text-orange-400" },
  { id: "news", label: "Global News", icon: BookOpen, color: "text-emerald-400" },
]

const NICHES = [
  { id: "general", label: "General Trends" },
  { id: "sports", label: "Sports" },
  { id: "facts", label: "Amazing Facts" },
  { id: "cartoon", label: "Cartoons & Anime" },
  { id: "science", label: "Science & Space" },
  { id: "tech", label: "Tech & Gadgets" },
  { id: "code", label: "Programming & Git" },
  { id: "trading", label: "Stock & Crypto" },
  { id: "investing", label: "Finance & Investing" },
]

const MOCK_TRACKS = [
  { id: "track_1", title: "Cyberpunk Pulse", genre: "Synthwave", duration: "1:02", vibe: "High Energy / Suspense" },
  { id: "track_2", title: "Lo-Fi Coffee", genre: "Chillhop", duration: "1:30", vibe: "Relaxed / Educational" },
  { id: "track_3", title: "Epic Cinematic", genre: "Orchestral", duration: "0:58", vibe: "Inspirational / Hype" },
  { id: "track_4", title: "Trap Beat Drop", genre: "Hip Hop", duration: "1:15", vibe: "Modern / Bold" },
]

export default function ResearchPage() {
  const router = useRouter()
  const [trends, setTrends] = useState<Trend[]>([])
  const [loadingTrends, setLoadingTrends] = useState(false)
  const [defaultGeo, setDefaultGeo] = useState("US")
  const [selectedGeo, setSelectedGeo] = useState("US")
  const [selectedSource, setSelectedSource] = useState("google")
  const [selectedNiche, setSelectedNiche] = useState("general")
  const [searchQuery, setSearchQuery] = useState("")

  const [selectedTopic, setSelectedTopic] = useState("")
  const [customTopic, setCustomTopic] = useState("")
  const [selectedTrend, setSelectedTrend] = useState<Trend | null>(null)
  const [selectedTone, setSelectedTone] = useState("viral")

  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [activeTab, setActiveTab] = useState("script")

  const [crawling, setCrawling] = useState(false)
  const [videos, setVideos] = useState<VideoResult[]>([])
  const [videoType, setVideoType] = useState("all")

  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastType, setToastType] = useState<"success" | "error">("success")

  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [copiedScript, setCopiedScript] = useState(false)
  const [copiedComment, setCopiedComment] = useState(false)
  const [copiedHookIdx, setCopiedHookIdx] = useState<number | null>(null)

  const [validatingTopic, setValidatingTopic] = useState(false)
  const [validationReport, setValidationReport] = useState<any | null>(null)
  const [importingTrend, setImportingTrend] = useState(false)

  const [editedHook, setEditedHook] = useState("")
  const [editedBody, setEditedBody] = useState("")
  const [editedCTA, setEditedCTA] = useState("")
  const [editedComment, setEditedComment] = useState("")

  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null)

  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null)
  const [selectedMusicId, setSelectedMusicId] = useState<string | null>("track_1")

  const getYouTubeId = (url: string) => {
    if (!url) return null
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
    const match = url.match(regExp)
    return (match && match[2].length === 11) ? match[2] : null
  }

  const getTrendImage = (t: Trend) => {
    if (t.url) {
      const ytId = getYouTubeId(t.url)
      if (ytId) {
        return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`
      }
      try {
        const domain = new URL(t.url).hostname
        return `https://www.google.com/s2/favicons?sz=128&domain=${domain}`
      } catch {
        return null
      }
    }
    return null
  }

  useEffect(() => {
    if (analysis) {
      setEditedHook(analysis.punchy_hook || "")
      setEditedBody(analysis.script_body || "")
      setEditedCTA(analysis.call_to_action || "")
      setEditedComment(analysis.pin_comment || "")
    }
  }, [analysis])

  useEffect(() => {
    (async () => {
      try {
        const res = await authAPI.getSettings()
        if (res.data.research_location) {
          setDefaultGeo(res.data.research_location)
          setSelectedGeo(res.data.research_location)
        }
      } catch {}
    })()
  }, [])

  const loadTrends = async (geoCode: string, sourceFeed: string, nicheCode: string, queryStr = "") => {
    setLoadingTrends(true)
    try {
      const res = await researchAPI.trends(geoCode, sourceFeed, nicheCode, queryStr)
      setTrends(res.data.trends || [])
    } catch {
      showToast("Failed to load trending topics", "error")
    } finally {
      setLoadingTrends(false)
    }
  }

  useEffect(() => {
    loadTrends(selectedGeo, selectedSource, selectedNiche, searchQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGeo, selectedSource, selectedNiche])

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToastMessage(msg)
    setToastType(type)
    setTimeout(() => setToastMessage(null), 4000)
  }

  const validateTopic = async (topic: string, niche: string) => {
    setValidatingTopic(true)
    setValidationReport(null)
    try {
      const res = await researchAPI.validateTopic(topic, niche)
      setValidationReport(res.data)
    } catch {
      showToast("Failed to run AI validation & fact check", "error")
    } finally {
      setValidatingTopic(false)
    }
  }

  const handleSelectTopic = (t: Trend) => {
    setSelectedTopic(t.topic)
    setCustomTopic(t.topic)
    setSelectedTrend(t)
    analyzeTopic(t.topic, selectedTone)
    validateTopic(t.topic, selectedNiche)
  }

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customTopic.trim()) return
    setSelectedTopic(customTopic)
    setSelectedTrend(null)
    analyzeTopic(customTopic, selectedTone)
    validateTopic(customTopic, selectedNiche)
  }

  const handleImportTrend = async (topic: string, url?: string) => {
    setImportingTrend(true)
    showToast("Analyzing trend & fetching matching video...", "success")
    try {
      const res = await researchAPI.importTrend(topic, selectedNiche, "youtube_shorts", url)
      const video = res.data
      if (video.progress === 100) {
        showToast("Cloned processed video instantly! Redirecting to Dashboard...", "success")
      } else {
        showToast("One-Click ingestion pipeline started! Redirecting to Dashboard...", "success")
      }
      setTimeout(() => {
        router.push("/app")
      }, 1500)
    } catch (err) {
      showToast("Failed to run One-Click generation for this trend", "error")
    } finally {
      setImportingTrend(false)
    }
  }

  const analyzeTopic = async (topic: string, tone: string) => {
    setAnalyzing(true)
    setAnalysis(null)
    setVideos([])
    setCopiedScript(false)
    setCopiedComment(false)
    setCopiedHookIdx(null)
    setActiveTab("script")
    try {
      const res = await researchAPI.analyze(topic, tone)
      setAnalysis(res.data)
      if (res.data.suggested_search_query) {
        crawlVideos(res.data.suggested_search_query, videoType)
      }
    } catch {
      showToast("Ollama analysis failed", "error")
    } finally {
      setAnalyzing(false)
    }
  }

  const crawlVideos = async (query: string, typeFilter: string) => {
    setCrawling(true)
    try {
      const res = await researchAPI.crawl(query, typeFilter)
      setVideos(res.data.videos || [])
    } catch {
      showToast("Video crawler failed to retrieve search results", "error")
    } finally {
      setCrawling(false)
    }
  }

  const handleVideoTypeChange = (newType: string) => {
    setVideoType(newType)
    if (analysis?.suggested_search_query) {
      crawlVideos(analysis.suggested_search_query, newType)
    }
  }

  const handleAutoGenerate = async (videoUrl: string, videoTitle: string) => {
    setGeneratingId(videoUrl)
    showToast("Initializing auto-generation pipeline...", "success")
    try {
      await videosAPI.importFromUrl(videoUrl, "youtube_shorts")
      showToast("Video ingested successfully! Redirecting to Dashboard...", "success")
      setTimeout(() => {
        router.push("/app")
      }, 1500)
    } catch (err) {
      showToast("Failed to import video for auto-generation", "error")
      setGeneratingId(null)
    }
  }

  const copyToClipboard = (text: string, type: "script" | "comment") => {
    navigator.clipboard.writeText(text)
    if (type === "script") {
      setCopiedScript(true)
      setTimeout(() => setCopiedScript(false), 2000)
      showToast("Script outline copied to clipboard", "success")
    } else {
      setCopiedComment(true)
      setTimeout(() => setCopiedComment(false), 2000)
      showToast("Pinned comment copied to clipboard", "success")
    }
  }

  const formatScriptBody = (text: any) => {
    if (!text) return null
    let str = ""
    if (typeof text === "string") {
      str = text
    } else if (Array.isArray(text)) {
      str = text.join("\n")
    } else if (typeof text === "object") {
      str = JSON.stringify(text, null, 2)
    } else {
      str = String(text)
    }
    const parts = str.split(/(\[[^\]]+\])/g)
    return parts.map((part, index) => {
      if (part.startsWith("[") && part.endsWith("]")) {
        return (
          <span
            key={index}
            className="inline-block my-1 mx-1 text-[10px] font-bold uppercase tracking-wider text-brand-400 bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 rounded"
          >
            {part}
          </span>
        )
      }
      return <span key={index}>{part}</span>
    })
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "--:--"
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s < 10 ? "0" : ""}${s}`
  }

  const formatViews = (views: number | null) => {
    if (!views) return "No views"
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M views`
    if (views >= 1000) return `${(views / 1000).toFixed(0)}K views`
    return `${views} views`
  }

  const radius = 32
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = analysis
    ? circumference - (analysis.viral_potential * circumference)
    : circumference

  return (
    <div className="relative animate-fade-in space-y-12 pb-16 px-4 md:px-6 max-w-7xl mx-auto">
      {/* Background Neon Glows */}
      <div className="absolute top-[-10%] left-[5%] -z-10 h-[500px] w-[500px] rounded-full bg-brand-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute top-[20%] right-[5%] -z-10 h-[400px] w-[400px] rounded-full bg-purple-500/5 blur-[100px] pointer-events-none" />

      {toastMessage && (
        <div
          className={cn(
            "fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold shadow-lg backdrop-blur-md border animate-slide-up",
            toastType === "success"
              ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/30"
              : "bg-red-950/80 text-red-300 border-red-500/30"
          )}
        >
          {toastType === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
          {toastMessage}
        </div>
      )}

      {/* Spacious Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-border/40">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
              <Sparkle className="size-5 fill-current animate-pulse-glow" />
            </div>
            <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-brand-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent sm:text-4xl">
              Research & Trends Laboratory
            </h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Uncover high-traffic viral ideas, perform AI credibility fact-checking, analyze keyword dynamics, and generate fully visual, video-ready storyboards in real time.
          </p>
        </div>
        
        {/* Status Indicators */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full text-[11px] font-bold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            Ollama AI: Active
          </div>
          <div className="flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 px-3 py-1.5 rounded-full text-[11px] font-bold text-brand-400">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            Trends Engine: Online
          </div>
        </div>
      </div>

      {/* Premium Floating Search Console */}
      <div className="max-w-4xl mx-auto pt-4">
        <Card className="border border-white/5 bg-card/30 backdrop-blur-xl p-8 shadow-[0_0_50px_rgba(99,102,241,0.05)] rounded-2xl space-y-6">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">AI Insight Generator</h3>
            <p className="text-xs text-muted-foreground">What topic or trend are you exploring today? Let our local AI map out a complete video concept.</p>
          </div>
          
          <form onSubmit={handleCustomSubmit} className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 size-5" />
              <Input
                type="text"
                placeholder="Enter any trend topic, concept prompt, or news headline (e.g. 'SpaceX Mars Mission updates')..."
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                className="pl-12 h-14 text-base bg-background/50 border-border focus:border-brand-500/50 rounded-xl"
              />
            </div>
            <Button
              type="submit"
              disabled={analyzing || !customTopic.trim()}
              className="h-14 px-8 font-bold text-base shadow-lg bg-brand-500 hover:bg-brand-600 hover:shadow-brand-500/20 text-white rounded-xl transition-all duration-300 active:scale-98 shrink-0"
            >
              {analyzing ? (
                <>
                  <Loader2 className="animate-spin mr-2 size-5" />
                  Generating...
                </>
              ) : (
                <>
                  Analyze Concept
                  <ArrowRight size={18} className="ml-2" />
                </>
              )}
            </Button>
          </form>

          {/* Tone blueprint */}
          <div className="space-y-3 pt-4 border-t border-border/40">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Script Tone Blueprint</label>
            <div className="flex flex-wrap gap-2.5">
              {TONES.map((t) => {
                const Icon = t.icon
                const active = selectedTone === t.id
                return (
                  <Button
                    key={t.id}
                    type="button"
                    variant={active ? "default" : "outline"}
                    onClick={() => setSelectedTone(t.id)}
                    className={cn(
                      "flex items-center gap-2 text-xs font-semibold px-4 h-9 bg-background/40 border-border hover:bg-muted/30 rounded-lg transition-all",
                      active && "bg-brand-500 text-white border-brand-500 shadow-md hover:bg-brand-600"
                    )}
                  >
                    <Icon size={14} className={cn(active ? "text-white" : "text-muted-foreground")} />
                    {t.label}
                  </Button>
                )
              })}
            </div>
          </div>
        </Card>
      </div>

      {/* Trends Feed & Aggregator Section */}
      <div className="space-y-6 pt-4">
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
            <Flame size={20} className="text-amber-500 animate-pulse" />
            Trends Aggregator Hub
          </h2>
          <p className="text-xs text-muted-foreground">Select a trend source feed and filters below to fetch live popular data.</p>
        </div>

        {/* Source Feed Cards Selector */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {SOURCES.map((source) => {
            const Icon = source.icon
            const active = selectedSource === source.id
            const colorClass = source.color
            
            // Description for each source
            let desc = ""
            if (source.id === "google") desc = "High-volume search keywords & news RSS"
            else if (source.id === "youtube") desc = "Top trending shorts & videos"
            else if (source.id === "reddit") desc = "Hot submissions from key subreddits"
            else if (source.id === "news") desc = "Global headlines and keyword news"

            return (
              <Card
                key={source.id}
                onClick={() => setSelectedSource(source.id)}
                className={cn(
                  "cursor-pointer p-5 border bg-card/25 hover:bg-card/50 transition-all duration-300 rounded-xl relative overflow-hidden flex flex-col justify-between h-[120px]",
                  active ? "border-brand-500 shadow-[0_0_20px_rgba(99,102,241,0.1)] bg-brand-500/[0.02]" : "border-border"
                )}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("size-5", colorClass)} />
                    <span className="font-bold text-sm text-foreground">{source.label}</span>
                  </div>
                  {active && (
                    <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug mt-2">
                  {desc}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[9px] font-bold text-brand-400 uppercase tracking-widest">Connect</span>
                  <span className="text-[9px] bg-muted px-2 py-0.5 rounded text-muted-foreground font-semibold">Feed: OK</span>
                </div>
              </Card>
            )
          })}
        </div>

        {/* Filter & Live Search Controls Bar */}
        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4 p-5 border border-border/40 bg-card/25 backdrop-blur-md rounded-xl">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 flex-1">
            {/* Live Search input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 size-4" />
              <Input
                type="text"
                placeholder="Find real-time keywords or custom search trends..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    loadTrends(selectedGeo, selectedSource, selectedNiche, searchQuery)
                  }
                }}
                className="pl-10 h-10 bg-background/50 border-border text-xs rounded-lg"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("")
                    loadTrends(selectedGeo, selectedSource, selectedNiche, "")
                  }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0">Region:</span>
                <Select value={selectedGeo} onValueChange={(v) => v !== null && setSelectedGeo(v)}>
                  <SelectTrigger className="text-xs h-10 bg-background border-border px-3 w-[150px] rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((r) => (
                      <SelectItem key={r.code} value={r.code}>{r.name} ({r.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0">Niche:</span>
                <Select value={selectedNiche} onValueChange={(v) => v !== null && setSelectedNiche(v)}>
                  <SelectTrigger className="text-xs h-10 bg-background border-border px-3 w-[180px] rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NICHES.map((n) => (
                      <SelectItem key={n.id} value={n.id}>{n.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Button
            className="h-10 bg-brand-500 hover:bg-brand-600 text-white shrink-0 text-xs font-bold px-5 gap-2 rounded-lg"
            onClick={() => loadTrends(selectedGeo, selectedSource, selectedNiche, searchQuery)}
            disabled={loadingTrends}
          >
            <RefreshCw size={14} className={cn(loadingTrends && "animate-spin")} />
            Search & Sync Trends
          </Button>
        </div>

        {/* Live Trends Deck List Layout */}
        {loadingTrends ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="border border-border/40 bg-card/10 animate-pulse h-[90px] rounded-xl" />
            ))}
          </div>
        ) : trends.length === 0 ? (
          <Card className="border border-dashed border-border bg-card/10 p-16 text-center rounded-xl">
            <p className="text-sm text-muted-foreground">No live trends retrieved. Try searching for a different keyword or toggling options.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {trends.slice(0, 15).map((t, idx) => {
              const active = selectedTopic === t.topic
              const imgUrl = getTrendImage(t)
              const isYt = !!getYouTubeId(t.url || "")

              return (
                <div
                  key={idx}
                  onClick={() => handleSelectTopic(t)}
                  className={cn(
                    "group/trend border bg-card/25 backdrop-blur-md transition-all duration-300 p-5 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:border-brand-500/30 hover:bg-card/50 hover:shadow-md cursor-pointer",
                    active ? "border-brand-500/60 bg-brand-500/[0.02] shadow-[0_0_20px_rgba(99,102,241,0.05)]" : "border-border/60"
                  )}
                >
                  <div className="flex items-center gap-5 flex-1 min-w-0">
                    {/* Preview Image/Icon Container */}
                    <div className="relative w-24 h-16 sm:w-28 sm:h-18 rounded-lg overflow-hidden border border-border bg-muted/20 shrink-0 flex items-center justify-center">
                      {imgUrl ? (
                        isYt ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imgUrl} alt="Video Preview" className="w-full h-full object-cover" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imgUrl} alt="Favicon Preview" className="size-8 object-contain" />
                        )
                      ) : (
                        <Globe className="size-6 text-muted-foreground/45" />
                      )}
                      {isYt && (
                        <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                          <Play size={14} className="text-white fill-current" />
                        </div>
                      )}
                    </div>

                    {/* Topic text and tags */}
                    <div className="min-w-0 flex-1 space-y-2">
                      <h3 className="text-sm sm:text-base font-bold text-foreground leading-snug break-words group-hover/trend:text-brand-400 transition-colors">
                        {t.topic}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded">
                          {t.traffic}
                        </span>
                        <span>&bull;</span>
                        <span className="flex items-center gap-1 font-medium capitalize">
                          <span className="size-1.5 rounded-full bg-indigo-500" />
                          {t.source || selectedSource}
                        </span>
                        <span>&bull;</span>
                        <span className="flex items-center gap-1 font-medium">
                          <MapPin size={11} /> {selectedGeo}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions right side */}
                  <div className="flex items-center gap-3 shrink-0 w-full md:w-auto justify-end md:justify-start pt-3 md:pt-0 border-t border-border/10 md:border-t-0">
                    {t.url && (
                      <a
                        href={t.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-muted/20 border border-border/60 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                        title="View Original Link"
                      >
                        <Globe size={13} />
                        <span>Visit Link</span>
                      </a>
                    )}
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleImportTrend(t.topic, t.url)
                      }}
                      disabled={importingTrend}
                      className="text-xs font-extrabold uppercase h-9 px-4 shadow-md bg-brand-500 hover:bg-brand-600 text-white rounded-lg gap-1.5"
                    >
                      <Sparkles size={13} className="fill-current" />
                      Ingest Video
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Analysis Section loading state */}
      {analyzing && (
        <Card className="border border-white/5 bg-card/20 py-32 text-center animate-pulse-glow max-w-4xl mx-auto rounded-2xl shadow-xl">
          <CardContent className="flex flex-col items-center space-y-5">
            <Loader2 className="h-10 w-10 animate-spin text-brand-400" />
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-foreground">AI Concept Studio Analyzing</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                Scanning multi-source databases, scoring virality dimensions, and compiling verification index fact checks via local LLM...
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Visual Workspace Dashboard */}
      {analysis && !analyzing && (
        <div className="space-y-8 animate-scale-in pt-4">
          
          {/* Active Analysis Section Header */}
          <Card className="border border-white/5 bg-card/30 backdrop-blur-xl overflow-hidden p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-8 shadow-xl rounded-2xl">
            <div className="space-y-3 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge className="bg-brand-500/10 text-brand-400 border-brand-500/25 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">
                  Active Analysis Concept
                </Badge>
                <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/25 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">
                  Target Tone: {TONES.find(t => t.id === selectedTone)?.label}
                </Badge>
              </div>
              <h2 className="text-2xl font-black text-foreground leading-tight">{selectedTopic}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                The AI concept report and storyboard outline are generated below. You can edit the attention hook, body narratives, or trigger our one-click video ingest pipeline directly.
              </p>
            </div>
            
            <Button
              onClick={() => handleImportTrend(selectedTopic, selectedTrend?.url)}
              disabled={importingTrend}
              size="lg"
              className="text-sm h-12 font-bold shadow-lg bg-brand-500 hover:bg-brand-600 text-white transition-all duration-300 rounded-xl px-6 hover:shadow-brand-500/20 active:scale-98 shrink-0 w-full md:w-auto"
            >
              {importingTrend ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Generating clips...
                </>
              ) : (
                <>
                  <Sparkles size={16} className="fill-current mr-2" />
                  One-Click Auto-Generate
                </>
              )}
            </Button>
          </Card>

          {/* Dual-Column Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-10 pt-4">
            
            {/* Left Column: AI Diagnostics & Fact-Check */}
            <div className="lg:col-span-5 space-y-8">
              
              {/* Viral Potential Gauge Card */}
              <Card className="border border-white/5 bg-card/25 backdrop-blur-md p-6 rounded-2xl shadow-md space-y-6">
                <div className="flex items-center justify-between border-b border-border/40 pb-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                      <Flame size={16} className="text-brand-400" />
                      Virality Analysis
                    </h3>
                    <p className="text-[11px] text-muted-foreground">Ollama evaluation of engagement factors.</p>
                  </div>
                  
                  <Badge className="bg-brand-500/10 text-brand-400 border-brand-500/25 text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded">
                    Score: {Math.round(analysis.viral_potential * 100)}%
                  </Badge>
                </div>
                
                <div className="flex items-center justify-center py-4 bg-muted/10 border border-border/30 rounded-xl">
                  <div className="flex items-center gap-6">
                    <div className="relative size-20 flex items-center justify-center shrink-0">
                      <svg className="absolute transform -rotate-90 w-full h-full">
                        <circle cx="40" cy="40" r="34" className="text-border/50" strokeWidth="6" stroke="currentColor" fill="transparent" />
                        <circle
                          cx="40"
                          cy="40"
                          r="34"
                          className="text-brand-500"
                          strokeWidth="6"
                          strokeDasharray={2 * Math.PI * 34}
                          strokeDashoffset={(2 * Math.PI * 34) - (analysis.viral_potential * (2 * Math.PI * 34))}
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="transparent"
                        />
                      </svg>
                      <span className="text-base font-black text-brand-400">{Math.round(analysis.viral_potential * 100)}%</span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-foreground">Highly Viral Potential</p>
                      <p className="text-[10px] text-muted-foreground leading-normal max-w-[180px]">
                        This topic holds strong interest hooks and is likely to generate highly shareable clip segments.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Score breakdown metrics */}
                <div className="space-y-4">
                  {[
                    { label: "Hook Potential", val: analysis.viral_potential * 0.95 },
                    { label: "Emotion Intensity", val: analysis.viral_potential * 0.88 },
                    { label: "Engagement Gap", val: analysis.viral_potential * 0.92 },
                    { label: "Trend Salience", val: analysis.viral_potential * 1.05 > 1 ? 1 : analysis.viral_potential * 1.05 }
                  ].map((metric, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold">
                        <span className="text-muted-foreground">{metric.label}</span>
                        <span className="text-foreground">{Math.round(metric.val * 100)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-border/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full"
                          style={{ width: `${metric.val * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* AI Credibility validation Report */}
              {(validatingTopic || validationReport) && (
                <Card className="border border-white/5 bg-card/25 backdrop-blur-md overflow-hidden rounded-2xl shadow-md">
                  <div className="p-6 border-b border-border/40 flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                        <Layers size={16} className="text-brand-400" />
                        AI Credibility Check
                      </h3>
                      <p className="text-[10px] text-muted-foreground">Scans keywords, statements, and source claims.</p>
                    </div>
                    {validationReport && (
                      <span className={cn(
                        "text-[9px] font-extrabold px-3 py-1 rounded-full border uppercase tracking-wider",
                        validationReport.is_valid ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      )}>
                        {validationReport.is_valid ? "Verifiably Credible" : "Flags Detected"}
                      </span>
                    )}
                  </div>
                  
                  <CardContent className="p-6 space-y-6">
                    {validatingTopic ? (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground py-6 justify-center">
                        <Loader2 size={16} className="animate-spin text-brand-400" />
                        Generating verification index reports...
                      </div>
                    ) : validationReport ? (
                      <div className="space-y-6">
                        {/* 3 concentric progress rings with spacing */}
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { label: "Credibility", val: validationReport.credibility_score, color: "text-emerald-400 stroke-emerald-400" },
                            { label: "Niche Fit", val: validationReport.niche_alignment, color: "text-purple-400 stroke-purple-400" },
                            { label: "Viral Power", val: validationReport.virality_score, color: "text-pink-400 stroke-pink-400" },
                          ].map((gauge, i) => (
                            <div key={i} className="bg-muted/10 border border-border/30 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                              <div className="relative size-12 flex items-center justify-center mb-2">
                                <svg className="absolute transform -rotate-90 w-full h-full">
                                  <circle cx="24" cy="24" r="20" className="text-border/50" strokeWidth="3" stroke="currentColor" fill="transparent" />
                                  <circle
                                    cx="24"
                                    cy="24"
                                    r="20"
                                    className={gauge.color.split(" ")[1]}
                                    strokeWidth="3"
                                    strokeDasharray={2 * Math.PI * 20}
                                    strokeDashoffset={(2 * Math.PI * 20) - (gauge.val * (2 * Math.PI * 20))}
                                    strokeLinecap="round"
                                    stroke="currentColor"
                                    fill="transparent"
                                  />
                                </svg>
                                <span className={cn("text-[10px] font-black", gauge.color.split(" ")[0])}>
                                  {Math.round(gauge.val * 100)}%
                                </span>
                              </div>
                              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{gauge.label}</p>
                            </div>
                          ))}
                        </div>

                        {/* Factual report details */}
                        <div className="space-y-4 pt-2">
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Fact-Check Summary Report</p>
                            <p className="text-xs text-foreground bg-muted/10 border border-border/30 p-4 rounded-xl leading-relaxed font-medium">
                              {validationReport.fact_check_report}
                            </p>
                          </div>

                          <div className="space-y-1.5">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Factual assessment</p>
                            <p className="text-xs text-foreground bg-muted/10 border border-border/30 p-4 rounded-xl leading-relaxed font-medium">
                              {validationReport.reason}
                            </p>
                          </div>
                        </div>

                        {/* Statement analysis logs */}
                        {validationReport.claims && validationReport.claims.length > 0 && (
                          <div className="space-y-3 pt-2">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Statement analysis logs</p>
                            <div className="grid gap-3 max-h-[220px] overflow-y-auto pr-1">
                              {validationReport.claims.map((c: any, i: number) => (
                                <div key={i} className="bg-muted/10 border border-border/30 p-4 rounded-xl text-xs space-y-2">
                                  <div className="flex justify-between items-start gap-3">
                                    <span className="font-bold text-foreground leading-tight">{c.claim}</span>
                                    <span className={cn(
                                      "text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded border tracking-wider shrink-0",
                                      c.status === "Verified" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                    )}>
                                      {c.status}
                                    </span>
                                  </div>
                                  <p className="text-muted-foreground italic leading-relaxed text-[11px]">{c.verdict}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column: Creative Workbench & Editor */}
            <div className="lg:col-span-7 space-y-8">
              <Card className="border border-white/5 bg-card/25 backdrop-blur-md overflow-hidden rounded-2xl shadow-md">
                <Tabs value={activeTab} onValueChange={(v) => v !== null && setActiveTab(v)} className="w-full">
                  <div className="border-b border-border/40 bg-muted/10 px-6 pt-1">
                    <TabsList className="bg-transparent gap-4 h-12 border-0 p-0">
                      {[
                        { value: "script", label: "Script Teleprompter" },
                        { value: "strategy", label: "Channel Strategy" },
                        { value: "hooks", label: "Hooks variations" },
                        { value: "footage", label: `Footage results (${videos.length})` },
                      ].map((tab) => (
                        <TabsTrigger
                          key={tab.value}
                          value={tab.value}
                          className="h-12 text-xs font-semibold rounded-none border-b-2 border-transparent data-[state=active]:border-brand-500 data-[state=active]:text-foreground bg-transparent px-2 py-1 data-[state=active]:shadow-none data-[state=active]:bg-transparent transition-all"
                        >
                          {tab.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>

                  <div className="p-0">
                    {/* Script Blueprint Tab */}
                    <TabsContent value="script" className="space-y-6 p-6 m-0 focus-visible:outline-none">
                      <div className="flex items-center justify-between border-b border-border/40 pb-3">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                          <Film size={14} className="text-brand-400" /> Storyboard director visual script
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(`[Hook]\n${editedHook}\n\n[Body]\n${editedBody}\n\n[CTA]\n${editedCTA}`, "script")}
                          className="text-xs font-bold text-brand-400 hover:text-brand-300 cursor-pointer flex items-center gap-2 h-8 px-3 rounded-lg"
                        >
                          <Copy size={13} /> {copiedScript ? "Copied script" : "Copy Outline"}
                        </Button>
                      </div>

                      <div className="grid gap-6 xl:grid-cols-2">
                        {/* Visual Timeline editor inputs */}
                        <div className="space-y-6 bg-muted/5 border border-border/40 p-6 rounded-xl">
                          <p className="text-xs font-bold text-foreground uppercase tracking-wider border-b border-border/40 pb-2">Timeline Segments</p>
                          
                          <div className="space-y-2">
                            <span className="text-[9px] font-extrabold tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2.5 py-1 rounded-md uppercase block w-fit">
                              Attention Hook (0-3s)
                            </span>
                            <Input
                              type="text"
                              value={editedHook}
                              onChange={(e) => setEditedHook(e.target.value)}
                              className="bg-background border-border text-sm font-bold text-foreground focus-visible:ring-rose-500/40 focus:border-rose-500/40 h-10 rounded-lg"
                            />
                          </div>

                          <div className="space-y-2">
                            <span className="text-[9px] font-extrabold tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2.5 py-1 rounded-md uppercase block w-fit">
                              Script Narrative Body
                            </span>
                            <Textarea
                              rows={8}
                              value={editedBody}
                              onChange={(e) => setEditedBody(e.target.value)}
                              className="bg-background border-border text-sm font-mono leading-relaxed resize-none focus-visible:ring-purple-500/40 focus:border-purple-500/40 rounded-lg"
                            />
                            <p className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                              💡 Format cues in brackets like <code className="text-brand-400 font-mono font-bold bg-muted px-1.5 py-0.5 rounded border border-border/40">[Visual: details]</code> to color-code.
                            </p>
                          </div>

                          <div className="space-y-2">
                            <span className="text-[9px] font-extrabold tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-md uppercase block w-fit">
                              Growth Call to action
                            </span>
                            <Input
                              type="text"
                              value={editedCTA}
                              onChange={(e) => setEditedCTA(e.target.value)}
                              className="bg-background border-border text-sm font-bold text-emerald-400 focus-visible:ring-emerald-500/40 focus:border-emerald-500/40 h-10 rounded-lg"
                            />
                          </div>
                        </div>

                        {/* Teleprompter Styled Live Preview */}
                        <div className="space-y-4 bg-muted/5 border border-border/40 p-6 rounded-xl flex flex-col min-h-[380px]">
                          <div className="flex justify-between items-center border-b border-border/40 pb-2">
                            <p className="text-xs font-bold text-foreground uppercase tracking-wider">Teleprompter Preview</p>
                            <div className="flex items-center gap-1.5 bg-background border border-border/40 px-2.5 py-1 rounded-md text-[9px] text-muted-foreground font-bold">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Auto Scroll: On
                            </div>
                          </div>
                          <div className="flex-1 w-full bg-neutral-950 border border-brand-500/20 shadow-[inset_0_2px_15px_rgba(0,0,0,0.8),_0_0_20px_rgba(99,102,241,0.05)] rounded-xl p-6 leading-loose text-base text-zinc-100 font-medium overflow-y-auto max-h-[380px] whitespace-pre-wrap font-mono">
                            <div className="space-y-6">
                              <div>
                                <span className="text-[10px] font-bold text-rose-400 border border-rose-500/20 bg-rose-500/5 px-2 py-0.5 rounded mr-2 uppercase select-none">Hook</span>
                                <span className="text-rose-300 font-bold">{editedHook}</span>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-purple-400 border border-purple-500/20 bg-purple-500/5 px-2 py-0.5 rounded mr-2 uppercase select-none">Body</span>
                                <span className="text-zinc-200">{formatScriptBody(editedBody)}</span>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-emerald-400 border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 rounded mr-2 uppercase select-none">CTA</span>
                                <span className="text-emerald-300 font-bold">{editedCTA}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    {/* Channel strategy tab */}
                    <TabsContent value="strategy" className="space-y-6 p-6 m-0 focus-visible:outline-none">
                      <div className="grid gap-6 xl:grid-cols-2">
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Layers size={14} className="text-brand-400" /> AI Growth triggers
                            </p>
                            <div className="flex flex-wrap gap-2 pt-1">
                              {analysis.viral_triggers && analysis.viral_triggers.map((trigger, idx) => (
                                <span key={idx} className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400 uppercase tracking-wider shadow-sm">
                                  {trigger}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Users size={14} className="text-purple-400" /> Target Demographic
                            </p>
                            <p className="text-xs text-foreground bg-muted/10 border border-border/30 rounded-xl p-4 font-semibold leading-relaxed">
                              {analysis.target_audience}
                            </p>
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Music size={14} className="text-sky-400" /> AI Soundtrack recommendation
                            </p>
                            <p className="text-xs text-foreground bg-muted/10 border border-border/30 rounded-xl p-4 font-semibold leading-relaxed">
                              {analysis.audio_music_recommendation}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Music size={14} className="text-brand-400" /> Backing tracks shelf
                            </p>
                            <div className="border border-border/40 rounded-xl bg-muted/10 p-5 space-y-3">
                              {MOCK_TRACKS.map((track) => (
                                <div
                                  key={track.id}
                                  className={cn(
                                    "flex items-center justify-between p-3.5 rounded-xl border text-xs transition-all cursor-pointer",
                                    selectedMusicId === track.id
                                      ? "bg-brand-500/10 border-brand-500/30 text-foreground font-bold shadow-sm"
                                      : "bg-background border-border text-muted-foreground hover:border-border/60"
                                  )}
                                  onClick={() => setSelectedMusicId(track.id)}
                                >
                                  <div className="flex items-center gap-3">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setPlayingTrackId(playingTrackId === track.id ? null : track.id)
                                      }}
                                      className="h-8 w-8 rounded-lg border border-border bg-background shrink-0 flex items-center justify-center text-xs"
                                    >
                                      {playingTrackId === track.id ? "⏸" : "▶"}
                                    </Button>
                                    <div className="space-y-0.5">
                                      <p className="font-bold flex items-center gap-2 leading-none">
                                        {track.title}
                                        <span className="text-[8px] bg-muted border border-border px-1.5 py-0.5 rounded text-muted-foreground font-bold">
                                          {track.genre}
                                        </span>
                                      </p>
                                      <p className="text-[9px] text-muted-foreground mt-0.5 font-normal">{track.vibe}</p>
                                    </div>
                                  </div>
                                  <span className="font-mono text-[9px] text-muted-foreground">{track.duration}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <MessageSquare size={14} className="text-rose-400" /> Engagement Pinned Comment
                            </p>
                            <div className="bg-muted/10 border border-border/30 p-5 rounded-xl space-y-3">
                              <Textarea
                                rows={3}
                                value={editedComment}
                                onChange={(e) => setEditedComment(e.target.value)}
                                className="text-xs font-semibold italic bg-background border-border focus:border-rose-500/30"
                              />
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] text-muted-foreground font-semibold">📍 PIN TO TOP</span>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => copyToClipboard(editedComment, "comment")}
                                  className="text-xs font-bold text-brand-400 hover:text-brand-300 cursor-pointer flex items-center gap-1.5"
                                >
                                  <Copy size={12} /> {copiedComment ? "Copied" : "Copy Comment"}
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-bold text-foreground uppercase tracking-wider">Hashtags bank</p>
                            <div className="flex flex-wrap gap-2 pt-1">
                              {analysis.hashtags.map((h, i) => (
                                <span key={i} className="text-[11px] font-bold px-3 py-1 rounded-lg bg-brand-500/10 border border-brand-500/25 text-brand-400">
                                  #{h.replace("#", "")}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    {/* Hooks variations tab */}
                    <TabsContent value="hooks" className="space-y-5 p-6 m-0 focus-visible:outline-none">
                      <p className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2 border-b border-border/40 pb-3">
                        <Sparkles size={14} className="text-rose-400" /> Hook overlay title variations
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {analysis.hook_variations && analysis.hook_variations.map((hook, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-4 bg-muted/10 border border-border/30 p-5 rounded-xl hover:bg-muted/20 transition-all"
                          >
                            <p className="text-xs font-bold text-foreground leading-relaxed">{hook}</p>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                navigator.clipboard.writeText(hook)
                                setCopiedHookIdx(idx)
                                showToast("Hook copied", "success")
                                setTimeout(() => setCopiedHookIdx(null), 2000)
                              }}
                              className="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer h-9 w-9 rounded-lg border border-border"
                            >
                              {copiedHookIdx === idx ? (
                                <Check size={14} className="text-emerald-400" />
                              ) : (
                                <Copy size={14} />
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    {/* Footage finder tab */}
                    <TabsContent value="footage" className="space-y-6 p-6 m-0 focus-visible:outline-none">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
                        <p className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <Globe size={14} className="text-brand-400" /> Web clip feeds search results
                        </p>

                        <div className="flex bg-muted/30 p-1 rounded-lg border border-border/60 w-fit shrink-0">
                          {["all", "shorts", "long"].map((filter) => (
                            <button
                              key={filter}
                              onClick={() => handleVideoTypeChange(filter)}
                              className={cn(
                                "px-3 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all cursor-pointer",
                                videoType === filter
                                  ? "bg-background text-foreground shadow-sm"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {filter === "all" ? "All Video" : filter === "shorts" ? "Shorts" : "Long"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {activePreviewUrl && (
                        <Card className="border border-white/5 bg-black/95 p-5 space-y-4 animate-scale-in rounded-xl">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                              <Play size={14} className="text-brand-400 animate-pulse fill-current" /> Video Player
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setActivePreviewUrl(null)}
                              className="text-xs font-bold text-rose-400 hover:text-rose-300 h-7 px-3 cursor-pointer rounded-lg hover:bg-white/5"
                            >
                              Hide Player
                            </Button>
                          </div>
                          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black border border-white/10 shadow-inner">
                            {getYouTubeId(activePreviewUrl) ? (
                              <iframe
                                src={`https://www.youtube.com/embed/${getYouTubeId(activePreviewUrl)}?autoplay=1`}
                                title="Preview Clip"
                                className="absolute inset-0 h-full w-full border-0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                                Preview not available for this URL format.
                              </div>
                            )}
                          </div>
                        </Card>
                      )}

                      {crawling ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          {[...Array(4)].map((_, i) => (
                            <div key={i} className="h-24 w-full bg-muted/10 animate-pulse rounded-xl border border-border/20" />
                          ))}
                        </div>
                      ) : videos.length === 0 ? (
                        <div className="text-center py-12">
                          <p className="text-sm text-muted-foreground">No matching video clips found.</p>
                        </div>
                      ) : (
                        <div className="grid gap-4 sm:grid-cols-2 max-h-[460px] overflow-y-auto pr-1">
                          {videos.map((vid, idx) => (
                            <div
                              key={idx}
                              className="flex flex-col justify-between gap-4 bg-muted/10 border border-border/30 rounded-xl p-5 hover:bg-muted/20 transition-all"
                            >
                              <div className="min-w-0">
                                <h4 className="text-xs font-bold text-foreground leading-snug line-clamp-2 mb-2">{vid.title}</h4>
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-muted-foreground">
                                  <span className="font-bold text-brand-400">{vid.uploader}</span>
                                  <span>&bull;</span>
                                  <span className="flex items-center gap-0.5"><Eye size={11} /> {formatViews(vid.view_count)}</span>
                                  <span>&bull;</span>
                                  <span className="flex items-center gap-0.5"><Clock size={11} /> {formatDuration(vid.duration)}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 pt-3 border-t border-border/10 shrink-0 justify-end mt-2">
                                <Button
                                  variant={activePreviewUrl === vid.url ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setActivePreviewUrl(activePreviewUrl === vid.url ? null : vid.url)}
                                  className={cn(
                                    "text-xs font-bold h-8 border-border bg-background text-muted-foreground hover:text-foreground cursor-pointer px-4 rounded-lg",
                                    activePreviewUrl === vid.url && "bg-brand-500/10 border-brand-500/35 text-brand-400 hover:text-brand-400"
                                  )}
                                >
                                  Preview Clip
                                </Button>

                                <Button
                                  onClick={() => handleAutoGenerate(vid.url, vid.title)}
                                  disabled={generatingId !== null}
                                  size="sm"
                                  className="text-xs font-bold h-8 cursor-pointer px-4 bg-brand-500 hover:bg-brand-600 text-white rounded-lg"
                                >
                                  {generatingId === vid.url ? (
                                    <>
                                      <Loader2 size={11} className="animate-spin mr-1.5" />
                                      Clipping...
                                    </>
                                  ) : (
                                    <>
                                      <Play size={11} className="mr-1.5 fill-current" />
                                      Auto-Generate
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  </div>
                </Tabs>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
