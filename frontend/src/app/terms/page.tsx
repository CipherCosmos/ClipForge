import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { Card, CardContent } from "@/components/ui/card"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "ClipForge terms of service.",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted to-background">
      <Header />
      <main className="mx-auto max-w-4xl px-4 pt-32 pb-20 sm:px-6">
        <h1 className="text-4xl font-bold text-foreground">Terms of Service</h1>
        <p className="text-muted-foreground mt-2">Last updated: June 2026</p>

        <Card className="mt-8">
          <CardContent className="space-y-6 text-muted-foreground leading-relaxed p-6">
            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8">License</h2>
              <p>ClipForge is open-source software released under the MIT License. You are free to use, modify, and distribute it in accordance with the license terms.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8">Use of Service</h2>
              <p>You agree to use ClipForge in compliance with all applicable laws and regulations. You are solely responsible for the content you create and publish using this software.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-foreground mt-8">Disclaimer</h2>
              <p>ClipForge is provided &quot;as is&quot; without warranty of any kind. The authors are not liable for any damages arising from the use of this software.</p>
            </section>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  )
}
