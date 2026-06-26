"use client"

import { useState } from "react"
import { ArrowLeft, Key, Copy, Check, AlertCircle, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { authAPI } from "@/lib/api"

export default function ApiKeysPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState("")

  const generateKey = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await authAPI.generateApiKey()
      setApiKey(res.data.api_key)
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to generate key")
    } finally {
      setLoading(false)
    }
  }

  const revokeKey = async () => {
    if (!confirm("Revoke current API key? This cannot be undone.")) return
    setLoading(true)
    try {
      await authAPI.revokeApiKey()
      setApiKey("")
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to revoke key")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-in space-y-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <button onClick={() => router.push("/app")} className="btn-ghost -ml-2">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">API Keys</h1>
          <p className="mt-1 text-sm text-slate-400">Programmatic access to ClipForge</p>
        </div>
      </div>

      <div className="card p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <Key size={20} className="text-brand-400" />
          <h2 className="text-lg font-bold text-white">Your API Key</h2>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-900/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {apiKey ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-800 border border-amber-700/50 p-4">
              <p className="text-xs font-semibold text-amber-400 mb-2">Save this key — it will not be shown again</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all bg-slate-900 rounded px-3 py-2 text-sm text-slate-200 font-mono">
                  {apiKey}
                </code>
                <button
                  onClick={() => { navigator.clipboard.writeText(apiKey); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  className="p-2 rounded-md bg-slate-700 hover:bg-slate-600"
                >
                  {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} className="text-slate-300" />}
                </button>
              </div>
            </div>
            <button onClick={revokeKey} disabled={loading} className="btn-secondary w-full py-2 border-red-800/50 text-red-400 hover:bg-red-900/20">
              {loading ? "Revoking..." : "Revoke API Key"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              API keys allow you to upload, transcribe, and export videos programmatically without using the web interface.
            </p>
            <button onClick={generateKey} disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? "Generating..." : "Generate API Key"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
