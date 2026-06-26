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

export default api

export const authAPI = {
  register: (email: string, password: string) => api.post("/auth/register", { email, password }),
  login: (email: string, password: string) => api.post("/auth/login", { email, password }),
  me: () => api.get("/auth/me"),
  getApiKeyStatus: () => api.get("/keys"),
  generateApiKey: () => api.post("/keys/generate"),
  revokeApiKey: () => api.delete("/keys/revoke"),
}

export const videosAPI = {
  list: (skip = 0, limit = 20) => api.get("/videos", { params: { skip, limit } }),
  get: (id: string) => api.get(`/videos/${id}`),
  upload: (file: File, platform = "youtube_shorts") => {
    const form = new FormData()
    form.append("file", file)
    return api.post(`/videos?platform=${platform}`, form, { headers: { "Content-Type": "multipart/form-data" } })
  },
  importFromUrl: (source_url: string, platform = "youtube_shorts") => api.post("/videos/import", { source_url, platform }),
  importBatch: (urls: string[], platform?: string) =>
    api.post("/videos/import-batch", { urls, platform }),
  delete: (id: string) => api.delete(`/videos/${id}`),
  batchDelete: (ids: string[]) => api.post("/videos/batch-delete", { ids }),
  platforms: () => api.get("/videos/platforms"),
  reprocess: (id: string) => api.post(`/videos/${id}/reprocess`),
}

export const clipsAPI = {
  list: (video_id: string) => api.get("/clips", { params: { video_id } }),
  get: (id: string) => api.get(`/clips/${id}`),
  dub: (clipId: string, target_lang: string) => api.post(`/clips/${clipId}/dub`, { target_lang }),
  publish: (clipId: string, platform: string, accessToken: string, title?: string, description?: string, hashtags?: string) =>
    api.post(`/publish/clip`, { clip_id: clipId, platform, access_token: accessToken, title, description, hashtags }),
  update: (id: string, data: Partial<{ title: string; caption: string; hashtags: string }>) =>
    api.patch(`/clips/${id}`, data),
}

export const jobsAPI = {
  list: (video_id: string) => api.get("/jobs", { params: { video_id } }),
  get: (id: string) => api.get(`/jobs/${id}`),
}

export const researchAPI = {
  trends: (geo?: string, source?: string) => api.get("/research/trends", { params: { geo, source } }),
  analyze: (topic: string, tone?: string) => api.post("/research/analyze", { topic, tone }),
  crawl: (query: string, videoType?: string) => api.post("/research/crawl", { query, video_type: videoType }),
}
