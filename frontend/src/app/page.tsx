"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Upload, Link2, Sparkles, ArrowRight, Globe, Zap, Cpu, Rocket } from "lucide-react"

const FEATURES = [
  { icon: Globe, label: "99+ Languages", desc: "Whisper large-v3-turbo ASR" },
  { icon: Cpu, label: "Metal GPU Acceleration", desc: "7.5x Real-time Inference" },
  { icon: Rocket, label: "Parallel AI Pipeline", desc: "Concurrent NLP & Scene Detect" },
  { icon: Zap, label: "One-Click Export", desc: "Optimized for all platforms" },
]

const FOOTER_LINKS = [
  { href: "https://github.com/anomalyco/ClipForge", label: "GitHub" },
  { href: "https://opencode.ai", label: "Documentation" },
]

export default function LandingPage() {
  const router = useRouter()
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [url, setUrl] = useState("")
  const [platform, setPlatform] = useState("youtube_shorts")

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (url.trim()) router.push(`/app/new?url=${encodeURIComponent(url.trim())}&platform=${platform}`)
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-surface overflow-hidden">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-brand-500/5 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-violet-500/5 blur-[120px]" />
      </div>

      <header className="relative z-10 flex items-center justify-between border-b border-slate-800/50 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600">
            <Sparkles size={16} className="text-white" />
          </div>
          <span className="text-lg font-bold text-white">ClipForge</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/app")}
            className="btn-secondary text-xs"
          >
            Sign In
          </button>
          <button
            onClick={() => router.push("/app")}
            className="btn-primary text-xs"
          >
            Get Started
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="animate-fade-in mb-8 inline-flex items-center gap-2 rounded-full border border-brand-700/30 bg-brand-500/5 px-4 py-1.5 text-xs text-brand-400">
          <Sparkles size={12} />
          Open source &middot; Runs entirely on your machine
        </div>

        <h1 className="animate-slide-up max-w-4xl text-5xl font-bold leading-tight tracking-tight text-white sm:text-6xl lg:text-7xl">
          Turn Any Video Into{" "}
          <span className="bg-gradient-to-r from-brand-400 to-violet-400 bg-clip-text text-transparent">
            Viral Shorts
          </span>
        </h1>
        <p className="animate-slide-up mt-6 max-w-xl text-lg text-slate-400">
          AI-powered short-form video creator. Upload a long video or paste a URL, and get auto-generated viral clips optimized for any platform.
        </p>

        <div className="animate-slide-up mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <button
            onClick={() => router.push("/app")}
            className="btn-primary h-12 px-8 text-base"
          >
            <Upload size={18} />
            Upload Video
            <ArrowRight size={16} />
          </button>
          <button
            onClick={() => setShowUrlInput(!showUrlInput)}
            className="btn-secondary h-12 px-8 text-base"
          >
            <Link2 size={18} />
            Paste Link
          </button>
        </div>

        {showUrlInput && (
          <form onSubmit={handleUrlSubmit} className="animate-slide-up mt-6 w-full max-w-lg space-y-3">
            <input
              type="url"
              placeholder="Paste YouTube or video URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="input"
              autoFocus
            />
            <div className="flex gap-3">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="input flex-1"
              >
                <option value="youtube_shorts">YouTube Shorts</option>
                <option value="instagram_reels">Instagram Reels</option>
                <option value="tiktok">TikTok</option>
                <option value="facebook_reels">Facebook Reels</option>
                <option value="twitter_video">X/Twitter Video</option>
                <option value="landscape">Landscape 16:9</option>
                <option value="square">Square 1:1</option>
              </select>
              <button
                type="submit"
                disabled={!url.trim()}
                className="btn-primary"
              >
                Go
              </button>
            </div>
          </form>
        )}

        <div className="animate-fade-in mt-16 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.label} className="card flex items-center gap-4 px-5 py-4 text-left">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10">
                <f.icon size={18} className="text-brand-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">{f.label}</p>
                <p className="text-xs text-slate-500">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="relative z-10 border-t border-slate-800/50 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <p className="text-xs text-slate-600">
            Free &amp; open-source &middot; No cloud dependencies
          </p>
          <div className="flex items-center gap-4">
            {FOOTER_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-500 transition hover:text-slate-300"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
