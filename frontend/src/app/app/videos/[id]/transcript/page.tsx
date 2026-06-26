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
    if (segments.length === 0) return "border-slate-700"
    if (index === 0) return "border-l-emerald-500"
    if (index === segments.length - 1) return "border-l-slate-500"
    return "border-l-blue-500"
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
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button onClick={() => router.push(`/app/videos/${id}`)} className="btn-ghost -ml-2 shrink-0">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-lg sm:text-xl font-bold text-white">
            {video?.title || "Transcript Editor"}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasUnsavedChanges && (
            <span className="text-xs text-amber-400 flex items-center gap-1">
              <AlertTriangle size={12} /> Unsaved
            </span>
          )}
          {saveStatus === "saved" && !hasUnsavedChanges && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <Check size={12} /> Saved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!hasUnsavedChanges || saving}
            className={cn(
              "btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5",
              !hasUnsavedChanges && "opacity-50 cursor-not-allowed"
            )}
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            Save
          </button>
          <button
            onClick={() => setShowRegenerateConfirm(true)}
            disabled={regenerating}
            className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={cn(regenerating && "animate-spin")} />
            Regenerate
          </button>
          <button onClick={handleExportSrt} className="btn-ghost p-2" title="Export SRT">
            <Download size={16} />
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="btn-ghost p-2" title="Import SRT">
            <Upload size={16} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".srt,.txt"
            className="hidden"
            onChange={handleImportSrt}
          />
        </div>
      </div>

      {/* Stats bar */}
      {segments.length > 0 && (
        <div className="flex items-center gap-4 mb-4 text-xs text-slate-400 flex-wrap">
          <span className="flex items-center gap-1">
            <Globe size={12} /> {transcript?.language?.toUpperCase() || "EN"}
          </span>
          <span className="flex items-center gap-1">
            <Type size={12} /> {wordCount} words
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} /> {segmentCount} segments
          </span>
          <div className="flex gap-2 ml-auto">
            <button onClick={mergeAllShortSegments} className="btn-ghost text-[11px] px-2 py-1 flex items-center gap-1">
              <Merge size={12} /> Merge Short
            </button>
            <button onClick={splitLongSegments} className="btn-ghost text-[11px] px-2 py-1 flex items-center gap-1">
              <Split size={12} /> Split Long
            </button>
            <button onClick={recalculateTimings} className="btn-ghost text-[11px] px-2 py-1 flex items-center gap-1">
              <Clock size={12} /> Recalc Timings
            </button>
          </div>
        </div>
      )}

      {/* Error / No transcript */}
      {error && !segments.length && (
        <div className="card flex flex-col items-center py-16 px-4">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800">
            <Film size={28} className="text-slate-600" />
          </div>
          <p className="text-lg text-slate-400">{error}</p>
          <div className="flex gap-3 mt-6">
            <button onClick={() => fileInputRef.current?.click()} className="btn-secondary flex items-center gap-2">
              <Upload size={16} /> Import SRT
            </button>
            <button onClick={() => router.push(`/app/videos/${id}`)} className="btn-primary">
              Back to Video
            </button>
          </div>
        </div>
      )}

      {/* Main editor */}
      {segments.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Video Preview */}
          <div className="w-full lg:w-[30%] lg:sticky lg:top-4 lg:self-start">
            <div className="card p-0 overflow-hidden">
              <video
                ref={videoRef}
                src={video?.source_url || ""}
                controls
                preload="metadata"
                className="w-full bg-black"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-2 text-center">
              Click timestamp to seek
            </p>
          </div>

          {/* Segments list */}
          <div className="flex-1 space-y-2 min-w-0">
            {segments.map((seg) => (
              <div
                key={seg.index}
                ref={(el) => { if (el) segmentRefs.current.set(seg.index, el) }}
                className={cn(
                  "card p-3 border-l-4 transition-all duration-150 group",
                  getSegmentColor(seg.index),
                  activeSegmentIndex === seg.index && "ring-1 ring-brand-500/50"
                )}
                onClick={() => setActiveSegmentIndex(seg.index)}
              >
                <div className="flex items-start gap-3">
                  {/* Timestamp */}
                  <button
                    onClick={() => seekVideo(seg.start)}
                    className="shrink-0 text-xs font-mono text-brand-400 bg-brand-900/20 hover:bg-brand-900/40 rounded px-2 py-1 transition-colors mt-1"
                    title="Click to seek video"
                  >
                    {formatTime(seg.start)} - {formatTime(seg.end)}
                  </button>

                  {/* Time inputs */}
                  <div className="flex gap-1 items-center shrink-0">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={seg.start}
                      onChange={(e) => updateSegment(seg.index, { start: parseFloat(e.target.value) || 0 })}
                      className="w-16 bg-slate-800 border border-slate-700 rounded text-[11px] text-slate-300 px-1.5 py-1 text-center font-mono"
                    />
                    <span className="text-slate-600 text-xs">-</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={seg.end}
                      onChange={(e) => updateSegment(seg.index, { end: parseFloat(e.target.value) || 0 })}
                      className="w-16 bg-slate-800 border border-slate-700 rounded text-[11px] text-slate-300 px-1.5 py-1 text-center font-mono"
                    />
                  </div>

                  {/* Text area */}
                  <div className="flex-1 min-w-0">
                    <textarea
                      ref={(el) => { if (el) textareaRefs.current.set(seg.index, el) }}
                      value={seg.text}
                      onChange={(e) => updateSegment(seg.index, { text: e.target.value })}
                      onKeyDown={(e) => handleTextareaKeyDown(e, seg.index)}
                      rows={1}
                      className="w-full bg-transparent text-sm text-slate-200 font-mono leading-relaxed resize-none outline-none border-0 p-0 placeholder-slate-600"
                      placeholder="Enter segment text..."
                      style={{ height: "auto", minHeight: "1.5rem" }}
                      onInput={(e) => {
                        const el = e.currentTarget
                        el.style.height = "auto"
                        el.style.height = el.scrollHeight + "px"
                      }}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300"
                      title="Split at cursor"
                      onClickCapture={(e) => {
                        e.stopPropagation()
                        const textarea = textareaRefs.current.get(seg.index)
                        const cursorPos = textarea?.selectionStart ?? Math.floor(seg.text.length / 2)
                        splitSegment(seg.index, cursorPos)
                      }}
                    >
                      <Split size={14} />
                    </button>
                    {segments.length > 1 && seg.index < segments.length - 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); mergeSegments(seg.index) }}
                        className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300"
                        title="Merge with next"
                      >
                        <Merge size={14} />
                      </button>
                    )}
                    {segments.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSegment(seg.index) }}
                        className="p-1 rounded hover:bg-red-900/30 text-slate-500 hover:text-red-400"
                        title="Delete segment"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regenerate confirm dialog */}
      {showRegenerateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowRegenerateConfirm(false)}>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl max-w-sm w-full mx-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2">Regenerate Transcript?</h3>
            <p className="text-sm text-slate-400 mb-4">
              This will re-run transcription on the original video source. Existing clips will be preserved but you will need to re-render. Continue?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowRegenerateConfirm(false)} className="flex-1 btn-ghost py-2 text-sm">
                Cancel
              </button>
              <button onClick={handleRegenerate} disabled={regenerating}
                className="flex-1 btn-primary py-2 text-sm">
                {regenerating ? "Regenerating..." : "Regenerate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clips exist prompt */}
      {showClipsExistPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowClipsExistPrompt(false)}>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl max-w-sm w-full mx-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2">Transcript Updated</h3>
            <p className="text-sm text-slate-400 mb-4">
              Transcript saved successfully. Existing clips may reference the old transcript. Would you like to re-render clips?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowClipsExistPrompt(false)} className="flex-1 btn-ghost py-2 text-sm">
                Dismiss
              </button>
              <button onClick={() => { setShowClipsExistPrompt(false); router.push(`/app/videos/${id}`) }}
                className="flex-1 btn-primary py-2 text-sm">
                Go to Video
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
