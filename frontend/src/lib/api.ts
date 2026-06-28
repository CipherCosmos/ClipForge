import axios from "axios"

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api",
})

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token")
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Auto-refresh on 401
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const req = err.config
    if (err.response?.status === 401 && !req._retry && typeof window !== "undefined") {
      req._retry = true
      const refreshToken = localStorage.getItem("refresh_token")
      if (refreshToken) {
        try {
          const { data } = await axios.post(
            api.defaults.baseURL + "/auth/refresh",
            { refresh_token: refreshToken }
          )
          localStorage.setItem("token", data.access_token)
          localStorage.setItem("refresh_token", data.refresh_token)
          req.headers.Authorization = `Bearer ${data.access_token}`
          return api(req)
        } catch {
          localStorage.removeItem("token")
          localStorage.removeItem("refresh_token")
          window.location.href = "/"
        }
      }
    }
    return Promise.reject(err)
  }
)

export default api

export const authAPI = {
  register: (email: string, password: string) => api.post("/auth/register", { email, password }),
  login: (email: string, password: string) => api.post("/auth/login", { email, password }),
  me: () => api.get("/auth/me"),
  refresh: (refreshToken: string) => api.post("/auth/refresh", { refresh_token: refreshToken }),
  logout: () => api.post("/auth/logout"),
  verifyEmail: (token: string) => api.post("/auth/verify-email", { token }),
  forgotPassword: (email: string) => api.post("/auth/forgot-password", { email }),
  resetPassword: (token: string, password: string) =>
    api.post("/auth/reset-password", { token, password }),
  getApiKeyStatus: () => api.get("/keys"),
  generateApiKey: (name?: string, expireDays?: number | null) =>
    api.post("/keys/generate", { name: name || "Default", expire_days: expireDays || null }),
  revokeApiKey: (keyId: string) => api.delete(`/keys/${keyId}`),
  getSettings: () => api.get("/settings"),
  updateSettings: (prefs: Record<string, any>) => api.put("/settings", prefs),
}

