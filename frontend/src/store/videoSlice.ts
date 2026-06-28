import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit"
import { videosAPI } from "@/lib/api"
import type { RootState } from "./store"

export interface VideoListResponse {
  items: Video[]
  total: number
  skip: number
  limit: number
}

export interface Video {
  id: string
  source_url: string
  status: string
  duration: number | null
  title: string | null
  transcript: any
  segments: any[] | null
  language: string | null
  platform: string | null
  viral_score: number | null
  thumbnail_url: string | null
  created_at: string
}

interface VideoState {
  videos: Video[]
  currentVideo: Video | null
  loading: boolean
  total: number
  page: number
  pageSize: number
}

const initialState: VideoState = {
  videos: [],
  currentVideo: null,
  loading: false,
  total: 0,
  page: 1,
  pageSize: 20,
}

export const fetchVideos = createAsyncThunk(
  "videos/fetchVideos",
  async (arg?: { force?: boolean; skip?: number; limit?: number }) => {
    const skip = arg?.skip ?? 0
    const limit = arg?.limit ?? 20
    const res = await videosAPI.list(skip, limit)
    const data = res.data as VideoListResponse
    return { items: data.items as Video[], total: data.total, skip, limit }
  },
  {
    condition: (arg, { getState }) => {
      if (arg?.force) return true
      const state = getState() as RootState
      if (state.videos.videos.length > 0 && !arg?.skip) {
        return false
      }
    }
  }
)

export const fetchVideo = createAsyncThunk(
  "videos/fetchVideo",
  async (arg: string | { id: string; force?: boolean }) => {
    const id = typeof arg === "string" ? arg : arg.id
    const res = await videosAPI.get(id)
    return res.data as Video
  }
)

const videoSlice = createSlice({
  name: "videos",
  initialState,
  reducers: {
    removeVideo(state, action: PayloadAction<string>) {
      state.videos = state.videos.filter((v) => v.id !== action.payload)
      if (state.currentVideo?.id === action.payload) state.currentVideo = null
    },
    removeVideos(state, action: PayloadAction<string[]>) {
      const ids = new Set(action.payload)
      state.videos = state.videos.filter((v) => !ids.has(v.id))
      if (state.currentVideo && ids.has(state.currentVideo.id)) state.currentVideo = null
      state.total = Math.max(0, state.total - ids.size)
    },
    setPage(state, action: PayloadAction<number>) {
      state.page = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchVideos.pending, (s) => { s.loading = true })
      .addCase(fetchVideos.fulfilled, (s, a) => {
        s.videos = a.payload.items
        s.total = a.payload.total
        s.loading = false
      })
      .addCase(fetchVideos.rejected, (s) => { s.loading = false })
      .addCase(fetchVideo.pending, (s) => { s.loading = true })
      .addCase(fetchVideo.fulfilled, (s, a) => { s.currentVideo = a.payload; s.loading = false })
      .addCase(fetchVideo.rejected, (s) => { s.loading = false })
  },
})

export const { removeVideo, removeVideos, setPage } = videoSlice.actions
export default videoSlice.reducer
