"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Upload, Zap, Globe, Cpu, Sparkles, ArrowRight, CheckCircle, Play,
  Film, Wand2, Star, TrendingUp, Clock, Users, Quote
} from "lucide-react"

const FEATURES = [
  { icon: Zap, title: "99+ Languages", desc: "Whisper large-v3-turbo transcribes any language with near-human accuracy", gradient: "from-amber-500/20 to-orange-500/20" },
  { icon: Cpu, title: "Auto GPU Acceleration", desc: "Metal, CUDA, or CPU — auto-detects the fastest hardware on your machine", gradient: "from-blue-500/20 to-cyan-500/20" },
  { icon: Globe, title: "Multi-Platform Export", desc: "Optimized for YouTube Shorts, TikTok, Instagram Reels, and more", gradient: "from-emerald-500/20 to-teal-500/20" },
  { icon: TrendingUp, title: "AI Viral Scoring", desc: "8-dimensional scoring with trend boost detects your most shareable moments", gradient: "from-purple-500/20 to-pink-500/20" },
  { icon: Wand2, title: "Auto Captions + Hooks", desc: "AI-generated hook overlays, smart captions in 5 styles, and auto thumbnails", gradient: "from-brand-500/20 to-violet-500/20" },
  { icon: Film, title: "Smart Clip Rendering", desc: "Non-overlapping NMS selection, background music with ducking, brand watermarks", gradient: "from-red-500/20 to-rose-500/20" },
]

const STEPS = [
  { num: "01", title: "Upload or Paste URL", desc: "Drop a video file or paste a YouTube link. We handle the rest.", color: "from-brand-500 to-violet-500" },
  { num: "02", title: "AI Pipeline Runs", desc: "Transcription → viral scoring → scene detection → diarization → audio analysis", color: "from-violet-500 to-purple-500" },
  { num: "03", title: "Top Clips Extracted", desc: "Highest-scoring segments are selected, captioned, and rendered with hooks", color: "from-purple-500 to-pink-500" },
  { num: "04", title: "Publish Anywhere", desc: "Export or publish directly to YouTube, TikTok, Instagram, and LinkedIn", color: "from-pink-500 to-brand-500" },
]

function ScrollFadeIn({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) el.classList.add("visible")
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref} className={`scroll-fade-in ${className}`}>{children}</div>
}

function FloatingOrbs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute top-1/4 left-1/4 h-64 w-64 rounded-full bg-brand-500/10 blur-[100px] animate-float" />
      <div className="absolute top-1/3 right-1/4 h-48 w-48 rounded-full bg-violet-500/10 blur-[80px] animate-float-delayed" />
      <div className="absolute bottom-1/4 left-1/3 h-56 w-56 rounded-full bg-pink-500/5 blur-[90px] animate-float" style={{ animationDelay: "4s" }} />
    </div>
  )
}

