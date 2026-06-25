"use client"

import { useEffect } from "react"
import { useDispatch } from "react-redux"
import { checkAuth } from "@/store/authSlice"
import { AppDispatch } from "@/store/store"

export function AuthInitializer() {
  const dispatch = useDispatch<AppDispatch>()

  useEffect(() => {
    dispatch(checkAuth())
  }, [dispatch])

  return null
}
