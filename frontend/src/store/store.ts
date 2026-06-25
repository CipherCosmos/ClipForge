import { configureStore } from "@reduxjs/toolkit"
import authReducer from "./authSlice"
import videoReducer from "./videoSlice"
import clipReducer from "./clipSlice"

export const store = configureStore({
  reducer: {
    auth: authReducer,
    videos: videoReducer,
    clips: clipReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
