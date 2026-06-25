"use client"

import { useState, useCallback, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Upload, Link2, ArrowLeft, Loader2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { PlatformSelector } from "@/components/PlatformSelector"
import { UploadZone } from "@/components/UploadZone"
import { ImportUrl } from "@/components/ImportUrl"
import { videosAPI } from "@/lib/api"

function NewProjectContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<"upload" | "url">("upload")
  const [platform, setPlatform] = useState("youtube_shorts")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const urlParam = searchParams.get("url")
    const platParam = searchParams.get("platform")
    if (platParam) setPlatform(platParam)
    if (urlParam) {
      setTab("url")
      const platformToUse = platParam || "youtube_shorts"
      doImport(urlParam, platformToUse)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const doImport = async (url: string, platformOverride: string) => {
    setError("")
    setBusy(true)
    try {
      const res = await videosAPI.importFromUrl(url, platformOverride)
      const v = res.data
      router.push(`/app/videos/${v.id}`)
    } catch (err: any) {
      setError(err.response?.data?.detail || "Import failed")
      setBusy(false)
    }
  }

  const handleFile = useCallback(async (file: File) => {
    setError("")
    setBusy(true)
    try {
      const res = await videosAPI.upload(file, platform)
      const v = res.data
      router.push(`/app/videos/${v.id}`)
    } catch (err: any) {
      setError(err.response?.data?.detail || "Upload failed")
      setBusy(false)
    }
  }, [platform, router])

  const handleImport = (url: string) => {
    doImport(url, platform)
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex items-center gap-4">
        <button onClick={() => router.push("/app")} className="btn-ghost -ml-2">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">New Project</h1>
          <p className="mt-1 text-sm text-slate-400">
            Upload a video or paste a URL to create viral clips
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-8">
        <div className="card p-6">
          <PlatformSelector value={platform} onChange={setPlatform} />
        </div>

        <div className="card p-6">
          <div className="mb-6 flex rounded-xl bg-slate-900 p-1">
            <button
              onClick={() => { setTab("upload"); setError("") }}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all",
                tab === "upload" ? "bg-brand-500 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Upload size={16} />
              Upload File
            </button>
            <button
              onClick={() => { setTab("url"); setError("") }}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all",
                tab === "url" ? "bg-brand-500 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Link2 size={16} />
              Import URL
            </button>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-900/10 px-4 py-3 text-sm text-red-400">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {tab === "upload" ? (
            <UploadZone onFile={handleFile} busy={busy} />
          ) : (
            <ImportUrl onImport={handleImport} busy={busy} />
          )}
        </div>
      </div>
    </div>
  )
}

export default function NewProjectPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-brand-400" size={28} />
      </div>
    }>
      <NewProjectContent />
    </Suspense>
  )
}
