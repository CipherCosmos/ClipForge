import type { Metadata } from "next"
import "./globals.css"
import { ReduxProvider } from "@/store/provider"
import { AuthInitializer } from "@/components/AuthInitializer"
import { ErrorBoundary } from "@/components/ErrorBoundary"

export const metadata: Metadata = {
  title: "ClipForge — Viral Short Creator",
  description: "AI-powered short-form video creation",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <ReduxProvider>
          <AuthInitializer />
          <ErrorBoundary>{children}</ErrorBoundary>
        </ReduxProvider>
      </body>
    </html>
  )
}
