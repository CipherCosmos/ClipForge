import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { Card, CardContent } from "@/components/ui/card"
import { Sparkles, Github, Globe, Cpu } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "About",
  description: "About ClipForge — the open-source AI-powered viral short creator.",
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-card to-background">
      <Header />
      <main className="mx-auto max-w-4xl px-4 pt-32 pb-20 sm:px-6">
        <h1 className="text-4xl font-bold text-foreground">About ClipForge</h1>
        <p className="mt-4 text-lg text-muted-foreground">AI-powered short-form video creation, free and open-source.</p>

        <div className="mt-12 space-y-8">
          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><Sparkles size={20} className="text-brand-400" /> Our Mission</h2>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                ClipForge makes video creation accessible to everyone. Upload a long video or paste a URL, and our AI pipeline automatically
                transcribes, scores for virality, detects scenes, and renders optimized clips for any short-form platform.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><Cpu size={20} className="text-brand-400" /> Technology</h2>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Built with Whisper ASR for transcription (99+ languages), local LLMs via Ollama for viral scoring, PySceneDetect for scene analysis,
                and FFmpeg for rendering. Everything runs on your hardware — no cloud dependencies, no data leaks, no API costs.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><Github size={20} className="text-brand-400" /> Open Source</h2>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                ClipForge is 100% open source under the MIT license. You can inspect, modify, and deploy it yourself.
                No hidden telemetry, no watermark locks, no paid tiers — the full pipeline is yours.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  )
}
