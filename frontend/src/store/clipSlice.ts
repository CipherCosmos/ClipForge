import { createSlice, createAsyncThunk } from "@reduxjs/toolkit"
import { clipsAPI } from "@/lib/api"
import type { RootState } from "./store"

export interface Clip {
  id: string
  video_id: string
  start_time: number
  end_time: number
  caption: string
  score: number
  file_url: string
  thumbnail_url: string | null
  title: string | null
  hashtags: string | null
  dubs?: Record<string, string>
  created_at: string
}

interface ClipState {
  clips: Clip[]
  loading: boolean
}

const initialState: ClipState = {
  clips: [],
  loading: false,
}


export const fetchClips = createAsyncThunk(
  "clips/fetchClips",
  async (arg: string | { video_id: string; force?: boolean }) => {
    const video_id = typeof arg === "string" ? arg : arg.video_id
    const res = await clipsAPI.list(video_id)
    return (res.data.items || res.data) as Clip[]
  },
  {
    condition: (arg, { getState }) => {
      const video_id = typeof arg === "string" ? arg : arg.video_id
      const force = typeof arg === "string" ? false : !!arg.force
      if (force) return true
      const state = getState() as RootState
      // Cache hits if the loaded clips already match this video_id
      if (state.clips.clips.length > 0 && state.clips.clips.every(c => c.video_id === video_id)) {
        return false
      }
    }
  }
)

const clipSlice = createSlice({
  name: "clips",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchClips.pending, (s) => { s.loading = true })
      .addCase(fetchClips.fulfilled, (s, a) => { s.clips = a.payload; s.loading = false })
      .addCase(fetchClips.rejected, (s) => { s.loading = false })
  },
})

export default clipSlice.reducer
