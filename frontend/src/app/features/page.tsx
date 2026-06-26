import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { Card, CardContent } from "@/components/ui/card"
import { Mic, Brain, Video, Music, Globe, Shield, Sparkles, Cpu, Zap, Languages, Wand2, Share2 } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Features",
  description: "Explore all features of ClipForge — AI-powered viral short creator.",
}

const features = [
  { icon: Mic, title: "99+ Language Transcription", desc: "Whisper large-v3-turbo transcribes audio in any language. Supports Groq Cloud for fast API inference or local Whisper for privacy." },
  { icon: Brain, title: "AI Viral Scoring", desc: "Each segment is scored across 8 dimensions (hook, emotion, engagement, keywords, scene changes, audio events, energy, speaker clarity) using local LLMs." },
  { icon: Video, title: "Smart Scene Detection", desc: "PySceneDetect with ContentDetector + AdaptiveDetector identifies hard cuts and fades. Downscaled to 480p@5fps for blazing-fast analysis." },
  { icon: Music, title: "Audio Ducking + Music", desc: "Automatically reduces background music during speech segments. Built-in backing tracks and Pixabay music search." },
  { icon: Globe, title: "Multi-Platform Export", desc: "Optimized presets for YouTube Shorts, TikTok, Instagram Reels, Facebook Reels, X/Twitter Video, and custom formats." },
  { icon: Languages, title: "AI Voice Dubbing", desc: "Translate and dub clips into 40+ languages using local Argos Translate + Edge TTS. No API keys required." },
  { icon: Shield, title: "Content Moderation", desc: "Automatic NSFW image detection and profanity filtering. Flagged clips are skipped with a warning." },
  { icon: Wand2, title: "Auto Thumbnails + Hooks", desc: "AI generates punchy hook text overlays and selects the best thumbnail frame using face detection + sharpness scoring." },
  { icon: Share2, title: "One-Click Publishing", desc: "Publish directly to YouTube Shorts, TikTok, Instagram, and LinkedIn. Schedule posts for later. Full publish history tracking." },
]

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-card to-background">
      <Header />
      <main className="mx-auto max-w-6xl px-4 pt-32 pb-20 sm:px-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground">All Features</h1>
          <p className="mt-4 text-lg text-muted-foreground">Everything you need to create viral shorts, powered by AI.</p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title}>
              <CardContent className="p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10">
                  <f.icon size={24} className="text-brand-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  )
}
