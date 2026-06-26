"use client"

import { useState, useEffect } from "react"
import { useSelector } from "react-redux"
import { RootState } from "@/store/store"
import { Sidebar } from "@/components/Sidebar"
import { AuthGate } from "@/components/AuthGate"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { token, loading } = useSelector((s: RootState) => s.auth)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { CheatSheet } = useKeyboardShortcuts()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
      </div>
    )
  }

  if (!token) return <AuthGate />

  return (
    <div className="flex min-h-screen bg-white dark:bg-surface transition-colors duration-200">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <main
        className={cn(
          "flex-1 overflow-auto transition-all duration-300 pt-14 lg:pt-0",
          sidebarCollapsed ? "lg:ml-16" : "lg:ml-60"
        )}
      >
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
      <CheatSheet />
    </div>
  )
}
