"use client"

import { useState, useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"
import { AppDispatch, RootState } from "@/store/store"
import { setCredentials } from "@/store/authSlice"
import { authAPI } from "@/lib/api"
import { Sparkles, Loader2, AlertCircle, WifiOff, ArrowLeft, Eye, EyeOff, Mail, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function AuthGate() {
  const dispatch = useDispatch<AppDispatch>()
  const { loading: authLoading } = useSelector((s: RootState) => s.auth)
  const [mode, setMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [networkError, setNetworkError] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setNetworkError(false)
    setSubmitting(true)
    try {
      const fn = mode === "login" ? authAPI.login : authAPI.register
      const res = await fn(email, password)
      dispatch(setCredentials({
        token: res.data.access_token,
        user: res.data.user,
      }))
      if (res.data.refresh_token) {
        localStorage.setItem("refresh_token", res.data.refresh_token)
      }
    } catch (err: any) {
      if (err.code === "ERR_NETWORK" || err.message === "Network Error") {
        setNetworkError(true)
        setError("Cannot connect to server. Make sure the backend is running.")
      } else {
        setError(err.response?.data?.detail || "Authentication failed. Please try again.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { setError("Enter your email first"); return }
    setSubmitting(true)
    try {
      await authAPI.forgotPassword(email)
      setForgotSent(true)
      setError("")
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to send reset email")
    } finally {
      setSubmitting(false)
    }
  }

  if (!mounted) return null

  if (showForgot) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 relative overflow-hidden bg-background">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-brand-500/5 blur-[120px]" />
          <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-violet-500/5 blur-[120px]" />
        </div>
        <Card className="relative w-full max-w-sm animate-scale-in">
          <CardHeader>
            <button onClick={() => { setShowForgot(false); setForgotSent(false); setError("") }}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground -ml-2 mb-2">
              <ArrowLeft size={16} /> Back to Sign In
            </button>
            <CardTitle>Reset Password</CardTitle>
            <CardDescription>Enter your email and we&apos;ll send you a reset link.</CardDescription>
          </CardHeader>
          <CardContent>
            {forgotSent ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-600 dark:text-emerald-400 space-y-1">
                <p className="font-medium">Reset link sent!</p>
                <p className="text-xs opacity-70">Check your email, or in development check the server console for the reset token.</p>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input type="email" placeholder="you@example.com" value={email}
                    onChange={(e) => setEmail(e.target.value)} required className="pl-9" />
                </div>
                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting && <Loader2 size={16} className="animate-spin mr-2" />}
                  Send Reset Link
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6 relative overflow-hidden bg-background">
      {/* Background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-brand-500/5 blur-[120px] animate-float" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-violet-500/5 blur-[120px] animate-float-delayed" />
      </div>

      <div className="relative w-full max-w-sm animate-scale-in">
        {/* Logo */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 shadow-xl shadow-brand-500/20 animate-pulse-glow">
            <Sparkles size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">ClipForge</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">AI-powered viral short creator</p>
        </div>

        {/* Network error */}
        {networkError && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400">
            <WifiOff size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Backend not reachable</p>
              <p className="mt-1 text-xs opacity-70">
                Make sure the API server is running on port 8000.
              </p>
            </div>
          </div>
        )}

        <Card>
          <CardContent className="p-6">
            <Tabs value={mode} onValueChange={(v) => { setMode(v as "login" | "register"); setError(""); setNetworkError(false) }} className="mb-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="register">Create Account</TabsTrigger>
              </TabsList>
            </Tabs>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input type="email" placeholder="you@example.com" value={email}
                    onChange={(e) => setEmail(e.target.value)} required
                    className="pl-9" autoComplete="email" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input type={showPassword ? "text" : "password"} placeholder="Enter your password" value={password}
                    onChange={(e) => setPassword(e.target.value)} required minLength={8}
                    className="pl-9 pr-9" autoComplete={mode === "login" ? "current-password" : "new-password"} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">At least 8 characters</p>
                  {mode === "login" && (
                    <button type="button" onClick={() => setShowForgot(true)}
                      className="text-xs text-brand-500 hover:text-brand-600 transition-colors">
                      Forgot password?
                    </button>
                  )}
                </div>
              </div>

              {error && !networkError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" disabled={submitting || authLoading} className="w-full">
                {submitting || authLoading ? (
                  <Loader2 size={16} className="animate-spin mr-2" />
                ) : null}
                {submitting || authLoading
                  ? "Please wait..."
                  : mode === "login"
                    ? "Sign In"
                    : "Create Account"}
              </Button>
            </form>

            {mode === "login" && (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Use your registered email and password to sign in.
              </p>
            )}
          </CardContent>
        </Card>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Free &amp; open-source &middot; All processing runs locally
        </p>
      </div>
    </div>
  )
}
