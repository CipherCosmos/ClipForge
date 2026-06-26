"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Key, Copy, Check, AlertCircle, Plus, Trash2, Clock, Terminal, ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { authAPI } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

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
  const [copiedCurl, setCopiedCurl] = useState(false)
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

  const curlSnippet = `curl -X POST http://localhost:8000/api/videos/import \\
  -H "Authorization: Bearer ${newKey ? newKey.api_key : 'YOUR_API_KEY'}" \\
  -H "Content-Type: application/json" \\
  -d '{"source_url":"https://youtube.com/watch?v=...","platform":"youtube_shorts"}'`

  return (
    <div className="animate-fade-in space-y-6 w-full max-w-3xl lg:mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3.5 min-w-0">
          <Button variant="outline" size="icon" onClick={() => router.push("/app")} className="h-9 w-9 rounded-lg border-border bg-card shrink-0">
            <ArrowLeft size={16} />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground">API Credentials</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Generate tokens for programmatic integration into ClipForge</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)} size="sm" className="h-9 text-xs font-semibold shadow-md shrink-0">
          <Plus size={14} className="mr-1.5" /> Generate Key
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-semibold text-destructive shadow-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* New Key Alert box */}
      {newKey && (
        <Card className="border border-amber-500/25 bg-amber-500/[0.03] shadow-md animate-scale-in">
          <CardContent className="p-4 space-y-3.5">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-amber-500">Key Created: &ldquo;{newKey.name}&rdquo;</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Make sure to copy your API key now. For security purposes, you will not be able to view this token again.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-background border border-border/40 p-2 rounded-lg">
              <code className="flex-1 break-all text-xs text-foreground font-mono select-all">
                {newKey.api_key}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => {
                  navigator.clipboard.writeText(newKey.api_key)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </Button>
            </div>

            <Button
              variant="link"
              onClick={() => setNewKey(null)}
              className="text-[11px] text-muted-foreground hover:text-foreground h-auto p-0 font-semibold"
            >
              Close this warning
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Creation form */}
      {showCreate && (
        <Card className="border border-border/60 bg-card/40 backdrop-blur-md shadow-md animate-scale-in">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-sm font-bold text-foreground">Create API Key</CardTitle>
            <CardDescription className="text-xs">Configure identifier label and expiration policies</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-3 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Key Label Name</label>
              <Input
                value={keyName}
                onChange={e => setKeyName(e.target.value)}
                placeholder="e.g. CLI Client, GitHub Actions"
                className="bg-background border-border text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Token Expiry</label>
              <Select value={expireDays} onValueChange={(v) => v !== null && setExpireDays(v)}>
                <SelectTrigger className="w-full bg-background border-border text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                  <SelectItem value="">Never expires</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2 border-t border-border/40">
              <Button variant="outline" onClick={() => setShowCreate(false)} className="flex-1 h-9 text-xs bg-background border-border font-semibold">
                Cancel
              </Button>
              <Button onClick={generateKey} disabled={loading || !keyName.trim()} className="flex-1 h-9 text-xs font-semibold">
                {loading ? "Generating..." : "Generate Token"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active keys listing */}
      <Card className="border border-border/60 bg-card/40 backdrop-blur-md overflow-hidden">
        <div className="p-5 pb-3 border-b border-border/40 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Active Credentials</h2>
            <p className="text-xs text-muted-foreground">Tokens currently authorized to interact with the API</p>
          </div>
          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider">
            {activeKeys.length} Active
          </Badge>
        </div>
        <CardContent className="p-5 divide-y divide-border/40 space-y-4">
          {activeKeys.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No active API keys found. Generate a key above to get started.</p>
          ) : (
            activeKeys.map((k, idx) => (
              <div key={k.id} className={cn("flex items-center justify-between gap-4 pt-4 first:pt-0", idx > 0 && "border-t border-border/40")}>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-400" />
                    <p className="text-xs font-bold text-foreground truncate">{k.name}</p>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground/80">
                    <span>Prefix: {k.prefix}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/75 flex items-center gap-1">
                    <Clock size={11} className="text-brand-400" />
                    {k.expires_at
                      ? `Expires ${new Date(k.expires_at).toLocaleDateString()}`
                      : "Never expires"}
                    {k.last_used_at && ` · Last active ${new Date(k.last_used_at).toLocaleDateString()}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => revokeKey(k.id, k.name)}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0 cursor-pointer"
                  title="Revoke Token"
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Revoked / Expired keys */}
      {expiredOrRevoked.length > 0 && (
        <Card className="border border-border/40 bg-card/15 opacity-60 overflow-hidden">
          <div className="p-5 pb-3 border-b border-border/30">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Inactive Keys</h2>
            <p className="text-[10px] text-muted-foreground/70">Keys that have expired or been manually revoked</p>
          </div>
          <CardContent className="p-5 space-y-3.5 divide-y divide-border/20">
            {expiredOrRevoked.map((k, idx) => (
              <div key={k.id} className={cn("flex items-center justify-between gap-4 pt-3.5 first:pt-0")}>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground truncate">{k.name}</p>
                  </div>
                  <p className="text-[10px] font-mono text-muted-foreground/60">{k.prefix}</p>
                  <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider mt-0.5">
                    {k.is_expired ? "Expired" : "Revoked"}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Code Snippet Box */}
      <Card className="border border-border/60 bg-card/40 backdrop-blur-md overflow-hidden">
        <div className="p-5 pb-3 border-b border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-foreground font-bold text-xs uppercase tracking-wider">
            <Terminal size={14} className="text-brand-400" />
            <span>Usage Curl Reference</span>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              navigator.clipboard.writeText(curlSnippet)
              setCopiedCurl(true)
              setTimeout(() => setCopiedCurl(false), 2000)
            }}
            className="text-[10px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1"
          >
            {copiedCurl ? (
              <>
                <Check size={11} className="text-emerald-400" /> Copied
              </>
            ) : (
              <>
                <Copy size={11} /> Copy Code
              </>
            )}
          </Button>
        </div>
        <CardContent className="p-0">
          <pre className="text-[11px] leading-relaxed text-slate-300 bg-[#0e1117] p-4 overflow-x-auto font-mono">
            {curlSnippet}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}
