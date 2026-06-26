"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"

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
          className="rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl max-w-sm w-full mx-4 animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-bold text-white mb-4">Keyboard Shortcuts</h3>
          <div className="space-y-3">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.key} className="flex items-center justify-between">
                <span className="text-sm text-slate-300">{shortcut.description}</span>
                <kbd className="rounded-md bg-slate-800 px-2 py-1 text-xs font-mono text-slate-200 border border-slate-700 min-w-[28px] text-center">
                  {shortcut.label}
                </kbd>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowCheatSheet(false)}
            className="btn-primary w-full mt-6 py-2 text-sm"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return { showCheatSheet, setShowCheatSheet, CheatSheet }
}
