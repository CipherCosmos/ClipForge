"use client"

import { useState, useEffect, useRef } from "react"
import { useSelector } from "react-redux"
import { RootState } from "@/store/store"
import { Sidebar } from "@/components/Sidebar"
import { AuthGate } from "@/components/AuthGate"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"
import { usePathname } from "next/navigation"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { token, loading } = useSelector((s: RootState) => s.auth)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)
  const { CheatSheet } = useKeyboardShortcuts()

  useEffect(() => { setMounted(true) }, [])

  // Scroll to top on navigation
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [pathname])

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950" role="status" aria-label="Loading">
        <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
      </div>
    )
  }

  if (!token) return <AuthGate />

  return (
    <div className="flex min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 transition-colors duration-200">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <main ref={mainRef}
        className={cn(
          "flex-1 overflow-auto transition-all duration-300 pt-14 lg:pt-0",
          sidebarCollapsed ? "lg:ml-16" : "lg:ml-60"
        )}>
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
      <CheatSheet />
    </div>
  )
}
