"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { authAPI } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
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
      <Card className="p-6 text-center">
        <CardContent className="p-0">
          <CheckCircle size={48} className="mx-auto mb-4 text-emerald-400" />
          <CardTitle className="text-lg font-bold mb-2">Password Reset!</CardTitle>
          <CardDescription className="mb-6">Your password has been updated successfully.</CardDescription>
          <Button onClick={() => router.push("/app")}>Sign In</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-bold">Set New Password</CardTitle>
        <CardDescription>Enter your new password below.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input type="password" placeholder="New password" value={password}
            onChange={(e) => setPassword(e.target.value)} required minLength={8}
            autoComplete="new-password" />
          <Input type="password" placeholder="Confirm new password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} required minLength={8}
            autoComplete="new-password" />
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-900/10 px-4 py-3 text-sm text-red-400">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Button type="submit" disabled={submitting || !token} className="w-full">
            {submitting ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Reset Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/20">
            <Sparkles size={24} className="text-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">ClipForge</h1>
        </div>
        <Suspense fallback={<Card><CardContent className="p-6 text-center text-muted-foreground">Loading...</CardContent></Card>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  )
}
