"use client"

import { useEffect, useState, useRef } from "react"
import { useSelector } from "react-redux"
import { RootState } from "@/store/store"
import { AppSidebar } from "@/components/Sidebar"
import { AuthGate } from "@/components/AuthGate"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Loader2 } from "lucide-react"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"
import { usePathname } from "next/navigation"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { token, loading } = useSelector((s: RootState) => s.auth)
  const [mounted, setMounted] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)
  const { CheatSheet } = useKeyboardShortcuts()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [pathname])

  if (!mounted) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background" role="status" aria-label="Loading">
        <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
      </div>
    )
  }

  if (!token) return <AuthGate />

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 bg-background md:hidden">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm font-medium text-muted-foreground">ClipForge</span>
        </header>
        <main ref={mainRef} className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
        <CheatSheet />
      </SidebarInset>
    </SidebarProvider>
  )
}
