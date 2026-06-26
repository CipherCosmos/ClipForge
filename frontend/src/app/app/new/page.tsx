"use client"

import { useState, useCallback, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Upload, Link2, ArrowLeft, Loader2, AlertCircle, Sparkles, HelpCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { PlatformSelector } from "@/components/PlatformSelector"
import { UploadZone } from "@/components/UploadZone"
import { ImportUrl } from "@/components/ImportUrl"
import { videosAPI } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

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
    <div className="animate-fade-in space-y-6">
      {/* Top Header Section */}
      <div className="flex items-center justify-between border-b border-border pb-5">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push("/app")}
            className="h-9 w-9 rounded-lg border-border bg-card hover:bg-muted"
          >
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">New Project</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Transform any media files or links into high-retention viral clips
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-lg border border-border">
          <Sparkles className="size-3.5 text-brand-400" />
          <span>Local processing &middot; GPU Accelerated</span>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Side: Preset Config Grid (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="p-6">
              <PlatformSelector value={platform} onChange={setPlatform} />
            </CardContent>
          </Card>

          {/* Quick Guidance Info Card */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="border border-border/50 bg-muted/10 shadow-none">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-brand-400" />
                  AI Transcription
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Automatic transcription with Whisper large-v3-turbo supports over 99 languages. Speaker diarization separates talkers automatically.
                </p>
              </CardContent>
            </Card>

            <Card className="border border-border/50 bg-muted/10 shadow-none">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <HelpCircle className="size-3.5 text-amber-400" />
                  Viral Engine Scoring
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Extracts top-performing segments automatically based on structural hooks, audio energy, laughter, emotion analysis, and scene cuts.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Side: Media Source Tab Container (1/3 width) */}
        <div className="lg:col-span-1">
          <Card className="border border-border bg-card shadow-sm h-full flex flex-col">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-sm font-semibold text-foreground">Media Source</CardTitle>
              <CardDescription className="text-xs">
                Provide a file or public link to ingest
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 pt-2 flex-1 flex flex-col justify-between">
              <Tabs
                value={tab}
                onValueChange={(v) => { setTab(v as "upload" | "url"); setError("") }}
                className="w-full flex-1 flex flex-col"
              >
                <TabsList className="w-full grid grid-cols-2 p-1 bg-muted">
                  <TabsTrigger value="upload" className="text-xs py-1.5">
                    <Upload size={14} className="mr-1" /> Upload File
                  </TabsTrigger>
                  <TabsTrigger value="url" className="text-xs py-1.5">
                    <Link2 size={14} className="mr-1" /> Import URL
                  </TabsTrigger>
                </TabsList>

                {error && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span className="font-medium">{error}</span>
                  </div>
                )}

                <div className="mt-5 flex-1 flex flex-col">
                  <TabsContent value="upload" className="m-0 flex-1 flex flex-col justify-center">
                    <UploadZone onFile={handleFile} busy={busy} />
                  </TabsContent>

                  <TabsContent value="url" className="m-0 flex-1 flex flex-col justify-center">
                    <ImportUrl onImport={handleImport} busy={busy} />
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>
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
