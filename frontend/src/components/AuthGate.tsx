"use client"

import { useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { AppDispatch, RootState } from "@/store/store"
import { setCredentials } from "@/store/authSlice"
import { authAPI } from "@/lib/api"
import { Sparkles, Loader2, AlertCircle, WifiOff, ArrowLeft } from "lucide-react"

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

  if (showForgot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="card p-6">
            <button onClick={() => { setShowForgot(false); setForgotSent(false); setError("") }} className="btn-ghost -ml-2 mb-4">
              <ArrowLeft size={16} className="mr-1" /> Back
            </button>
            <h2 className="text-lg font-bold text-white mb-2">Reset Password</h2>
            <p className="text-sm text-slate-400 mb-6">Enter your email and we&apos;ll send you a reset link.</p>
            {forgotSent ? (
              <div className="rounded-lg border border-emerald-800/50 bg-emerald-900/10 p-4 text-sm text-emerald-400 space-y-2">
                <p>Reset link sent! Check your email.</p>
                <p className="text-emerald-300/70 text-xs">In development, check the server console for the reset link, or use: <code className="rounded bg-emerald-900/20 px-1">/reset-password?token=&lt;token&gt;</code></p>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <input type="email" placeholder="you@example.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} required className="input" />
                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-900/10 px-4 py-3 text-sm text-red-400">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <button type="submit" disabled={submitting} className="btn-primary w-full">
                  {submitting ? "Sending..." : "Send Reset Link"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 p-6">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/30">
            <Sparkles size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">ClipForge</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            AI-powered viral short creator
          </p>
        </div>

        {networkError && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-800/50 bg-amber-900/10 backdrop-blur-sm px-4 py-4 text-sm text-amber-400">
            <WifiOff size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Backend not reachable</p>
              <p className="mt-0.5 text-amber-300/70">
                Make sure the API server is running on port 8000.
                Run <code className="rounded bg-amber-900/20 px-1 py-0.5 text-xs">make start</code> to start all services.
              </p>
            </div>
          </div>
        )}

        <div className="card-glass p-6">
          <div className="mb-6 flex rounded-xl bg-slate-900/80 p-1">
            <button
              onClick={() => { setMode("login"); setError(""); setNetworkError(false) }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                mode === "login"
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Login
            </button>
            <button
              onClick={() => { setMode("register"); setError(""); setNetworkError(false) }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                mode === "register"
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Password</label>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="input"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              <div className="mt-1 flex items-center justify-between">
                <p className="text-xs text-slate-500">At least 8 characters</p>
                {mode === "login" && (
                  <button type="button" onClick={() => setShowForgot(true)}
                    className="text-xs text-brand-400 hover:text-brand-300">
                    Forgot password?
                  </button>
                )}
              </div>
            </div>

            {error && !networkError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-900/10 px-4 py-3 text-sm text-red-400">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || authLoading}
              className="btn-primary w-full"
            >
              {submitting || authLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : null}
              {submitting || authLoading
                ? "Please wait..."
                : mode === "login"
                  ? "Sign In"
                  : "Create Account"}
            </button>
          </form>

          {mode === "login" && (
            <p className="mt-4 text-center text-xs text-slate-500">
              Use your registered email and password to sign in.
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          Free &amp; open-source &middot; All processing runs locally
        </p>
      </div>
    </div>
  )
}
