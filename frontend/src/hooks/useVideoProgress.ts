"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { videosAPI } from "@/lib/api"

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

export function useVideoProgress(videoId: string | null) {
  const [state, setState] = useState<VideoProgressState>({
    status: "pending",
    progress: 0,
    message: "Waiting...",
    jobType: "",
  })
  const [completed, setCompleted] = useState(false)
  const [error, setError] = useState("")
  const wsRef = useRef<WebSocket | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const progressMapRef = useRef<Record<string, number>>({})

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const updateFromApi = useCallback(async () => {
    if (!videoId) return
    try {
      const res = await videosAPI.get(videoId)
      const v = res.data
      if (v.status === "completed" || v.status === "ready") {
        setCompleted(true)
        setState({ status: "completed", progress: 100, message: "Complete!", jobType: "" })
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
    } catch {
      // ignore polling errors
    }
  }, [videoId, cleanup])

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

    // Try WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const host = "localhost:8000"
    const wsUrl = `${protocol}//${host}/ws/progress/${videoId}?token=${token}`

    let wsConnected = false
    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        wsConnected = true
        if (!mountedRef.current) return
        // Clear polling fallback if WS connects
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }

      ws.onmessage = (event) => {
        if (!mountedRef.current) return
        try {
          const data: Record<string, any> = JSON.parse(event.data)
          if (data.type === "pong") return
          if (data.type === "progress") {
            const progressData = data as ProgressEvent
            // Update the specific job type's progress
            progressMapRef.current[progressData.job_type] = progressData.progress
            
            // Recompute overall across all jobs
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
        } catch {
          // ignore parse errors
        }
      }

      ws.onerror = () => {
        wsConnected = false
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        wsConnected = false
        // Fall back to polling
        startPolling()
      }
    } catch {
      wsConnected = false
    }

    function startPolling() {
      if (pollRef.current || !mountedRef.current) return
      updateFromApi()
      pollRef.current = setInterval(updateFromApi, 2000)
    }

    // If WS didn't connect within 2s, start polling
    const fallbackTimer = setTimeout(() => {
      if (!wsConnected && mountedRef.current) {
        startPolling()
      }
    }, 2000)

    return () => {
      mountedRef.current = false
      cleanup()
      clearTimeout(fallbackTimer)
    }
  }, [videoId, cleanup, updateFromApi])

  return { state, completed, error }
}
