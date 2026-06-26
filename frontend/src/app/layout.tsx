import type { Metadata, Viewport } from "next"
import "./globals.css"
import { ReduxProvider } from "@/store/provider"
import { AuthInitializer } from "@/components/AuthInitializer"
import { ErrorBoundary } from "@/components/ErrorBoundary"

export const metadata: Metadata = {
  title: {
    default: "ClipForge — AI Viral Short Creator",
    template: "%s — ClipForge",
  },
  description: "AI-powered short-form video creator. Upload a video or paste a URL and get auto-generated viral clips optimized for any platform.",
  keywords: ["video", "shorts", "viral", "AI", "clip creator", "video editor", "auto clip"],
  authors: [{ name: "ClipForge" }],
  robots: { index: true, follow: true },
  openGraph: {
    title: "ClipForge — AI Viral Short Creator",
    description: "Turn any video into viral shorts with AI-powered auto-clipping.",
    siteName: "ClipForge",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ClipForge — AI Viral Short Creator",
    description: "Turn any video into viral shorts with AI-powered auto-clipping.",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-surface" role="application" aria-label="ClipForge application">
        <ReduxProvider>
          <AuthInitializer />
          <ErrorBoundary>{children}</ErrorBoundary>
        </ReduxProvider>
      </body>
    </html>
  )
}