export const videosAPI = {
  list: (skip = 0, limit = 20) => api.get("/videos", { params: { skip, limit } }),
  get: (id: string) => api.get(`/videos/${id}`),
  upload: (file: File, platform = "youtube_shorts") => {
    const form = new FormData()
    form.append("file", file)
    return api.post(`/videos?platform=${platform}`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  },
  importFromUrl: (source_url: string, platform = "youtube_shorts") =>
    api.post("/videos/import", { source_url, platform }),
  importBatch: (urls: string[], platform?: string) =>
    api.post("/videos/import-batch", { urls, platform }),
  delete: (id: string) => api.delete(`/videos/${id}`),
  batchDelete: (ids: string[]) => api.post("/videos/batch-delete", { ids }),
  platforms: () => api.get("/videos/platforms"),
  reprocess: (id: string) => api.post(`/videos/${id}/reprocess`),
  exportZip: (id: string) =>
    api.get(`/videos/${id}/export`, { responseType: "blob" }),
  dub: (id: string, targetLang?: string) =>
    api.post(`/videos/${id}/dub`, { target_langs: [targetLang || "es"] }),
}

export const clipsAPI = {
  list: (video_id: string) => api.get("/clips", { params: { video_id } }),
  get: (id: string) => api.get(`/clips/${id}`),
  dub: (clipId: string, target_lang: string) =>
    api.post(`/clips/${clipId}/dub`, { target_lang }),
  publish: (
    clipId: string,
    platform: string,
    accessToken: string,
    title?: string,
    description?: string,
    hashtags?: string,
    dubLanguage?: string
  ) =>
    api.post("/publish/clip", {
      clip_id: clipId,
      platform,
      access_token: accessToken,
      title,
      description,
      hashtags,
      dub_language: dubLanguage && dubLanguage !== "original" ? dubLanguage : undefined,
    }),
  update: (id: string, data: Partial<{ title: string; caption: string; hashtags: string }>) =>
    api.patch(`/clips/${id}`, data),
}

export const jobsAPI = {
  list: (video_id?: string) => api.get("/jobs", { params: { video_id } }),
  get: (id: string) => api.get(`/jobs/${id}`),
  retry: (id: string) => api.post(`/jobs/${id}/retry`),
}

export const transcriptAPI = {
  get: (videoId: string) => api.get(`/videos/${videoId}/transcript`),
  update: (
    videoId: string,
    segments: { index: number; start: number; end: number; text: string }[]
  ) => api.put(`/videos/${videoId}/transcript`, { segments }),
  regenerate: (videoId: string) => api.post(`/videos/${videoId}/transcript/regenerate`),
  exportSrt: (videoId: string) =>
    api.get(`/videos/${videoId}/transcript/export-srt`, { responseType: "text" }),
  importSrt: (videoId: string, file: File) => {
    const form = new FormData()
    form.append("file", file)
    return api.post(`/videos/${videoId}/transcript/import-srt`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  },
}

export const researchAPI = {
  trends: (geo?: string, source?: string, niche?: string, q?: string) =>
    api.get("/research/trends", { params: { geo, source, niche, q } }),
  analyze: (topic: string, tone?: string) => api.post("/research/analyze", { topic, tone }),
  crawl: (query: string, videoType?: string) =>
    api.post("/research/crawl", { query, video_type: videoType }),
  validateTopic: (topic: string, niche?: string) =>
    api.post("/research/validate-topic", { topic, niche }),
  importTrend: (topic: string, niche?: string, platform?: string, url?: string) =>
    api.post("/research/import-trend", { topic, niche, platform, url }),
}

export const scheduleAPI = {
  create: (data: {
    clip_id: string
    platform: string
    title?: string
    description?: string
    hashtags?: string
    access_token?: string
    platform_account_id?: string
    platform_user_id?: string
    scheduled_at: string
    dub_language?: string
  }) => api.post("/schedule", data),
  list: (params?: { status?: string; skip?: number; limit?: number }) =>
    api.get("/schedule", { params }),
  cancel: (id: string) => api.delete(`/schedule/${id}`),
  publishNow: (id: string) => api.post(`/schedule/${id}/publish-now`),
}

export const webhookAPI = {
  list: (videoId: string) => api.get(`/publish/webhook/${videoId}`),
  register: (videoId: string, url: string, events?: string[]) =>
    api.post("/publish/webhook", { video_id: videoId, url, events }),
  unregister: (videoId: string, url: string) =>
    api.delete(`/publish/webhook/${videoId}`, { params: { url } }),
}

export const brandingAPI = {
  captionStyles: () => api.get("/branding/caption-styles"),
  music: () => api.get("/branding/music"),
  searchMusic: (query: string) => api.get("/branding/music/search", { params: { query } }),
}

export const accountsAPI = {
  list: () => api.get("/accounts"),
  create: (data: { platform: string; label: string; access_token: string; platform_user_id?: string }) =>
    api.post("/accounts", data),
  update: (id: string, data: { label?: string; access_token?: string; platform_user_id?: string; is_active?: boolean }) =>
    api.put(`/accounts/${id}`, data),
  delete: (id: string) => api.delete(`/accounts/${id}`),
  test: (id: string) => api.post(`/accounts/${id}/test`),
}

export const publishAPI = {
  publish: (data: {
    clip_id: string
    platform: string
    title?: string
    description?: string
    hashtags?: string
    platform_account_id?: string
    access_token?: string
    platform_user_id?: string
    dub_language?: string
    privacy?: string
  }) => api.post("/publish/clip", data),
  history: (params?: { clip_id?: string; platform?: string; status?: string; skip?: number; limit?: number }) =>
    api.get("/publish/history", { params }),
}

export const billingAPI = {
  plans: () => api.get("/billing/plans"),
  createCheckoutSession: (priceId: string, successUrl: string, cancelUrl: string) =>
    api.post("/billing/create-checkout-session", {
      price_id: priceId,
      success_url: successUrl,
      cancel_url: cancelUrl,
    }),
  createPortalSession: () => api.post("/billing/create-portal-session"),
  getSubscription: () => api.get("/billing/subscription"),
  cancel: () => api.post("/billing/cancel"),
}
