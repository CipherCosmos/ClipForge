import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { CheckCircle, Sparkles } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Pricing",
  description: "ClipForge is free and open-source. No paid plans, no watermarks, no limits.",
}

const freeFeatures = [
  "Unlimited video imports",
  "99+ language transcription",
  "AI viral scoring",
  "Auto scene detection",
  "Multi-platform export",
  "Custom branding",
  "All future features",
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <div>
        <Header />
        <main className="mx-auto max-w-5xl px-4 pt-32 pb-20 sm:px-6">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-foreground">Free & Open Source</h1>
            <p className="mt-4 text-lg text-muted-foreground">No paid plans. No watermarks. No limits. Ever.</p>
          </div>

          <div className="mt-12 mx-auto max-w-md">
            <Card className="p-8 text-center relative overflow-hidden border bg-card shadow-lg">
              <div className="pointer-events-none absolute -top-20 -right-20 h-40 w-40 rounded-full bg-primary/10 blur-[60px]" />
              <div className="relative">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/20">
                  <Sparkles size={28} className="text-white" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">Free Forever</h2>
                <p className="mt-2 text-5xl font-bold text-foreground">$0</p>
                <p className="mt-1 text-sm text-muted-foreground">per month</p>
                <ul className="mt-8 space-y-3 text-left">
                  {freeFeatures.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm text-foreground/80">
                      <CheckCircle size={16} className="text-emerald-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/app" className={buttonVariants({ className: "mt-8 w-full h-10" })}>
                  Get Started Free
                </Link>
              </div>
            </Card>
          </div>
        </main>
      </div>
      <Footer />
    </div>
  )
}
