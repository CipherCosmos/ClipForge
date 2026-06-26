import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Mail, Github, MessageSquare, Send } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the ClipForge team.",
}

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-card to-background">
      <Header />
      <main className="mx-auto max-w-4xl px-4 pt-32 pb-20 sm:px-6">
        <h1 className="text-4xl font-bold text-foreground">Contact Us</h1>
        <p className="mt-4 text-lg text-muted-foreground">Have questions or feedback? We&apos;d love to hear from you.</p>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          <a href="https://github.com/anomalyco/ClipForge/issues" target="_blank" rel="noopener noreferrer"
            className="block">
            <Card className="h-full">
              <CardContent className="p-6 flex flex-col items-center text-center">
                <Github size={32} className="text-brand-400" />
                <h3 className="mt-4 text-lg font-semibold text-foreground">GitHub Issues</h3>
                <p className="mt-2 text-sm text-muted-foreground">Report bugs or request features</p>
              </CardContent>
            </Card>
          </a>
          <a href="mailto:support@clipforge.app"
            className="block">
            <Card className="h-full">
              <CardContent className="p-6 flex flex-col items-center text-center">
                <Mail size={32} className="text-brand-400" />
                <h3 className="mt-4 text-lg font-semibold text-foreground">Email</h3>
                <p className="mt-2 text-sm text-muted-foreground">support@clipforge.app</p>
              </CardContent>
            </Card>
          </a>
          <a href="https://github.com/anomalyco/ClipForge/discussions" target="_blank" rel="noopener noreferrer"
            className="block">
            <Card className="h-full">
              <CardContent className="p-6 flex flex-col items-center text-center">
                <MessageSquare size={32} className="text-brand-400" />
                <h3 className="mt-4 text-lg font-semibold text-foreground">Discussions</h3>
                <p className="mt-2 text-sm text-muted-foreground">Join the community</p>
              </CardContent>
            </Card>
          </a>
        </div>

        <div className="mt-12 mx-auto max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle>Send us a message</CardTitle>
              <CardDescription>We&apos;ll get back to you within 24 hours.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" placeholder="Your name" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" placeholder="Your message..." rows={4} />
              </div>
              <Button className="w-full"><Send size={16} className="mr-2" /> Send Message</Button>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  )
}
