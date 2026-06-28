"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

interface Shortcut {
  key: string
  label: string
  description: string
}

const SHORTCUTS: Shortcut[] = [
  { key: "N", label: "N", description: "New Project" },
  { key: "D", label: "D", description: "Dashboard" },
  { key: "S", label: "S", description: "Settings" },
  { key: "Escape", label: "Esc", description: "Go Back" },
  { key: "?", label: "?", description: "Show shortcuts" },
]

export function useKeyboardShortcuts() {
  const router = useRouter()
  const [showCheatSheet, setShowCheatSheet] = useState(false)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) {
      return
    }

    switch (e.key) {
      case "n":
      case "N":
        e.preventDefault()
        router.push("/app/new")
        break
      case "d":
      case "D":
        e.preventDefault()
        router.push("/app")
        break
      case "s":
      case "S":
        e.preventDefault()
        router.push("/app/settings")
        break
      case "Escape":
        router.back()
        break
      case "?":
        e.preventDefault()
        setShowCheatSheet((prev) => !prev)
        break
    }
  }, [router])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  const CheatSheet = () => {
    if (!showCheatSheet) return null
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={() => setShowCheatSheet(false)}
      >
        <div
          className="rounded-xl border border-border bg-card p-6 shadow-2xl max-w-sm w-full mx-4 animate-scale-in text-card-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-bold text-foreground mb-4">Keyboard Shortcuts</h3>
          <div className="space-y-3">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.key} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{shortcut.description}</span>
                <kbd className="rounded-md bg-muted px-2 py-1 text-xs font-mono text-foreground border border-border min-w-[28px] text-center">
                  {shortcut.label}
                </kbd>
              </div>
            ))}
          </div>
          <Button
            onClick={() => setShowCheatSheet(false)}
            className="w-full mt-6 h-10 text-sm"
          >
            Close
          </Button>
        </div>
      </div>
    )
  }

  return { showCheatSheet, setShowCheatSheet, CheatSheet }
}
