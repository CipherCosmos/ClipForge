"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { 
  Search, Flame, Sparkles, Play, ArrowRight, Clock, Eye, Globe, 
  RefreshCw, Check, AlertCircle, Sparkle, Copy, BookOpen, 
  Film, MessageSquare, MapPin, Music, Users, Layers
} from "lucide-react"
import { researchAPI, videosAPI, authAPI } from "@/lib/api"
import { cn } from "@/lib/utils"

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
  { id: "google", label: "Google Trends", icon: Globe, color: "text-blue-400 hover:text-blue-300" },
  { id: "youtube", label: "YouTube Viral", icon: Play, color: "text-red-400 hover:text-red-300" },
  { id: "reddit", label: "Reddit Hot", icon: MessageSquare, color: "text-orange-400 hover:text-orange-300" },
  { id: "news", label: "Global News", icon: BookOpen, color: "text-emerald-400 hover:text-emerald-300" },
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
  
  const [selectedTopic, setSelectedTopic] = useState("")
  const [customTopic, setCustomTopic] = useState("")
  const [selectedTone, setSelectedTone] = useState("viral")
  
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [activeTab, setActiveTab] = useState("script") // script, strategy, hooks, footage
  
  const [crawling, setCrawling] = useState(false)
  const [videos, setVideos] = useState<VideoResult[]>([])
  const [videoType, setVideoType] = useState("all") // all, shorts, long
  
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastType, setToastType] = useState<"success" | "error">("success")
  
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [copiedScript, setCopiedScript] = useState(false)
  const [copiedComment, setCopiedComment] = useState(false)
  const [copiedHookIdx, setCopiedHookIdx] = useState<number | null>(null)

  // AI Validation Report state
  const [validatingTopic, setValidatingTopic] = useState(false)
  const [validationReport, setValidationReport] = useState<any | null>(null)
  const [importingTrend, setImportingTrend] = useState(false)

  // Edited script states
  const [editedHook, setEditedHook] = useState("")
  const [editedBody, setEditedBody] = useState("")
  const [editedCTA, setEditedCTA] = useState("")
  const [editedComment, setEditedComment] = useState("")

  // Embedded video preview state
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null)

  // Soundtrack Shelf state
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null)
  const [selectedMusicId, setSelectedMusicId] = useState<string | null>("track_1")

  // Helper to extract YouTube video ID
  const getYouTubeId = (url: string) => {
    if (!url) return null
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
    const match = url.match(regExp)
    return (match && match[2].length === 11) ? match[2] : null
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

  const loadTrends = async (geoCode: string, sourceFeed: string, nicheCode: string) => {
    setLoadingTrends(true)
    try {
      const res = await researchAPI.trends(geoCode, sourceFeed, nicheCode)
      setTrends(res.data.trends || [])
    } catch {
      showToast("Failed to load trending topics", "error")
    } finally {
      setLoadingTrends(false)
    }
  }

  useEffect(() => {
    loadTrends(selectedGeo, selectedSource, selectedNiche)
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

  const handleSelectTopic = (topic: string) => {
    setSelectedTopic(topic)
    setCustomTopic(topic)
    analyzeTopic(topic, selectedTone)
    validateTopic(topic, selectedNiche)
  }

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customTopic.trim()) return
    setSelectedTopic(customTopic)
    analyzeTopic(customTopic, selectedTone)
    validateTopic(customTopic, selectedNiche)
  }

  const handleImportTrend = async (topic: string) => {
    setImportingTrend(true)
    showToast("Analyzing trend & fetching matching video...", "success")
    try {
      const res = await researchAPI.importTrend(topic, selectedNiche)
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
            className="block my-2 text-xs font-extrabold uppercase tracking-wider text-brand-400 bg-brand-500/10 border border-brand-500/20 px-2 py-1 rounded w-fit"
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

  // Radial progress calculations
  const radius = 32
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = analysis 
    ? circumference - (analysis.viral_potential * circumference) 
    : circumference

  return (
    <div className="relative animate-fade-in space-y-8 pb-10">
      {/* Toast feedback */}
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

      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Sparkle className="text-brand-400 fill-brand-400/20" size={24} />
          Trend Research & Content Factory
        </h1>
        <p className="text-sm text-slate-400 max-w-3xl">
          Track live feeds across multiple platforms, engineer growth-optimized AI script blueprints with director visual cues using local models, and spin up hot shorts or reels with one click.
        </p>
      </div>

      {/* Main Layout Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        
        {/* Left Side: Trends Panel */}
        <div className="lg:col-span-1 flex flex-col gap-4 bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 backdrop-blur-md h-fit">
          <div className="flex flex-col gap-3">
            
            {/* Feed Tabs Selector */}
            <div className="grid grid-cols-2 gap-2">
              {SOURCES.map((src) => {
                const Icon = src.icon
                const active = selectedSource === src.id
                return (
                  <button
                    key={src.id}
                    onClick={() => {
                      setSelectedSource(src.id)
                      setTrends([])
                    }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all hover:scale-[1.02]",
                      active
                        ? "bg-slate-800 border-slate-700 text-white font-bold"
                        : "bg-slate-950/40 border-slate-800/40 text-slate-400 hover:text-slate-200"
                    )}
                  >
                    <Icon size={14} className={active ? src.color : "text-slate-500"} />
                    <span>{src.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Niche Selector */}
            <div className="flex flex-col gap-1 border-t border-slate-800/60 pt-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Niche / Target Industry</span>
              <select
                value={selectedNiche}
                onChange={(e) => {
                  setSelectedNiche(e.target.value)
                  setTrends([])
                }}
                className="text-xs bg-slate-950 border border-slate-800 text-slate-300 rounded px-2.5 py-1.5 focus:outline-none transition-all font-semibold cursor-pointer w-full"
              >
                {NICHES.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800/60 pt-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Flame size={12} className="text-amber-400" />
                Live Trends
              </span>
              <div className="flex items-center gap-2">
                {/* Geo Selector - Only show for Google/News which support region filtering */}
                {(selectedSource === "google" || selectedSource === "news") && (
                  <div className="relative">
                    <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" size={10} />
                    <select
                      value={selectedGeo}
                      onChange={(e) => setSelectedGeo(e.target.value)}
                      className="text-[10px] bg-slate-950 border border-slate-800 text-slate-400 rounded pl-5 pr-2 py-0.5 focus:outline-none transition-all font-semibold cursor-pointer"
                    >
                      {REGIONS.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.code}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button 
                  onClick={() => loadTrends(selectedGeo, selectedSource, selectedNiche)} 
                  disabled={loadingTrends}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 disabled:opacity-50"
                >
                  <RefreshCw size={12} className={cn(loadingTrends && "animate-spin")} />
                </button>
              </div>
            </div>

          </div>

          {loadingTrends ? (
            <div className="space-y-2 py-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-9 w-full bg-slate-800/20 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : trends.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-xs text-slate-500">No live trends retrieved. Try refreshing.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto pr-1">
              {trends.map((t, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg px-3 py-2 border transition-all duration-200 hover:bg-slate-800/10 group/trend",
                    selectedTopic === t.topic
                      ? "bg-brand-500/10 border-brand-500/40 text-brand-400 font-bold"
                      : "bg-slate-950/20 border-slate-800/40 text-slate-300 hover:border-slate-700/60"
                  )}
                >
                  <button
                    onClick={() => handleSelectTopic(t.topic)}
                    className="flex-1 text-left flex flex-col gap-1 min-w-0"
                  >
                    <span className="w-full font-bold line-clamp-2 leading-snug">{t.topic}</span>
                    <span className="text-[9px] text-slate-500 font-semibold">{t.traffic}</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleImportTrend(t.topic)
                    }}
                    disabled={importingTrend}
                    className="hidden group-hover/trend:flex items-center gap-1 text-[9px] font-extrabold uppercase bg-brand-500 hover:bg-brand-400 text-slate-950 px-2 py-1 rounded transition-all shrink-0 shadow-sm"
                  >
                    <Sparkles size={10} className="fill-current" />
                    Gen
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Analysis & Footage Details */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Custom Search Form & Tone Setup */}
          <div className="space-y-4 bg-slate-900/50 border border-slate-800/80 p-4 rounded-xl backdrop-blur-md">
            <form onSubmit={handleCustomSubmit} className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="text"
                  placeholder="Enter any viral idea, trend topic, or news headline..."
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 transition-all font-semibold"
                />
              </div>
              <button
                type="submit"
                disabled={analyzing || !customTopic.trim()}
                className="btn-primary px-5 py-2 font-bold shadow-lg shadow-brand-500/25 disabled:opacity-50 shrink-0 text-sm"
              >
                {analyzing ? (
                  <>
                    <RefreshCw size={14} className="animate-spin mr-1.5" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    Analyze
                    <ArrowRight size={14} className="ml-1.5" />
                  </>
                )}
              </button>
            </form>

            {/* Script Tone Selectors */}
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/40">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Select AI Script Tone/Style</p>
              <div className="flex flex-wrap gap-2">
                {TONES.map((t) => {
                  const Icon = t.icon
                  const active = selectedTone === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTone(t.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all duration-200 hover:scale-[1.02]",
                        active
                          ? `${t.color} font-extrabold ring-1 ring-offset-1 ring-offset-slate-950 ring-brand-500/40`
                          : "bg-slate-950/40 border-slate-800/60 text-slate-400 hover:text-slate-200"
                      )}
                    >
                      <Icon size={12} />
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Analysis Loading View */}
          {analyzing && (
            <div className="card flex flex-col items-center py-24 bg-slate-900/20">
              <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
              <h3 className="mb-1 text-sm font-semibold text-slate-300">AI Trend Engineer Analyzing Topic</h3>
              <p className="text-xs text-slate-500">Creating custom scripts, hooks, growth metrics, and visual B-roll prompts...</p>
            </div>
          )}

          {!analyzing && !analysis && (
            <div className="card flex flex-col items-center py-32 bg-slate-900/10 border border-dashed border-slate-800">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-slate-600">
                <Sparkles size={24} />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-slate-400">Select a trend topic or search above</h3>
              <p className="text-xs text-slate-500 max-w-sm text-center">
                Let local AI create high-engagement script formats, viral hooks, tags, descriptions, and crawling parameters instantly.
              </p>
            </div>
          )}

          {analysis && (
            <div className="space-y-6">
              
              {/* Detailed Multi-Tab Dashboard */}
              <div className="relative group overflow-hidden rounded-xl border border-slate-800 bg-slate-900/30 p-5 backdrop-blur-md">
                
                {/* Header Information */}
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-4 mb-4">
                  <div>
                    <span className="badge-slate bg-brand-500/10 text-brand-400 border border-brand-500/20 text-[10px] font-bold uppercase tracking-wider mb-1.5 inline-block">
                      AI Blueprint ({TONES.find(t => t.id === selectedTone)?.label})
                    </span>
                    <h3 className="text-base font-extrabold text-white leading-tight">
                      {selectedTopic}
                    </h3>
                    <button
                      onClick={() => handleImportTrend(selectedTopic)}
                      disabled={importingTrend}
                      className="mt-3 flex items-center gap-1.5 text-xs font-bold bg-brand-500 hover:bg-brand-400 text-slate-950 px-3.5 py-1.5 rounded-lg transition-all shadow-md shadow-brand-500/25 disabled:opacity-50"
                    >
                      {importingTrend ? (
                        <>
                          <RefreshCw size={12} className="animate-spin" />
                          Generating Clips...
                        </>
                      ) : (
                        <>
                          <Sparkles size={12} className="fill-current" />
                          One-Click Auto-Generate Clips
                        </>
                      )}
                    </button>
                  </div>

                  {/* Viral Score Circular Badge */}
                  <div className="flex items-center gap-3 bg-slate-950/40 border border-slate-800/80 px-3 py-1.5 rounded-xl shrink-0">
                    <div className="relative h-12 w-12 flex items-center justify-center">
                      <svg className="absolute transform -rotate-90 w-full h-full">
                        <circle
                          cx="24"
                          cy="24"
                          r="20"
                          className="text-slate-800"
                          strokeWidth="3.5"
                          stroke="currentColor"
                          fill="transparent"
                        />
                        <circle
                          cx="24"
                          cy="24"
                          r="20"
                          className="text-brand-500"
                          strokeWidth="3.5"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="transparent"
                        />
                      </svg>
                      <span className="text-[10px] font-extrabold text-brand-400">
                        {Math.round(analysis.viral_potential * 100)}%
                      </span>
                    </div>
                    <div>
                      <p className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Viral Score</p>
                      <p className="text-xs font-bold text-white">Highly Shareable</p>
                    </div>
                  </div>
                </div>

                {/* AI Credibility & Quality Gate (Fact-Check report) */}
                {(validatingTopic || validationReport) && (
                  <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 mb-5 space-y-3.5">
                    <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                        <Sparkles size={14} className="text-brand-400" />
                        AI Credibility & Quality Assessment
                      </h4>
                      {validationReport && (
                        <span className={cn(
                          "text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider",
                          validationReport.is_valid 
                            ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/20"
                            : "bg-red-950/40 text-red-400 border-red-500/20"
                        )}>
                          {validationReport.is_valid ? "Highly Credible" : "Warning: Double Check"}
                        </span>
                      )}
                    </div>

                    {validatingTopic ? (
                      <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
                        <RefreshCw size={12} className="animate-spin text-brand-400" />
                        Running credibility analysis and fact-checking...
                      </div>
                    ) : validationReport ? (
                      <div className="space-y-3.5">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-2.5 text-center">
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Credibility</p>
                            <p className={cn(
                              "text-sm font-extrabold mt-1",
                              validationReport.credibility_score >= 0.7 ? "text-emerald-400" : validationReport.credibility_score >= 0.5 ? "text-amber-400" : "text-red-400"
                            )}>
                              {Math.round(validationReport.credibility_score * 100)}%
                            </p>
                          </div>
                          <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-2.5 text-center">
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Niche Fit</p>
                            <p className={cn(
                              "text-sm font-extrabold mt-1",
                              validationReport.niche_alignment >= 0.7 ? "text-purple-400" : validationReport.niche_alignment >= 0.5 ? "text-amber-400" : "text-red-400"
                            )}>
                              {Math.round(validationReport.niche_alignment * 100)}%
                            </p>
                          </div>
                          <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-2.5 text-center">
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Viral Power</p>
                            <p className={cn(
                              "text-sm font-extrabold mt-1",
                              validationReport.virality_score >= 0.7 ? "text-pink-400" : validationReport.virality_score >= 0.5 ? "text-amber-400" : "text-red-400"
                            )}>
                              {Math.round(validationReport.virality_score * 100)}%
                            </p>
                          </div>
                        </div>

                        <div className="text-xs space-y-1.5">
                          <p className="font-bold text-slate-400">Fact-Check Report:</p>
                          <p className="text-slate-300 bg-slate-950/40 border border-slate-800/40 rounded-lg p-3 leading-relaxed font-medium">
                            {validationReport.fact_check_report}
                          </p>
                        </div>

                        <div className="text-xs space-y-1.5">
                          <p className="font-bold text-slate-400">AI Assessment Verdict:</p>
                          <p className="text-slate-300 leading-relaxed font-medium">
                            {validationReport.reason}
                          </p>
                        </div>

                        {/* Virality breakdown & Claims verification grid */}
                        <div className="grid gap-4 md:grid-cols-2 pt-3 border-t border-slate-800/40">
                          {/* Left: Virality Score Breakdown */}
                          {validationReport.virality_breakdown && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                <Layers size={11} className="text-pink-400" />
                                Virality Breakdown Formula
                              </p>
                              <div className="space-y-2 bg-slate-950/40 p-3 rounded-lg border border-slate-800/40">
                                {Object.entries(validationReport.virality_breakdown).map(([key, val]: [string, any]) => {
                                  const pct = Math.round(val * 100)
                                  const name = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
                                  return (
                                    <div key={key} className="text-[10px]">
                                      <div className="flex justify-between font-semibold text-slate-400 mb-0.5">
                                        <span>{name}</span>
                                        <span className={cn(
                                          val >= 0.7 ? "text-emerald-400" : val >= 0.5 ? "text-amber-400" : "text-rose-400"
                                        )}>{pct}%</span>
                                      </div>
                                      <div className="w-full bg-slate-900 rounded-full h-1">
                                        <div 
                                          className={cn(
                                            "h-1 rounded-full",
                                            val >= 0.7 ? "bg-emerald-500" : val >= 0.5 ? "bg-amber-500" : "bg-rose-500"
                                          )} 
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* Right: Claims Inspector */}
                          {validationReport.claims && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                <Check size={11} className="text-emerald-400" />
                                Claims Fact-Checker
                              </p>
                              <div className="space-y-2">
                                {validationReport.claims.map((c: any, i: number) => (
                                  <div key={i} className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/40 text-[10px] space-y-1">
                                    <div className="flex justify-between items-center gap-2">
                                      <span className="font-extrabold text-slate-200 truncate">{c.claim}</span>
                                      <span className={cn(
                                        "text-[8px] px-1.5 py-0.5 rounded border font-bold uppercase shrink-0",
                                        c.status === "Verified" 
                                          ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/20" 
                                          : c.status === "Speculative"
                                          ? "bg-purple-950/40 text-purple-400 border-purple-500/20"
                                          : "bg-rose-950/40 text-rose-400 border-rose-500/20"
                                      )}>
                                        {c.status}
                                      </span>
                                    </div>
                                    <p className="text-slate-400 italic leading-snug">{c.verdict}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Dashboard Tabs Navigation */}
                <div className="flex gap-1 border-b border-slate-700 pb-2 mb-4 overflow-x-auto">
                  <button
                    onClick={() => setActiveTab("script")}
                    className={cn(
                      "text-xs font-bold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap",
                      activeTab === "script" ? "bg-brand-500/10 text-brand-400" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    Script Blueprint
                  </button>
                  <button
                    onClick={() => setActiveTab("strategy")}
                    className={cn(
                      "text-xs font-bold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap",
                      activeTab === "strategy" ? "bg-brand-500/10 text-brand-400" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    Growth Strategy
                  </button>
                  <button
                    onClick={() => setActiveTab("hooks")}
                    className={cn(
                      "text-xs font-bold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap",
                      activeTab === "hooks" ? "bg-brand-500/10 text-brand-400" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    Hook Variations
                  </button>
                  <button
                    onClick={() => setActiveTab("footage")}
                    className={cn(
                      "text-xs font-bold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap",
                      activeTab === "footage" ? "bg-brand-500/10 text-brand-400" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    Footage Finder ({videos.length})
                  </button>
                </div>

                {/* Tab: Script Outline */}
                {activeTab === "script" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Film size={12} /> Script Storyboard & Cues (Interactive Editor)
                      </p>
                      <button
                        onClick={() => copyToClipboard(`[Hook]\n${editedHook}\n\n[Body]\n${editedBody}\n\n[CTA]\n${editedCTA}`, "script")}
                        className="flex items-center gap-1.5 text-xs font-semibold text-brand-400 hover:text-brand-300 transition-all"
                      >
                        <Copy size={12} />
                        {copiedScript ? "Copied!" : "Copy Full Script"}
                      </button>
                    </div>

                    <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/60 space-y-4 max-h-[500px] overflow-y-auto">
                      <div>
                        <span className="text-[9px] font-extrabold tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded uppercase">Attention Hook (0-3s)</span>
                        <input
                          type="text"
                          value={editedHook}
                          onChange={(e) => setEditedHook(e.target.value)}
                          className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-sm font-extrabold text-white mt-1.5 focus:outline-none focus:ring-1 focus:ring-rose-500/50 focus:border-rose-500/60 transition-all"
                        />
                      </div>
                      
                      <div className="border-t border-slate-700 pt-3">
                        <span className="text-[9px] font-extrabold tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded uppercase">Script Body & B-Roll Cues</span>
                        <textarea
                          rows={6}
                          value={editedBody}
                          onChange={(e) => setEditedBody(e.target.value)}
                          className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 mt-2 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/60 transition-all font-mono leading-relaxed"
                          placeholder="Write your video script body here..."
                        />
                        <div className="text-[10px] text-slate-500 mt-1 font-semibold mb-3">
                          💡 Wrap B-roll/visual cues inside brackets like <code className="text-brand-400">[Visual: cue]</code> to colorize them.
                        </div>
                        <span className="text-[9px] font-extrabold tracking-wider text-slate-400 uppercase block mb-1">Live Storyboard Preview</span>
                        <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-medium border border-slate-800/40 bg-slate-950/20 p-3 rounded-lg max-h-[160px] overflow-y-auto">
                          {formatScriptBody(editedBody)}
                        </div>
                      </div>

                      <div className="border-t border-slate-700 pt-3">
                        <span className="text-[9px] font-extrabold tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded uppercase">Growth call to action</span>
                        <input
                          type="text"
                          value={editedCTA}
                          onChange={(e) => setEditedCTA(e.target.value)}
                          className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs font-bold text-emerald-400 mt-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/60 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab: Growth Strategy */}
                {activeTab === "strategy" && (
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <Layers size={12} className="text-brand-400" /> Viral Triggers
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {analysis.viral_triggers && analysis.viral_triggers.map((trigger, idx) => (
                            <span key={idx} className="text-[10px] font-bold px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                              {trigger}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <Users size={12} className="text-purple-400" /> Targeted Audience
                        </p>
                        <p className="text-xs text-slate-300 bg-slate-950/40 border border-slate-800/40 rounded-lg p-3 font-medium">
                          {analysis.target_audience}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <Music size={12} className="text-sky-400" /> AI Music Recommendation
                        </p>
                        <p className="text-xs text-slate-300 bg-slate-950/40 border border-slate-800/40 rounded-lg p-3 font-medium mb-3">
                          {analysis.audio_music_recommendation}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <Music size={12} className="text-brand-400" /> Soundtrack Vibes Shelf
                        </p>
                        <div className="bg-slate-950/40 border border-slate-800/40 rounded-lg p-3 space-y-2">
                          <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">
                            Choose background track theme:
                          </div>
                          <div className="space-y-1.5">
                            {MOCK_TRACKS.map((track) => (
                              <div
                                key={track.id}
                                className={cn(
                                  "flex items-center justify-between p-2 rounded-lg border text-[10px] transition-all cursor-pointer",
                                  selectedMusicId === track.id
                                    ? "bg-brand-500/10 border-brand-500/30 text-white"
                                    : "bg-slate-950/20 border-slate-900 text-slate-400 hover:border-slate-800"
                                )}
                                onClick={() => setSelectedMusicId(track.id)}
                              >
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setPlayingTrackId(playingTrackId === track.id ? null : track.id)
                                    }}
                                    className="px-1.5 py-0.5 rounded-md bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-300 flex items-center justify-center font-bold text-[8px]"
                                  >
                                    {playingTrackId === track.id ? "⏸" : "▶"}
                                  </button>
                                  <div>
                                    <div className="font-bold flex items-center gap-1.5">
                                      <span>{track.title}</span>
                                      <span className="text-[7px] bg-slate-800 border border-slate-700 px-1 py-0.1 rounded text-slate-500 font-semibold">{track.genre}</span>
                                    </div>
                                    <div className="text-[7px] text-slate-500 italic mt-0.5">{track.vibe}</div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500 font-mono text-[8px]">{track.duration}</span>
                                  {selectedMusicId === track.id && (
                                    <span className="text-brand-400 text-xs font-bold">✓</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <MessageSquare size={12} className="text-rose-400" /> Suggested Pin Comment (Engagement-Bait)
                        </p>
                        <div className="bg-slate-950/40 p-3.5 rounded-lg border border-slate-800/40 space-y-2">
                          <textarea
                            rows={3}
                            value={editedComment}
                            onChange={(e) => setEditedComment(e.target.value)}
                            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500/50 focus:border-rose-500/60 transition-all italic leading-relaxed"
                          />
                          <button
                            onClick={() => copyToClipboard(editedComment, "comment")}
                            className="flex items-center gap-1 text-[10px] font-bold text-brand-400 hover:text-brand-300 transition-all"
                          >
                            <Copy size={10} />
                            {copiedComment ? "Copied!" : "Copy Pinned Comment"}
                          </button>
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Viral Hashtags</p>
                        <div className="flex flex-wrap gap-1.5">
                          {analysis.hashtags.map((h, i) => (
                            <span key={i} className="text-[10px] font-semibold px-2.5 py-1 rounded-md bg-brand-900/10 border border-brand-800/20 text-brand-400">
                              #{h.replace("#", "")}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab: Hook Variations */}
                {activeTab === "hooks" && (
                  <div className="space-y-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles size={12} className="text-rose-400" /> A/B Hook Variations (Use for Large Centered Title overlays)
                    </p>
                    <div className="space-y-3">
                      {analysis.hook_variations && analysis.hook_variations.map((hook, idx) => (
                        <div 
                          key={idx} 
                          className="flex items-center justify-between gap-3 bg-slate-950/40 p-3.5 rounded-lg border border-slate-800/80 transition-all hover:border-slate-700"
                        >
                          <p className="text-xs font-bold text-slate-200">{hook}</p>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(hook)
                              setCopiedHookIdx(idx)
                              showToast("Hook variation copied to clipboard", "success")
                              setTimeout(() => setCopiedHookIdx(null), 2000)
                            }}
                            className="p-1.5 hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-200 transition-all shrink-0"
                          >
                            {copiedHookIdx === idx ? (
                              <Check size={12} className="text-emerald-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tab: Footage Finder (YouTube Crawler) */}
                {activeTab === "footage" && (
                  <div className="space-y-4">
                    
                    {/* Duration filter options */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-2.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Globe size={12} className="text-emerald-400" /> Web Crawler Source Clips
                      </p>
                      
                      <div className="flex gap-1 bg-slate-950/60 p-0.5 rounded-lg border border-slate-700">
                        {["all", "shorts", "long"].map((filter) => (
                          <button
                            key={filter}
                            onClick={() => handleVideoTypeChange(filter)}
                            className={cn(
                              "text-[9px] font-extrabold px-2.5 py-1 rounded uppercase transition-all",
                              videoType === filter ? "bg-slate-800 text-slate-200" : "text-slate-500 hover:text-slate-300"
                            )}
                          >
                            {filter === "all" ? "All Video" : filter === "shorts" ? "Shorts (<60s)" : "Long (>60s)"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Integrated Embedded YouTube Player */}
                    {activePreviewUrl && (
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 mb-2 space-y-2 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Play size={12} className="text-brand-400 animate-pulse" /> Footage Preview
                          </span>
                          <button
                            onClick={() => setActivePreviewUrl(null)}
                            className="text-[10px] font-extrabold text-rose-400 hover:text-rose-300 transition-all"
                          >
                            Close Preview
                          </button>
                        </div>
                        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-inner">
                          {getYouTubeId(activePreviewUrl) ? (
                            <iframe
                              src={`https://www.youtube.com/embed/${getYouTubeId(activePreviewUrl)}?autoplay=1`}
                              title="B-roll Footage Preview"
                              className="absolute inset-0 h-full w-full border-0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                              Preview not available for this URL format.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {crawling ? (
                      <div className="space-y-3">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="h-16 w-full bg-slate-800/20 animate-pulse rounded-xl" />
                        ))}
                      </div>
                    ) : videos.length === 0 ? (
                      <div className="card flex flex-col items-center py-12 bg-slate-900/10">
                        <p className="text-xs text-slate-500">No source videos found matching filter</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto pr-1">
                        {videos.map((vid, idx) => (
                          <div
                            key={idx}
                            className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-950/40 border border-slate-700 rounded-xl p-3.5 transition-all hover:bg-slate-950/70 hover:border-slate-700/60"
                          >
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-bold text-slate-100 truncate mb-1">
                                {vid.title}
                              </h4>
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-slate-500">
                                <span className="font-bold text-brand-400">{vid.uploader}</span>
                                <span>&middot;</span>
                                <span className="flex items-center gap-0.5"><Eye size={10} /> {formatViews(vid.view_count)}</span>
                                <span>&middot;</span>
                                <span className="flex items-center gap-0.5"><Clock size={10} /> {formatDuration(vid.duration)}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                              <button
                                onClick={() => setActivePreviewUrl(activePreviewUrl === vid.url ? null : vid.url)}
                                className={cn(
                                  "py-1.5 px-3 text-[10px] font-bold rounded-lg border transition-all shrink-0 w-1/2 md:w-auto",
                                  activePreviewUrl === vid.url
                                    ? "bg-rose-950/40 border-rose-500/30 text-rose-400"
                                    : "bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                                )}
                              >
                                {activePreviewUrl === vid.url ? "Hide Preview" : "Preview"}
                              </button>

                              <button
                                onClick={() => handleAutoGenerate(vid.url, vid.title)}
                                disabled={generatingId !== null}
                                className="btn-primary py-1.5 px-3 text-[10px] font-bold shrink-0 w-1/2 md:w-auto"
                              >
                                {generatingId === vid.url ? (
                                  <>
                                    <RefreshCw size={10} className="animate-spin mr-1.5" />
                                    Ingesting...
                                  </>
                                ) : (
                                  <>
                                    <Play size={10} className="mr-1.5 fill-current" />
                                    Auto-Generate
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  )
}
