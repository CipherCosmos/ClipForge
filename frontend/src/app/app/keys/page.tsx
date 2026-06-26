"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Key, Copy, Check, AlertCircle, Plus, Trash2, Clock } from "lucide-react"
import { useRouter } from "next/navigation"
import { authAPI } from "@/lib/api"

interface ApiKeyItem {
  id: string
  name: string
  prefix: string
  expires_at: string | null
  is_expired: boolean
  is_active: boolean
  last_used_at: string | null
  created_at: string
}

export default function ApiKeysPage() {
  const router = useRouter()
  const [keys, setKeys] = useState<ApiKeyItem[]>([])
  const [loading, setLoading] = useState(false)
  const [newKey, setNewKey] = useState<{ api_key: string; name: string } | null>(null)
  const [keyName, setKeyName] = useState("CI/CD Pipeline")
  const [expireDays, setExpireDays] = useState("90")
  const [showCreate, setShowCreate] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState("")

  const fetchKeys = async () => {
    try {
      const res = await authAPI.getApiKeyStatus()
      setKeys(res.data.keys || [])
    } catch {
      setError("Failed to load API keys")
    }
  }

  useEffect(() => { fetchKeys() }, [])

  const generateKey = async () => {
    setLoading(true)
    setError("")
    try {
      const days = expireDays ? parseInt(expireDays) : null
      const res = await authAPI.generateApiKey(keyName, days)
      setNewKey({ api_key: res.data.api_key, name: res.data.name })
      setShowCreate(false)
      await fetchKeys()
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to generate key")
    } finally {
      setLoading(false)
    }
  }

  const revokeKey = async (id: string, name: string) => {
    if (!confirm(`Revoke key "${name}"? This cannot be undone.`)) return
    try {
      await authAPI.revokeApiKey(id)
      await fetchKeys()
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to revoke key")
    }
  }

  const activeKeys = keys.filter(k => k.is_active && !k.is_expired)
  const expiredOrRevoked = keys.filter(k => !k.is_active || k.is_expired)

  return (
    <div className="animate-fade-in space-y-8 w-full max-w-2xl lg:mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <button onClick={() => router.push("/app")} className="btn-ghost -ml-2 shrink-0 self-start sm:self-auto">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white truncate">API Keys</h1>
          <p className="mt-1 text-sm text-slate-400">Programmatic access to ClipForge</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary text-sm w-full sm:w-auto">
          <Plus size={16} className="mr-1" /> New Key
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-900/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {newKey && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-900/10 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-400">Key generated for &ldquo;{newKey.name}&rdquo;</p>
          <p className="text-xs text-amber-400/70">Save this now — it will never be shown again</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all bg-slate-950 rounded px-3 py-2 text-sm text-slate-200 font-mono border border-slate-700">
              {newKey.api_key}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(newKey.api_key); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              className="p-2 rounded-md bg-slate-700 hover:bg-slate-600 shrink-0"
            >
              {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} className="text-slate-300" />}
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="text-xs text-slate-400 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {showCreate && (
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-bold text-white">Create API Key</h2>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Key Name</label>
            <input
              value={keyName}
              onChange={e => setKeyName(e.target.value)}
              placeholder="e.g. CI/CD Pipeline, Development"
              className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Expiration</label>
            <select
              value={expireDays}
              onChange={e => setExpireDays(e.target.value)}
              className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white"
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
              <option value="">Never expires</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={generateKey} disabled={loading || !keyName.trim()} className="btn-primary flex-1">
              {loading ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>
      )}

      {/* Active keys */}
      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Key size={18} className="text-emerald-400" />
          Active Keys ({activeKeys.length})
        </h2>
        {activeKeys.length === 0 ? (
          <p className="text-sm text-slate-500">No active API keys. Create one to get started.</p>
        ) : (
          activeKeys.map(k => (
            <div key={k.id} className="flex items-center justify-between rounded-lg bg-slate-800/50 border border-slate-700/50 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{k.name}</p>
                <p className="text-xs text-slate-500 font-mono">{k.prefix}</p>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <Clock size={10} />
                  {k.expires_at
                    ? `Expires ${new Date(k.expires_at).toLocaleDateString()}`
                    : "Never expires"}
                  {k.last_used_at && ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}`}
                </p>
              </div>
              <button
                onClick={() => revokeKey(k.id, k.name)}
                className="p-2 rounded-md text-red-400 hover:bg-red-900/20 shrink-0 ml-2"
                title="Revoke key"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Revoked / Expired keys */}
      {expiredOrRevoked.length > 0 && (
        <div className="card p-6 space-y-4 opacity-60">
          <h2 className="text-lg font-bold text-white">Inactive Keys ({expiredOrRevoked.length})</h2>
          {expiredOrRevoked.map(k => (
            <div key={k.id} className="flex items-center justify-between rounded-lg bg-slate-800/30 border border-slate-700/30 p-3">
              <div>
                <p className="text-sm text-slate-400">{k.name}</p>
                <p className="text-xs text-slate-600 font-mono">{k.prefix}</p>
                <p className="text-xs text-slate-600">
                  {k.is_expired ? "Expired" : "Revoked"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Usage example */}
      <div className="card p-6 space-y-3">
        <h2 className="text-lg font-bold text-white">Usage</h2>
        <pre className="text-xs text-slate-300 bg-slate-950 rounded p-3 overflow-x-auto border border-slate-800">
{`curl -X POST http://localhost:8000/api/videos/import \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"source_url":"https://youtube.com/watch?v=...","platform":"youtube_shorts"}'`}
        </pre>
      </div>
    </div>
  )
}
