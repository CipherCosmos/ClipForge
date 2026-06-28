"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { authAPI } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
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
    <Card className="p-6 text-center">
      {status === "loading" && <Loader2 size={32} className="animate-spin mx-auto text-brand-400" />}
      {status === "verified" && (
        <CardContent className="p-0">
          <CheckCircle size={48} className="mx-auto mb-4 text-emerald-400" />
          <CardTitle className="text-lg font-bold mb-2">Email Verified!</CardTitle>
          <CardDescription className="mb-6">Your email has been confirmed.</CardDescription>
          <Button onClick={() => router.push("/app")}>Go to Dashboard</Button>
        </CardContent>
      )}
      {status === "error" && (
        <CardContent className="p-0">
          <AlertCircle size={48} className="mx-auto mb-4 text-red-400" />
          <CardTitle className="text-lg font-bold mb-2">Verification Failed</CardTitle>
          <CardDescription className="mb-6 text-red-400">{error}</CardDescription>
          <Button onClick={() => router.push("/app")}>Back to Dashboard</Button>
        </CardContent>
      )}
    </Card>
  )
}

export default function VerifyEmailPage() {
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
          <VerifyContent />
        </Suspense>
      </div>
    </div>
  )
}