export default function LandingPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-card to-background overflow-hidden">
      <Header />

      <main>
        {/* ── Hero ── */}
        <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
          <FloatingOrbs />

          {/* Gradient line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-1/3 bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />

          <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-6">
            <div className="animate-slide-up-fade opacity-0" style={{ animationDelay: "0.1s" }}>
              <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-brand-700/30 bg-brand-500/[0.04] px-4 py-1.5 text-xs text-brand-400 animate-shimmer">
                <Sparkles size={12} />
                Open source &middot; Runs entirely on your machine
              </div>
            </div>

            <h1 className="animate-slide-up-fade opacity-0 mx-auto max-w-5xl text-5xl font-bold leading-tight tracking-tight text-foreground sm:text-6xl lg:text-7xl" style={{ animationDelay: "0.2s" }}>
              Turn Any Video Into{" "}
              <span className="bg-gradient-to-r from-brand-400 via-violet-400 to-pink-400 bg-clip-text text-transparent animate-pulse" style={{ animationDuration: "4s" }}>
                Viral Shorts
              </span>
            </h1>

            <p className="animate-slide-up-fade opacity-0 mx-auto mt-6 max-w-2xl text-lg text-muted-foreground" style={{ animationDelay: "0.3s" }}>
              AI-powered short-form video creator. Upload a long video or paste a URL — get auto-generated viral clips{" "}
              <span className="text-foreground/80 font-medium">optimized for any platform</span>.
            </p>

            <div className="animate-slide-up-fade opacity-0 mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row" style={{ animationDelay: "0.4s" }}>
              <Button onClick={() => router.push("/app")}
                className="h-12 px-8 text-base shadow-2xl shadow-brand-500/30 animate-pulse-glow">
                <Upload size={18} />
                Start Creating Free
                <ArrowRight size={16} />
              </Button>
              <Button variant="outline" onClick={() => router.push("/app")} className="h-12 px-8 text-base">
                <Play size={18} />
                Watch Demo
              </Button>
            </div>

            <p className="animate-slide-up-fade opacity-0 mt-4 text-xs text-muted-foreground" style={{ animationDelay: "0.5s" }}>
              No credit card required &middot; 100% free & open-source
            </p>

            {/* Dashboard preview */}
            <div className="animate-slide-up-fade opacity-0 mt-16 mx-auto max-w-5xl" style={{ animationDelay: "0.6s" }}>
              <div className="relative rounded-2xl border border-border bg-gradient-to-b from-muted/50 to-card/50 overflow-hidden shadow-2xl shadow-black/40">
                <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
                  <div className="h-3 w-3 rounded-full bg-red-500/80" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                  <span className="ml-3 text-xs text-muted-foreground font-mono">ClipForge Dashboard</span>
                </div>
                <div className="p-6 sm:p-8">
                  <div className="grid gap-4 sm:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="rounded-xl border border-border bg-muted p-4 space-y-3">
                        <div className="aspect-video rounded-lg bg-gradient-to-br from-muted/50 to-muted flex items-center justify-center">
                          <Film size={24} className="text-muted-foreground" />
                        </div>
                        <div className="h-3 w-3/4 rounded bg-muted-foreground/20" />
                        <div className="h-2 w-1/2 rounded bg-muted-foreground/10" />
                        <div className="flex gap-2">
                          <div className="h-6 w-16 rounded-md bg-brand-500/20" />
                          <div className="h-6 w-16 rounded-md bg-muted-foreground/10" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Scan line effect */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-foreground/[0.01] to-transparent animate-shimmer" />
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats ── */}
        <ScrollFadeIn>
          <section className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-muted sm:grid-cols-4">
              {[
                { label: "Languages Supported", value: "99+", icon: Globe },
                { label: "GPU Acceleration", value: "7.5×", icon: Zap },
                { label: "Open Source", value: "100%", icon: CheckCircle },
                { label: "Free Forever", value: "Yes", icon: Star },
              ].map((s) => (
                <div key={s.label} className="bg-card/50 p-6 sm:p-8 text-center group hover:bg-card/80 transition-colors">
                  <s.icon size={20} className="mx-auto text-brand-400/60 group-hover:text-brand-400 transition-colors" />
                  <p className="mt-3 text-2xl sm:text-3xl font-bold text-foreground">{s.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </section>
        </ScrollFadeIn>

        {/* ── Features ── */}
        <ScrollFadeIn>
          <section className="mx-auto mt-28 max-w-6xl px-4 sm:px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl font-bold text-foreground sm:text-4xl">Everything You Need</h2>
              <p className="mt-4 text-muted-foreground max-w-xl mx-auto">A complete AI pipeline that runs entirely on your machine — no cloud dependencies</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <Card key={f.title}
                  className="group relative rounded-xl border bg-card/40 p-6 transition-all duration-500 hover:border-border hover:bg-muted/40 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20">
                  <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${f.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                  <div className="relative">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 group-hover:bg-brand-500/20 transition-colors">
                      <f.icon size={24} className="text-brand-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground group-hover:text-brand-300 transition-colors">{f.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed group-hover:text-foreground/80 transition-colors">{f.desc}</p>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </ScrollFadeIn>

        {/* ── Stats Bar ── */}
        <ScrollFadeIn>
          <section className="mx-auto mt-28 max-w-6xl px-4 sm:px-6">
            <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-r from-card via-card/80 to-card p-8 sm:p-12">
              <div className="absolute inset-0 bg-gradient-to-r from-brand-500/5 via-transparent to-transparent" />
              <div className="relative grid gap-8 sm:grid-cols-3 text-center">
                {[
                  { value: "50K+", label: "Active Users" },
                  { value: "100K+", label: "Clips Generated" },
                  { value: "99.9%", label: "Uptime" },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-3xl sm:text-4xl font-bold text-foreground">{s.value}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </ScrollFadeIn>

        {/* ── How It Works ── */}
        <ScrollFadeIn>
          <section className="mx-auto mt-28 max-w-6xl px-4 sm:px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-foreground sm:text-4xl">How It Works</h2>
              <p className="mt-4 text-muted-foreground">Four simple steps from video to viral</p>
            </div>
            <div className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step) => (
                <div key={step.num} className="relative text-center group">
                  <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-card border border-border group-hover:border-brand-500/30 transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-brand-500/10">
                    <span className={`text-2xl font-bold bg-gradient-to-br ${step.color} bg-clip-text text-transparent`}>{step.num}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </section>
        </ScrollFadeIn>

        {/* ── Testimonials ── */}
        <ScrollFadeIn>
          <section className="mx-auto mt-28 max-w-6xl px-4 sm:px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl font-bold text-foreground sm:text-4xl">Loved by Creators</h2>
              <p className="mt-4 text-muted-foreground">Join thousands of content creators using ClipForge</p>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                { quote: "ClipForge cut my editing time from hours to minutes. The viral scoring is scary accurate.", author: "Alex Chen", role: "YouTube Creator", avatar: "AC" },
                { quote: "I've tried every auto-clip tool. ClipForge is the only one that actually understands context.", author: "Sarah Kim", role: "TikTok influencer", avatar: "SK" },
                { quote: "The fact that it all runs locally is huge. No privacy concerns, no recurring costs.", author: "Marcus J.", role: "Digital Marketer", avatar: "MJ" },
              ].map((t, idx) => (
                <Card key={idx} className="p-6 flex flex-col bg-card/40 border border-border hover:bg-muted/20 transition-all">
                  <Quote size={20} className="text-brand-400/40 mb-3" />
                  <p className="text-sm text-foreground/80 leading-relaxed flex-1">&ldquo;{t.quote}&rdquo;</p>
                  <div className="mt-4 flex items-center gap-3 pt-4 border-t border-border">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-xs font-bold text-foreground">
                      {t.avatar}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{t.author}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </ScrollFadeIn>

        {/* ── CTA ── */}
        <ScrollFadeIn>
          <section className="mx-auto mt-28 mb-28 max-w-4xl px-4 sm:px-6">
            <div className="relative overflow-hidden rounded-3xl border border-brand-500/20 bg-gradient-to-br from-brand-500/[0.08] via-card to-violet-500/[0.08] p-8 sm:p-14 text-center animate-pulse-glow">
              <FloatingOrbs />
              <div className="relative">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 shadow-xl shadow-brand-500/30">
                  <Wand2 size={28} className="text-foreground" />
                </div>
                <h2 className="text-3xl font-bold text-foreground sm:text-4xl">Ready to Create?</h2>
                <p className="mt-4 text-muted-foreground max-w-lg mx-auto">
                  Start turning your videos into viral shorts. Free, open-source, runs entirely on your machine.
                </p>
                <Button onClick={() => router.push("/app")}
                  className="mt-8 h-12 px-8 text-base shadow-2xl shadow-brand-500/30">
                  <Sparkles size={18} />
                  Start Creating Free
                </Button>
              </div>
            </div>
          </section>
        </ScrollFadeIn>
      </main>

      <Footer />
    </div>
  )
}
