import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit"
import { authAPI } from "@/lib/api"

interface AuthState {
  token: string | null
  user: { id: string; email: string; plan: string } | null
  loading: boolean
}

const initialState: AuthState = {
  token: typeof window !== "undefined" ? localStorage.getItem("token") : null,
  user: null,
  loading: false,
}

export const checkAuth = createAsyncThunk("auth/checkAuth", async () => {
  const token = localStorage.getItem("token")
  if (!token) throw new Error("No token")
  const res = await authAPI.me()
  return { token, user: res.data }
})

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<{ token: string; user: AuthState["user"] }>) {
      state.token = action.payload.token
      state.user = action.payload.user
      localStorage.setItem("token", action.payload.token)
      if (action.payload.user) localStorage.setItem("user", JSON.stringify(action.payload.user))
    },
    logout(state) {
      state.token = null
      state.user = null
      localStorage.removeItem("token")
      localStorage.removeItem("user")
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(checkAuth.pending, (state) => {
        state.loading = true
      })
      .addCase(checkAuth.fulfilled, (state, action) => {
        state.token = action.payload.token
        state.user = action.payload.user
        state.loading = false
      })
      .addCase(checkAuth.rejected, (state) => {
        state.token = null
        state.user = null
        state.loading = false
        localStorage.removeItem("token")
        localStorage.removeItem("user")
      })
  },
})

export const { setCredentials, logout } = authSlice.actions
export default authSlice.reducer
