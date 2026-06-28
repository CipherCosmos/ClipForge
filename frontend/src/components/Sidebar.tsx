"use client"

import { usePathname, useRouter } from "next/navigation"
import { useSelector, useDispatch } from "react-redux"
import { RootState, AppDispatch } from "@/store/store"
import { logout } from "@/store/authSlice"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, PlusCircle, LogOut, Sparkles, Search,
  Key, Settings, Calendar, CreditCard, Send, ChevronLeft
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/ThemeToggle"

const NAV_GROUPS = [
  {
    title: "Workspace",
    items: [
      { href: "/app", label: "Dashboard", icon: LayoutDashboard },
      { href: "/app/new", label: "New Project", icon: PlusCircle },
      { href: "/app/research", label: "Research & Trends", icon: Search },
    ]
  },
  {
    title: "Production",
    items: [
      { href: "/app/schedule", label: "Schedule", icon: Calendar },
      { href: "/app/publish", label: "Publish", icon: Send },
    ]
  },
  {
    title: "Management",
    items: [
      { href: "/app/billing", label: "Billing", icon: CreditCard },
      { href: "/app/keys", label: "API Keys", icon: Key },
      { href: "/app/settings", label: "Settings", icon: Settings },
    ]
  }
]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const dispatch = useDispatch<AppDispatch>()
  const { user } = useSelector((s: RootState) => s.auth)
  const { state, toggleSidebar } = useSidebar()
  const collapsed = state === "collapsed"

  const handleLogout = () => {
    dispatch(logout())
    router.push("/")
  }

  return (
    <Sidebar 
      collapsible="icon" 
      className="border-r border-sidebar-border bg-gradient-to-b from-background via-background/95 to-background/90 dark:from-slate-950 dark:via-slate-950/90 dark:to-slate-900/85 backdrop-blur-xl"
    >
      <SidebarHeader className="border-b border-border/40 py-4 px-3 bg-muted/[0.03] dark:bg-slate-950/10">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => router.push("/app")} size="lg" className="hover:bg-transparent px-2">
              <div className="flex aspect-square size-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-500 via-indigo-500 to-violet-500 shadow-md shadow-brand-500/10 transform transition-transform duration-300 hover:scale-105">
                <Sparkles className="size-4.5 text-white fill-current animate-pulse-glow" />
              </div>
              {!collapsed && (
                <div className="flex flex-col items-start ml-2.5 transition-all duration-300">
                  <span className="font-extrabold text-sm tracking-tight text-foreground bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">ClipForge</span>
                  <span className="text-[9px] font-black text-brand-400/80 uppercase tracking-widest leading-none mt-0.5">Viral AI Studio</span>
                </div>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="py-5 px-3 space-y-6">
        {NAV_GROUPS.map((group, gIdx) => (
          <SidebarGroup key={gIdx} className="p-0">
            {!collapsed && (
              <span className="px-3 text-[10px] font-black text-muted-foreground/45 uppercase tracking-widest block mb-2">
                {group.title}
              </span>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/")
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        onClick={() => router.push(item.href)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all duration-200 relative group/btn",
                          active
                            ? "bg-brand-500/10 text-brand-400 font-semibold"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50 hover:translate-x-1"
                        )}
                      >
                        {/* Left Active indicator dot/bar */}
                        {active && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-brand-500 rounded-r-full" />
                        )}
                        <item.icon className={cn(
                          "size-4 shrink-0 transition-transform duration-200 group-hover/btn:scale-110",
                          active ? "text-brand-400" : "text-muted-foreground group-hover/btn:text-foreground"
                        )} />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-border/40 p-3 bg-muted/[0.03] dark:bg-slate-950/10 space-y-2">
        <SidebarMenu className="space-y-1">
          {/* User Profile Info Card */}
          {user && (
            <div className="px-1 py-1.5">
              {collapsed ? (
                <div className="flex items-center justify-center">
                  <div 
                    title={user.email || "User Profile"}
                    className="size-8 rounded-lg bg-gradient-to-tr from-brand-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-md cursor-pointer hover:scale-105 transition-transform"
                  >
                    {user.email ? user.email.slice(0, 2).toUpperCase() : "US"}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-2.5 bg-muted/15 dark:bg-slate-900/30 border border-border/40 rounded-xl mb-1 shadow-sm transition-all duration-300">
                  <div className="size-8 rounded-lg bg-gradient-to-tr from-brand-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-md">
                    {user.email ? user.email.slice(0, 2).toUpperCase() : "US"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-bold text-foreground leading-none">{user.email}</p>
                    <span className={cn(
                      "inline-block text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-full border mt-1.5 tracking-wider leading-none shadow-sm",
                      user.plan === "pro"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                    )}>
                      {user.plan === "pro" ? "Pro Access" : "Free Tier"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Controls */}
          <SidebarMenuItem>
            <ThemeToggle showLabel={!collapsed} />
          </SidebarMenuItem>
          
          <SidebarMenuItem>
            <SidebarMenuButton 
              onClick={handleLogout} 
              className="text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/20 w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors"
            >
              <LogOut className="size-4 shrink-0" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          
          <SidebarMenuItem className="hidden md:block">
            <SidebarMenuButton 
              onClick={toggleSidebar} 
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50 w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors"
            >
              <ChevronLeft className={cn("size-4 shrink-0 transition-transform duration-300", collapsed && "rotate-180")} />
              <span>Collapse Sidebar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
