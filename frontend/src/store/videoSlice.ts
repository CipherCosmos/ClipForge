import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit"
import { videosAPI } from "@/lib/api"
import type { RootState } from "./store"

export interface Video {
  id: string
  source_url: string
  status: string
  duration: number | null
  title: string | null
  transcript: any
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
}

const initialState: VideoState = {
  videos: [],
  currentVideo: null,
  loading: false,
}


export const fetchVideos = createAsyncThunk(
  "videos/fetchVideos",
  async (arg?: { force?: boolean }) => {
    const res = await videosAPI.list()
    return res.data.items as Video[]
  },
  {
    condition: (arg, { getState }) => {
      if (arg?.force) return true
      const state = getState() as RootState
      if (state.videos.videos.length > 0) {
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
  },
  {
    condition: (arg, { getState }) => {
      const id = typeof arg === "string" ? arg : arg.id
      const force = typeof arg === "string" ? false : !!arg.force
      if (force) return true
      const state = getState() as RootState
      if (state.videos.currentVideo?.id === id) {
        return false
      }
      const existing = state.videos.videos.find(v => v.id === id)
      if (existing && existing.status === "completed") {
        return false
      }
    }
  }
)

const videoSlice = createSlice({
  name: "videos",
  initialState,
  reducers: {
    setVideos(state, action: PayloadAction<Video[]>) {
      state.videos = action.payload
    },
    setCurrentVideo(state, action: PayloadAction<Video | null>) {
      state.currentVideo = action.payload
    },
    addVideo(state, action: PayloadAction<Video>) {
      state.videos.unshift(action.payload)
    },
    updateVideo(state, action: PayloadAction<Partial<Video> & { id: string }>) {
      state.currentVideo = state.currentVideo?.id === action.payload.id
        ? { ...state.currentVideo, ...action.payload }
        : state.currentVideo
      const idx = state.videos.findIndex((v) => v.id === action.payload.id)
      if (idx !== -1) state.videos[idx] = { ...state.videos[idx], ...action.payload }
    },
    removeVideo(state, action: PayloadAction<string>) {
      state.videos = state.videos.filter((v) => v.id !== action.payload)
      if (state.currentVideo?.id === action.payload) state.currentVideo = null
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchVideos.pending, (s) => { s.loading = true })
      .addCase(fetchVideos.fulfilled, (s, a) => { s.videos = a.payload; s.loading = false })
      .addCase(fetchVideos.rejected, (s) => { s.loading = false })
      .addCase(fetchVideo.pending, (s) => { s.loading = true })
      .addCase(fetchVideo.fulfilled, (s, a) => { s.currentVideo = a.payload; s.loading = false })
      .addCase(fetchVideo.rejected, (s) => { s.loading = false })
  },
})

export const { setVideos, setCurrentVideo, addVideo, updateVideo, removeVideo, setLoading } = videoSlice.actions
export default videoSlice.reducer
