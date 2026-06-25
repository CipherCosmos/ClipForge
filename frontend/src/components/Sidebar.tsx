"use client"

import { usePathname, useRouter } from "next/navigation"
import { useSelector, useDispatch } from "react-redux"
import { RootState, AppDispatch } from "@/store/store"
import { logout } from "@/store/authSlice"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, PlusCircle, LogOut, Sparkles, Menu, X
} from "lucide-react"
import { useState, useEffect } from "react"

const NAV_ITEMS = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/new", label: "New Project", icon: PlusCircle },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const dispatch = useDispatch<AppDispatch>()
  const { user } = useSelector((s: RootState) => s.auth)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const handleLogout = () => {
    dispatch(logout())
    router.push("/")
  }

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center justify-between border-b border-slate-800 px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 shadow-sm shadow-brand-500/20">
            <Sparkles size={16} className="text-white" />
          </div>
          {!collapsed && (
            <span className="text-base font-bold tracking-tight text-white">ClipForge</span>
          )}
        </div>
        <button
          onClick={onToggle}
          className="hidden rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 lg:block"
        >
          <Menu size={16} />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-brand-500/10 text-brand-400"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={18} className="shrink-0" />
              {!collapsed && item.label}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-slate-800 px-3 py-4">
        {!collapsed && user && (
          <div className="mb-2 truncate px-3 text-xs text-slate-500">{user.email}</div>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-all duration-200 hover:bg-red-900/20 hover:text-red-400"
          title={collapsed ? "Logout" : undefined}
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && "Logout"}
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-slate-800 bg-surface transition-all duration-300 lg:flex",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile header + drawer */}
      <div className="fixed left-0 top-0 z-50 flex h-14 w-full items-center border-b border-slate-800 bg-surface px-4 lg:hidden">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="mr-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600">
            <Sparkles size={14} className="text-white" />
          </div>
          <span className="text-sm font-bold text-white">ClipForge</span>
        </div>
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen w-60 flex-col border-r border-slate-800 bg-surface transition-transform duration-300 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
