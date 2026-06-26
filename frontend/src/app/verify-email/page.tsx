"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { authAPI } from "@/lib/api"
import { Sparkles, Loader2, CheckCircle, AlertCircle } from "lucide-react"

function VerifyContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams?.get("token") || ""
  const [status, setStatus] = useState<"loading" | "verified" | "error">("loading")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!token) { setStatus("error"); setError("Invalid verification link."); return }
    authAPI.verifyEmail(token)
      .then(() => setStatus("verified"))
      .catch((err: any) => {
        setStatus("error")
        setError(err.response?.data?.detail || "Verification failed. The link may have expired.")
      })
  }, [token])

  return (
    <div className="card p-6 text-center">
      {status === "loading" && <Loader2 size={32} className="animate-spin mx-auto text-brand-400" />}
      {status === "verified" && (
        <>
          <CheckCircle size={48} className="mx-auto mb-4 text-emerald-400" />
          <h2 className="text-lg font-bold text-white mb-2">Email Verified!</h2>
          <p className="text-sm text-slate-400 mb-6">Your email has been confirmed.</p>
          <button onClick={() => router.push("/app")} className="btn-primary">Go to Dashboard</button>
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle size={48} className="mx-auto mb-4 text-red-400" />
          <h2 className="text-lg font-bold text-white mb-2">Verification Failed</h2>
          <p className="text-sm text-red-400 mb-6">{error}</p>
          <button onClick={() => router.push("/app")} className="btn-primary">Back to Dashboard</button>
        </>
      )}
    </div>
  )
}

export default function VerifyEmailPage() {
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
          <VerifyContent />
        </Suspense>
      </div>
    </div>
  )
}
