import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit"
import { clipsAPI } from "@/lib/api"

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

export const fetchClips = createAsyncThunk("clips/fetchClips", async (video_id: string) => {
  const res = await clipsAPI.list(video_id)
  return (res.data.items || res.data) as Clip[]
})

const clipSlice = createSlice({
  name: "clips",
  initialState,
  reducers: {
    setClips(state, action: PayloadAction<Clip[]>) {
      state.clips = action.payload
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchClips.pending, (s) => { s.loading = true })
      .addCase(fetchClips.fulfilled, (s, a) => { s.clips = a.payload; s.loading = false })
      .addCase(fetchClips.rejected, (s) => { s.loading = false })
  },
})

export const { setClips, setLoading } = clipSlice.actions
export default clipSlice.reducer
