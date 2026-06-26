import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { Card, CardContent } from "@/components/ui/card"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "ClipForge privacy policy — how we handle your data.",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted to-background">
      <Header />
      <main className="mx-auto max-w-4xl px-4 pt-32 pb-20 sm:px-6">
        <h1 className="text-4xl font-bold text-foreground">Privacy Policy</h1>
        <p className="text-muted-foreground mt-2">Last updated: June 2026</p>

        <Card className="mt-8">
          <CardContent className="space-y-6 text-muted-foreground leading-relaxed p-6">
            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8">Data Processing</h2>
              <p>ClipForge processes all video data locally on your machine. No video content or transcripts are sent to external servers unless you explicitly publish to a social platform.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8">What We Store</h2>
              <p>We store minimal account data: email address, hashed password, and platform preferences. Your videos, clips, and transcript data are stored in your local database and object storage.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8">Third-Party Services</h2>
              <p>When you publish to YouTube, TikTok, or other platforms, your video is uploaded directly to that platform using your provided API credentials. These credentials are encrypted at rest.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8">Data Deletion</h2>
              <p>You can delete your account and all associated data at any time through your account settings. Deletion is permanent and irreversible.</p>
            </section>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  )
}
