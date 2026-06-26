"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { authAPI } from "@/lib/api"
import { Sparkles, Loader2, AlertCircle, CheckCircle } from "lucide-react"

function ResetForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams?.get("token") || ""
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) setError("Invalid or missing reset token. Use the link from your email.")
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError("Passwords do not match"); return }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return }
    setSubmitting(true)
    setError("")
    try {
      await authAPI.resetPassword(token, password)
      setDone(true)
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to reset password. The link may have expired.")
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="card p-6 text-center">
        <CheckCircle size={48} className="mx-auto mb-4 text-emerald-400" />
        <h2 className="text-lg font-bold text-white mb-2">Password Reset!</h2>
        <p className="text-sm text-slate-400 mb-6">Your password has been updated successfully.</p>
        <button onClick={() => router.push("/app")} className="btn-primary">Sign In</button>
      </div>
    )
  }

  return (
    <div className="card p-6">
      <h2 className="text-lg font-bold text-white mb-2">Set New Password</h2>
      <p className="text-sm text-slate-400 mb-6">Enter your new password below.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="password" placeholder="New password" value={password}
          onChange={(e) => setPassword(e.target.value)} required minLength={8}
          className="input" autoComplete="new-password" />
        <input type="password" placeholder="Confirm new password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)} required minLength={8}
          className="input" autoComplete="new-password" />
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-900/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <button type="submit" disabled={submitting || !token} className="btn-primary w-full">
          {submitting ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Reset Password"}
        </button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/20">
            <Sparkles size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">ClipForge</h1>
        </div>
        <Suspense fallback={<div className="card p-6 text-center text-slate-400">Loading...</div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  )
}
