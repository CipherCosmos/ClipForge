"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { useDispatch, useSelector, shallowEqual } from "react-redux"
import { AppDispatch, RootState } from "@/store/store"
import { fetchVideo } from "@/store/videoSlice"
import { formatTime, cn } from "@/lib/utils"
import { transcriptAPI } from "@/lib/api"
import {
  ArrowLeft, Save, Download, Upload, RefreshCw,
  Trash2, Split, Merge, Clock, Globe, Type, Film,
  Check, Loader2, AlertTriangle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

interface Segment {
  index: number
  start: number
  end: number
  text: string
}

interface TranscriptData {
  language: string
  full_text: string
  segments: Segment[]
}

export default function TranscriptEditorPage() {
  const params = useParams()
  const router = useRouter()
  const dispatch = useDispatch<AppDispatch>()
  const { currentVideo: video, loading: videoLoading } = useSelector(
    (s: RootState) => ({ currentVideo: s.videos.currentVideo, loading: s.videos.loading }),
    shallowEqual
  )
  const id = params.id as string
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const textareaRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map())

  const [transcript, setTranscript] = useState<TranscriptData | null>(null)
  const [originalSegments, setOriginalSegments] = useState<Segment[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "saving">("saved")
  const [regenerating, setRegenerating] = useState(false)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null)
  const [showClipsExistPrompt, setShowClipsExistPrompt] = useState(false)

  useEffect(() => {
    if (!id) return
    dispatch(fetchVideo(id))
    loadTranscript()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, dispatch])

  const loadTranscript = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await transcriptAPI.get(id)
      const data = res.data as TranscriptData
      setTranscript(data)
      const segs = data.segments.map(s => ({ ...s }))
      setSegments(segs)
      setOriginalSegments(segs.map(s => ({ ...s })))
      setSaveStatus("saved")
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError("No transcript found. Process the video first or upload an SRT file.")
      } else {
        setError("Failed to load transcript")
      }
      setSegments([])
      setTranscript(null)
    } finally {
      setLoading(false)
    }
  }

  const hasUnsavedChanges = useMemo(() => {
    if (segments.length !== originalSegments.length) return true
    return segments.some((s, i) => {
      const orig = originalSegments[i]
      if (!orig) return true
      return s.start !== orig.start || s.end !== orig.end || s.text !== orig.text
    })
  }, [segments, originalSegments])

  useEffect(() => {
    if (hasUnsavedChanges && saveStatus !== "saving") {
      setSaveStatus("unsaved")
    }
  }, [hasUnsavedChanges, saveStatus])

  const handleSave = useCallback(async () => {
    if (!hasUnsavedChanges) return
    setSaving(true)
    setSaveStatus("saving")
    try {
      const payload = segments.map(s => ({
        index: s.index,
        start: s.start,
        end: s.end,
        text: s.text,
      }))
      const res = await transcriptAPI.update(id, payload)
      const data = res.data as TranscriptData
      setSegments(data.segments.map(s => ({ ...s })))
      setOriginalSegments(data.segments.map(s => ({ ...s })))
      setSaveStatus("saved")
      if (video && video.segments && video.segments.length > 0) {
        setShowClipsExistPrompt(true)
      }
    } catch (err) {
      setSaveStatus("unsaved")
      alert("Failed to save transcript changes")
    } finally {
      setSaving(false)
    }
  }, [segments, hasUnsavedChanges, id, video])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleSave])

  const updateSegment = (index: number, updates: Partial<Segment>) => {
    setSegments(prev => prev.map(s => s.index === index ? { ...s, ...updates } : s))
  }

  const deleteSegment = (index: number) => {
    const newSegments = segments.filter(s => s.index !== index)
    setSegments(newSegments.map((s, i) => ({ ...s, index: i })))
  }

  const mergeSegments = (index: number) => {
    const segIdx = segments.findIndex(s => s.index === index)
    if (segIdx < 0 || segIdx >= segments.length - 1) return
    const current = segments[segIdx]
    const next = segments[segIdx + 1]
    const merged: Segment = {
      index: current.index,
      start: current.start,
      end: next.end,
      text: current.text + " " + next.text,
    }
    const newSegments = [
      ...segments.slice(0, segIdx),
      merged,
      ...segments.slice(segIdx + 2),
    ]
    setSegments(newSegments.map((s, i) => ({ ...s, index: i })))
  }

  const splitSegment = (index: number, cursorPos: number) => {
    const seg = segments.find(s => s.index === index)
    if (!seg) return
    const text = seg.text
    if (!text || cursorPos <= 0 || cursorPos >= text.length) return
    const leftText = text.slice(0, cursorPos).trim()
    const rightText = text.slice(cursorPos).trim()
    if (!leftText || !rightText) return
    const midTime = (seg.start + seg.end) / 2
    const segIdx = segments.findIndex(s => s.index === index)
    const left: Segment = { index, start: seg.start, end: midTime, text: leftText }
    const right: Segment = { index: index + 1, start: midTime, end: seg.end, text: rightText }
    const newSegments = [
      ...segments.slice(0, segIdx),
      left,
      right,
      ...segments.slice(segIdx + 1),
    ]
    setSegments(newSegments.map((s, i) => ({ ...s, index: i })))
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      const nextSeg = segments.find(s => s.index === index + 1)
      if (nextSeg) {
        textareaRefs.current.get(nextSeg.index)?.focus()
      }
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      const textarea = e.currentTarget
      if (textarea.value === "" && segments.length > 1) {
        e.preventDefault()
        deleteSegment(index)
      }
    }
  }

  const seekVideo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time
      videoRef.current.play()
    }
  }

  const getSegmentColor = (index: number) => {
    if (segments.length === 0) return "border-l-border"
    if (index === 0) return "border-l-brand-400"
    if (index === segments.length - 1) return "border-l-violet-400"
    return "border-l-brand-500"
  }

  const mergeAllShortSegments = () => {
    if (segments.length < 2) return
    const result: Segment[] = [...segments]
    let i = 0
    while (i < result.length - 1) {
      const dur = result[i].end - result[i].start
      if (dur < 1.0) {
        result[i] = {
          ...result[i],
          end: result[i + 1].end,
          text: result[i].text + " " + result[i + 1].text,
        }
        result.splice(i + 1, 1)
      } else {
        i++
      }
    }
    setSegments(result.map((s, idx) => ({ ...s, index: idx })))
  }

  const splitLongSegments = () => {
    const result: Segment[] = []
    for (const seg of segments) {
      const dur = seg.end - seg.start
      if (dur > 10.0) {
        const sentences = seg.text.match(/[^.!?]+[.!?]+/g) || [seg.text]
        if (sentences.length <= 1) {
          const parts = seg.text.split(/(?<=,)\s*/)
          if (parts.length <= 1) {
            result.push(seg)
            continue
          }
          const partDur = dur / parts.length
          parts.forEach((part, pi) => {
            result.push({
              index: 0,
              start: seg.start + pi * partDur,
              end: Math.min(seg.start + (pi + 1) * partDur, seg.end),
              text: part.trim(),
            })
          })
        } else {
          const sentenceDur = dur / sentences.length
          sentences.forEach((sent, si) => {
            result.push({
              index: 0,
              start: seg.start + si * sentenceDur,
              end: Math.min(seg.start + (si + 1) * sentenceDur, seg.end),
              text: sent.trim(),
            })
          })
        }
      } else {
        result.push(seg)
      }
    }
    setSegments(result.map((s, idx) => ({ ...s, index: idx })))
  }

  const recalculateTimings = () => {
    const totalWords = segments.reduce((sum, s) => sum + (s.text.match(/\S+/g) || []).length, 0)
    if (totalWords === 0) return
    const avgWordsPerSec = totalWords / segments.reduce((sum, s) => sum + (s.end - s.start), 0)
    if (avgWordsPerSec <= 0) return
    let currentStart = segments[0]?.start ?? 0
    const result = segments.map((seg, idx) => {
      const wordCount = (seg.text.match(/\S+/g) || []).length
      const duration = wordCount / avgWordsPerSec
      const end = currentStart + Math.max(duration, 0.5)
      const updated = { ...seg, start: currentStart, end }
      currentStart = end
      return updated
    })
    setSegments(result.map((s, i) => ({ ...s, index: i })))
  }

  const handleExportSrt = async () => {
    try {
      const res = await transcriptAPI.exportSrt(id)
      const blob = new Blob([res.data], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `transcript_${id.slice(0, 8)}.srt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert("Failed to export SRT")
    }
  }

  const handleImportSrt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const res = await transcriptAPI.importSrt(id, file)
      const data = res.data as TranscriptData
      setTranscript(data)
      setSegments(data.segments.map(s => ({ ...s })))
      setOriginalSegments(data.segments.map(s => ({ ...s })))
      setSaveStatus("saved")
    } catch (err) {
      alert("Failed to import SRT file")
    }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      await transcriptAPI.regenerate(id)
      setShowRegenerateConfirm(false)
      router.push(`/app/videos/${id}`)
    } catch (err) {
      alert("Failed to start regeneration")
    } finally {
      setRegenerating(false)
    }
  }

  const wordCount = useMemo(() => {
    return segments.reduce((sum, s) => sum + (s.text.match(/\S+/g) || []).length, 0)
  }, [segments])

  const segmentCount = segments.length

  if (loading || (videoLoading && !video)) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
        <span>Loading transcript editor...</span>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3.5 min-w-0">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg border-border bg-card shrink-0" onClick={() => router.push(`/app/videos/${id}`)}>
            <ArrowLeft size={16} />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg sm:text-xl font-bold text-foreground">
              Transcript Editor
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate max-w-md">
              {video?.title || "Video Transcript"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {hasUnsavedChanges && (
            <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-md flex items-center gap-1.5 animate-pulse">
              <AlertTriangle size={12} /> Unsaved Changes
            </span>
          )}
          {saveStatus === "saved" && !hasUnsavedChanges && (
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md flex items-center gap-1.5">
              <Check size={12} /> Saved to Database
            </span>
          )}
          <Button
            onClick={handleSave}
            disabled={!hasUnsavedChanges || saving}
            size="sm"
            className="text-xs h-9 font-semibold gap-1.5 shadow-md"
          >
            {saving ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Save size={12} />
            )}
            Save Changes
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRegenerateConfirm(true)}
            disabled={regenerating}
            className="text-xs h-9 bg-card border-border font-semibold gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw size={12} className={cn(regenerating && "animate-spin")} />
            Regenerate
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9 bg-card border-border shrink-0" onClick={handleExportSrt} title="Export SRT">
            <Download size={14} className="text-muted-foreground hover:text-foreground" />
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9 bg-card border-border shrink-0" onClick={() => fileInputRef.current?.click()} title="Import SRT">
            <Upload size={14} className="text-muted-foreground hover:text-foreground" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".srt,.txt"
            className="hidden"
            onChange={handleImportSrt}
          />
        </div>
      </div>

      {/* Stats and Action sub-bar */}
      {segments.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/20 border border-border/40 p-3 rounded-xl">
          <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground">
            <span className="flex items-center gap-1.5 bg-card px-2.5 py-1 rounded-md border border-border/60">
              <Globe size={13} className="text-brand-400" /> Language: {transcript?.language?.toUpperCase() || "EN"}
            </span>
            <span className="flex items-center gap-1.5 bg-card px-2.5 py-1 rounded-md border border-border/60">
              <Type size={13} className="text-brand-400" /> {wordCount} Words
            </span>
            <span className="flex items-center gap-1.5 bg-card px-2.5 py-1 rounded-md border border-border/60">
              <Clock size={13} className="text-brand-400" /> {segmentCount} Segments
            </span>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={mergeAllShortSegments} className="text-xs h-8 bg-card border-border font-semibold gap-1.5">
              <Merge size={12} /> Merge Short (&lt;1s)
            </Button>
            <Button variant="outline" size="sm" onClick={splitLongSegments} className="text-xs h-8 bg-card border-border font-semibold gap-1.5">
              <Split size={12} /> Split Long (&gt;10s)
            </Button>
            <Button variant="outline" size="sm" onClick={recalculateTimings} className="text-xs h-8 bg-card border-border font-semibold gap-1.5">
              <Clock size={12} /> Auto timings
            </Button>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !segments.length && (
        <Card className="border border-dashed border-border bg-card/10 p-12 text-center">
          <Film size={40} className="mx-auto text-muted-foreground/60 mb-4" />
          <h3 className="text-base font-semibold text-foreground">{error}</h3>
          <div className="flex gap-3 justify-center mt-5">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="text-xs gap-2">
              <Upload size={14} /> Import SRT
            </Button>
            <Button onClick={() => router.push(`/app/videos/${id}`)} className="text-xs">
              Back to Video
            </Button>
          </div>
        </Card>
      )}

      {/* Main Workspace Layout */}
      {segments.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Sticky Video Player Box */}
          <div className="w-full lg:w-[32%] lg:sticky lg:top-6 lg:self-start shrink-0">
            <Card className="border border-border/60 bg-card/40 overflow-hidden shadow-lg">
              <CardContent className="p-0">
                <video
                  ref={videoRef}
                  src={video?.source_url || ""}
                  controls
                  preload="metadata"
                  className="w-full bg-black aspect-video block"
                />
              </CardContent>
            </Card>
            <p className="text-[10px] text-muted-foreground font-semibold mt-2.5 text-center bg-muted/40 border border-border/40 py-1 rounded-md">
              Tip: Click timestamp buttons to seek video
            </p>
          </div>

          {/* Timeline scroll pane */}
          <div className="flex-1 w-full space-y-3">
            {segments.map((seg) => {
              const active = activeSegmentIndex === seg.index
              return (
                <Card
                  key={seg.index}
                  ref={(el) => { if (el) segmentRefs.current.set(seg.index, el) }}
                  className={cn(
                    "border-l-4 transition-all duration-300 bg-card/25 border-border hover:bg-card/45 hover:border-border/80 group",
                    getSegmentColor(seg.index),
                    active && "border-l-brand-500 bg-card/70 ring-1 ring-brand-500/20 shadow-md"
                  )}
                  onClick={() => setActiveSegmentIndex(seg.index)}
                >
                  <CardContent className="p-3.5 space-y-3 sm:space-y-0 sm:flex sm:items-start sm:gap-4">
                    {/* Timing Controls Column */}
                    <div className="flex sm:flex-col items-center sm:items-stretch gap-2 shrink-0">
                      {/* Seek Button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); seekVideo(seg.start) }}
                        className="text-[10px] font-bold font-mono text-brand-400 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/20 rounded px-2.5 py-1 transition-colors cursor-pointer text-center whitespace-nowrap"
                        title="Seek Video to Start"
                      >
                        {formatTime(seg.start)} - {formatTime(seg.end)}
                      </button>

                      {/* Precise Timing Inputs */}
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={seg.start}
                          onChange={(e) => updateSegment(seg.index, { start: parseFloat(e.target.value) || 0 })}
                          className="h-7 w-14 text-[10px] font-bold text-center font-mono bg-background border-border p-1"
                        />
                        <span className="text-muted-foreground text-xs">&rarr;</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={seg.end}
                          onChange={(e) => updateSegment(seg.index, { end: parseFloat(e.target.value) || 0 })}
                          className="h-7 w-14 text-[10px] font-bold text-center font-mono bg-background border-border p-1"
                        />
                      </div>
                    </div>

                    {/* Textarea Input */}
                    <div className="flex-1 min-w-0">
                      <textarea
                        ref={(el) => { if (el) textareaRefs.current.set(seg.index, el) }}
                        value={seg.text}
                        onChange={(e) => updateSegment(seg.index, { text: e.target.value })}
                        onKeyDown={(e) => handleTextareaKeyDown(e, seg.index)}
                        rows={1}
                        className={cn(
                          "w-full bg-transparent text-sm text-foreground font-mono leading-relaxed resize-none outline-none border-0 p-0 placeholder:text-muted-foreground/60 transition-all",
                          active ? "text-foreground font-semibold" : "text-muted-foreground/95"
                        )}
                        placeholder="Enter segment text..."
                        style={{ height: "auto", minHeight: "1.5rem" }}
                        onInput={(e) => {
                          const el = e.currentTarget
                          el.style.height = "auto"
                          el.style.height = el.scrollHeight + "px"
                        }}
                      />
                    </div>

                    {/* Inline Actions */}
                    <div className="flex sm:flex-col items-center gap-1.5 shrink-0 justify-end opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Split at cursor"
                        onClickCapture={(e) => {
                          e.stopPropagation()
                          const textarea = textareaRefs.current.get(seg.index)
                          const cursorPos = textarea?.selectionStart ?? Math.floor(seg.text.length / 2)
                          splitSegment(seg.index, cursorPos)
                        }}
                      >
                        <Split size={13} />
                      </Button>
                      {segments.length > 1 && seg.index < segments.length - 1 && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); mergeSegments(seg.index) }}
                          title="Merge with next segment"
                        >
                          <Merge size={13} />
                        </Button>
                      )}
                      {segments.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); deleteSegment(seg.index) }}
                          title="Delete segment"
                        >
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Regenerate confirm dialog */}
      {showRegenerateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowRegenerateConfirm(false)}>
          <div className="rounded-xl border border-border bg-card p-5 shadow-2xl max-w-sm w-full mx-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-foreground mb-1.5">Regenerate Transcript?</h3>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              This will re-run transcription on the original video source using Whisper. Existing clips will be preserved, but you will need to re-render. Continue?
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowRegenerateConfirm(false)} className="flex-1 py-1.5 text-xs bg-background border-border">
                Cancel
              </Button>
              <Button onClick={handleRegenerate} disabled={regenerating} className="flex-1 py-1.5 text-xs">
                {regenerating ? "Regenerating..." : "Yes, Regenerate"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Clips exist prompt */}
      {showClipsExistPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowClipsExistPrompt(false)}>
          <div className="rounded-xl border border-border bg-card p-5 shadow-2xl max-w-sm w-full mx-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-foreground mb-1.5">Transcript Updated</h3>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Transcript saved successfully. Existing clips may reference the old transcript. Would you like to return to the video workspace now?
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowClipsExistPrompt(false)} className="flex-1 py-1.5 text-xs bg-background border-border">
                Stay Here
              </Button>
              <Button onClick={() => { setShowClipsExistPrompt(false); router.push(`/app/videos/${id}`) }} className="flex-1 py-1.5 text-xs">
                Go to Video Detail
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
