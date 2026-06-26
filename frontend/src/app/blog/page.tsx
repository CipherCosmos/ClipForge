import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { Card, CardContent } from "@/components/ui/card"
import { Calendar, ArrowRight } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Blog",
  description: "ClipForge blog — tips, updates, and guides for viral short creation.",
}

const posts = [
  { title: "Getting Started with ClipForge", date: "June 26, 2026", desc: "Learn how to upload your first video and generate viral clips in minutes.", slug: "getting-started" },
  { title: "Understanding the Viral Score", date: "June 25, 2026", desc: "A deep dive into the 8 dimensions of the viral score formula.", slug: "viral-score" },
  { title: "Multi-Language Dubbing Guide", date: "June 24, 2026", desc: "How to dub your clips into 40+ languages using local AI.", slug: "dubbing-guide" },
]

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted to-background">
      <Header />
      <main className="mx-auto max-w-4xl px-4 pt-32 pb-20 sm:px-6">
        <h1 className="text-4xl font-bold text-foreground">Blog</h1>
        <p className="mt-4 text-lg text-muted-foreground">Tips, updates, and guides for creating viral shorts.</p>

        <div className="mt-12 space-y-6">
          {posts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="block group">
              <Card className="transition-colors hover:bg-muted/50 cursor-pointer">
                <CardContent className="flex items-start justify-between gap-4 p-6">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground group-hover:text-brand-400 transition-colors">{post.title}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">{post.desc}</p>
                    <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5"><Calendar size={12} />{post.date}</p>
                  </div>
                  <ArrowRight size={20} className="shrink-0 text-muted-foreground group-hover:text-brand-400 transition-colors mt-1" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  )
}
