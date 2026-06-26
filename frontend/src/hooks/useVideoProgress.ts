"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useDispatch } from "react-redux"
import type { AppDispatch } from "@/store/store"
import { fetchVideo } from "@/store/videoSlice"
import { fetchClips as fetchClipsThunk } from "@/store/clipSlice"

export interface ProgressEvent {
  type: "progress"
  job_type: string
  progress: number
  status: string
  message: string
}

export interface VideoProgressState {
  status: string
  progress: number
  message: string
  jobType: string
}

const STAGE_WEIGHTS: Record<string, { start: number; end: number }> = {
  transcription: { start: 0, end: 30 },
  nlp: { start: 30, end: 50 },
  scene_detect: { start: 50, end: 80 },
  render: { start: 80, end: 100 },
}

function computeOverall(progressMap: Record<string, number>): number {
  let total = 0
  const stageKeys = Object.keys(STAGE_WEIGHTS)
  let maxActiveIndex = -1

  for (let i = 0; i < stageKeys.length; i++) {
    if (progressMap[stageKeys[i]] !== undefined) {
      maxActiveIndex = Math.max(maxActiveIndex, i)
    }
  }

  for (let i = 0; i < stageKeys.length; i++) {
    const job = stageKeys[i]
    const info = STAGE_WEIGHTS[job]

    let p = progressMap[job]
    if (p === undefined) {
      p = i < maxActiveIndex ? 1.0 : 0.0
    }

    total += (info.end - info.start) * p
  }
  return total
}

const MAX_RECONNECT_DELAY = 30000
const PING_INTERVAL = 30000

export function useVideoProgress(videoId: string | null) {
  const dispatch = useDispatch<AppDispatch>()
  const [state, setState] = useState<VideoProgressState>({
    status: "pending",
    progress: 0,
    message: "Waiting...",
    jobType: "",
  })
  const [completed, setCompleted] = useState(false)
  const [error, setError] = useState("")
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const progressMapRef = useRef<Record<string, number>>({})
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectAttemptRef = useRef(0)

  const videoIdRef = useRef(videoId)
  videoIdRef.current = videoId

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current)
      pingTimerRef.current = null
    }
    reconnectAttemptRef.current = 0
  }, [])

  const updateFromApi = useCallback(async () => {
    if (!videoId) return
    try {
      const result = await dispatch(fetchVideo({ id: videoId, force: true }))
      const v = result.payload as any
      if (!v || !v.status) return
      if (v.status === "completed" || v.status === "ready") {
        setCompleted(true)
        setState({ status: "completed", progress: 100, message: "Complete!", jobType: "" })
        dispatch(fetchClipsThunk({ video_id: videoId, force: true }))
        cleanup()
        return
      }
      if (v.status === "failed") {
        setError("Processing failed")
        setState({ status: "failed", progress: 0, message: "Failed", jobType: "" })
        cleanup()
        return
      }
      if (v.progress !== null && v.progress !== undefined) {
        setState((prev) => ({
          ...prev,
          progress: Math.round(v.progress),
          status: v.status,
        }))
      }
    } catch (e) {
      console.warn("Progress poll failed:", e)
    }
  }, [videoId, cleanup, dispatch])

  const connectWs = useCallback(() => {
    const currentVideoId = videoIdRef.current
    if (!currentVideoId || !mountedRef.current) return

    const token = localStorage.getItem("token")
    if (!token) return

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"
    const baseUrl = apiUrl.replace("https://", "wss://").replace("http://", "ws://").replace("/api", "")
    const wsUrl = `${baseUrl}/ws/progress/${currentVideoId}?token=${token}`

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close()
          return
        }
        reconnectAttemptRef.current = 0
        setReconnectAttempt(0)

        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }

        if (pingTimerRef.current) clearInterval(pingTimerRef.current)
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }))
          }
        }, PING_INTERVAL)
      }

      ws.onmessage = (event) => {
        if (!mountedRef.current) return
        try {
          const data: Record<string, any> = JSON.parse(event.data)
          if (data.type === "pong") return
          if (data.type === "progress") {
            const progressData = data as ProgressEvent
            progressMapRef.current[progressData.job_type] = progressData.progress
            const overall = computeOverall(progressMapRef.current)
            const isFullyCompleted = progressData.status === "completed" && progressData.job_type === "render"
            setState({
              status: isFullyCompleted ? "completed" : "processing",
              progress: Math.round(overall),
              message: progressData.message,
              jobType: progressData.job_type,
            })
            if (isFullyCompleted) {
              setCompleted(true)
            }
          }
        } catch (e) {
          console.warn("WS message parse failed:", e)
        }
      }

      ws.onerror = (e) => {
        console.warn("WS connection error:", e)
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current)
          pingTimerRef.current = null
        }
        const attempt = reconnectAttemptRef.current
        const delay = Math.min(1000 * Math.pow(2, attempt), MAX_RECONNECT_DELAY)
        reconnectAttemptRef.current = attempt + 1
        setReconnectAttempt(reconnectAttemptRef.current)
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connectWs()
          }
        }, delay)
      }
    } catch (e) {
      console.warn("WS connect failed:", e)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    mountedRef.current = true
    if (!videoId) return

    const token = localStorage.getItem("token")
    if (!token) return

    cleanup()
    setState({ status: "processing", progress: 0, message: "Starting...", jobType: "" })
    progressMapRef.current = {}
    setCompleted(false)
    setError("")
    setReconnectAttempt(0)
    reconnectAttemptRef.current = 0

    try {
      connectWs()
    } catch {
      // WS optional — polling always runs
    }

    function startPolling() {
      if (pollRef.current || !mountedRef.current) return
      updateFromApi()
      pollRef.current = setInterval(updateFromApi, 4000)
    }

    // Start HTTP polling after 2s regardless of WebSocket status
    const pollTimer = setTimeout(startPolling, 2000)

    return () => {
      mountedRef.current = false
      cleanup()
      clearTimeout(pollTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, cleanup, updateFromApi])

  return { state, completed, error, reconnectAttempt }
}
