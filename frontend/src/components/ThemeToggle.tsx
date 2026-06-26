"use client"

import { useTheme } from "next-themes"
import { useState, useEffect } from "react"
import { Sun, Moon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export function ThemeToggle({ showLabel = false, className }: { showLabel?: boolean; className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch by waiting until mounted on client
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className={cn("h-9 w-9 shrink-0", className)} />
  }

  const toggle = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  return (
    <Button
      variant="ghost"
      size={showLabel ? "sm" : "icon"}
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={cn("shrink-0", className)}
    >
      {theme === "dark" ? <Sun className="size-4 text-amber-400" /> : <Moon className="size-4" />}
      {showLabel && <span className="ml-1.5">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
    </Button>
  )
}
