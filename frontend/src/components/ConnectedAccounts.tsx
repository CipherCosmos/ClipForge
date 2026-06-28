"use client"

import { useState, useEffect } from "react"
import { accountsAPI } from "@/lib/api"
import { Plus, Trash2, Key, Loader2, ExternalLink, ChevronDown, ChevronUp, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Account {
  id: string
  platform: string
  label: string
  access_token_masked: string
  is_active: boolean
}

interface PlatformGuide {
  label: string
  color: string
  icon: string
  guideUrl: string
  guideLabel: string
  steps: string[]
  note: string
}

const PLATFORM_GUIDES: Record<string, PlatformGuide> = {
  youtube_shorts: {
    label: "YouTube Shorts",
    color: "text-red-400",
    icon: "▶",
    guideUrl: "https://console.cloud.google.com/apis/credentials",
    guideLabel: "Google Cloud Console",
    steps: [
      "Go to Google Cloud Console → APIs & Services → Library",
      "Search for 'YouTube Data API v3' and ENABLE it",
      "Go to APIs & Services → Credentials → Create Credentials → OAuth client ID",
      "Application type: Web application. Name: ClipForge",
      "Under 'Authorized redirect URIs', click ADD URI and enter exactly:",
      "  https://developers.google.com/oauthplayground",
      "Click Create. COPY your Client ID and Client Secret (you'll paste them below)",
      "Go to OAuth consent screen → User Type: External → Create",
      "Add your email (svm.singh.01@gmail.com) as a Test User → Save",
      "Visit https://developers.google.com/oauthplayground",
      "Click the gear icon (⚙️) → check 'Use your own OAuth credentials' → paste Client ID + Secret",
      "On the left panel, under 'YouTube Data API v3', select 'https://www.googleapis.com/auth/youtube.upload'",
      "Click 'Authorize APIs' → sign in with svm.singh.01@gmail.com → click Continue",
      "Click 'Exchange authorization code for tokens'",
      "Copy the 'Refresh token' value (starts with 1//...) and paste it below",
    ],
    note: "We only need a Refresh Token. The system automatically exchanges it for short-lived access tokens when publishing. It never expires unless revoked. If you see 'redirect_uri_mismatch', make sure 'https://developers.google.com/oauthplayground' is EXACTLY in your authorized redirect URIs.",
  },
  tiktok: {
    label: "TikTok",
    color: "text-pink-400",
    icon: "♫",
    guideUrl: "https://developers.tiktok.com/apps",
    guideLabel: "TikTok Developer Portal",
    steps: [
      "Go to TikTok for Developers → Create a new app",
      "Fill in the required fields (name, description, etc.)",
      "Under 'Permissions', enable 'Video Upload'",
      "Once created, go to your app's detail page",
      "Find the 'Access Token' section and click 'Generate'",
      "Copy the generated token (starts with clt. or ttk.)",
      "Paste it below",
    ],
    note: "TikTok access tokens expire after a few hours. You'll need to generate a new one from the developer portal before each publishing session.",
  },
  instagram_reels: {
    label: "Instagram Reels",
    color: "text-purple-400",
    icon: "📷",
    guideUrl: "https://developers.facebook.com/docs/instagram-basic-display-api/getting-started",
    guideLabel: "Meta for Developers",
    steps: [
      "Go to Facebook Developers → Create App → Type: Business",
      "Add Instagram Basic Display product to your app",
      "Go to Instagram Basic Display → configure the OAuth redirect URI",
      "Go to App Review → add Instagram test users (your Instagram account must be a Business or Creator account)",
      "Use the Instagram Basic Display API to generate an access token (requires OAuth flow with your test user)",
      "Copy the generated User Access Token (long-lived, expires in 60 days)",
      "Paste it below",
    ],
    note: "Instagram requires a Business or Creator account. Personal accounts cannot publish via API. Tokens last 60 days — refresh by re-authenticating.",
  },
  linkedin: {
    label: "LinkedIn Video",
    color: "text-blue-400",
    icon: "🔗",
    guideUrl: "https://www.linkedin.com/developers/apps",
    guideLabel: "LinkedIn Developer Portal",
    steps: [
      "Go to LinkedIn Developer Portal → Create App",
      "Fill in app name (e.g. ClipForge), company page, and privacy policy URL",
      "Under 'Product' tab, add 'Share on LinkedIn'",
      "Go to 'Auth' tab → find 'OAuth 2.0 tokens'",
      "Click 'Generate token' — you'll be asked to authorize",
      "Copy the generated Access Token",
      "Paste it below",
    ],
    note: "LinkedIn access tokens expire after 12 months. Generate a new one from the developer portal when needed.",
  },
}

export function ConnectedAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [platform, setPlatform] = useState("youtube_shorts")
  const [showGuide, setShowGuide] = useState(false)
  const [label, setLabel] = useState("")
  const [token, setToken] = useState("")
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const fetchAccounts = async () => {
    try {
      const res = await accountsAPI.list()
      setAccounts(res.data || [])
    } catch {
      setError("Failed to load accounts")
    }
    setLoading(false)
  }

  useEffect(() => { fetchAccounts() }, [])

  const currentGuide = PLATFORM_GUIDES[platform]

  const handleAdd = async () => {
    if (!token.trim()) return
    setSaving(true)
    setError("")
    try {
      const payload: any = {
        platform,
        label: label || currentGuide.label,
        access_token: token,
      }
      if (platform === "youtube_shorts") {
        payload.client_id = clientId
        payload.client_secret = clientSecret
      }
      await accountsAPI.create(payload)
      setShowForm(false)
      setToken("")
      setClientId("")
      setClientSecret("")
      setLabel("")
      fetchAccounts()
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to add account")
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this connected account?")) return
    try {
      await accountsAPI.delete(id)
      fetchAccounts()
    } catch {
      setError("Failed to remove account")
    }
  }

  if (loading) return (
    <Card size="sm">
      <CardContent className="flex items-center justify-center py-6">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  )

  return (
    <Card className="py-0">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Key size={20} className="text-brand-400" />
            <h2 className="text-lg font-bold text-foreground">Connected Accounts</h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setShowForm(!showForm); setShowGuide(false) }}>
            <Plus size={14} /> Add Account
          </Button>
        </div>

        {accounts.length === 0 && !showForm && (
          <div className="rounded-lg border border-border bg-muted/30 p-6 text-center">
            <p className="text-sm text-muted-foreground mb-4">No accounts connected yet.</p>
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus size={14} /> Connect Your First Account
            </Button>
          </div>
        )}

        {showForm && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Platform</Label>
                <Select value={platform} onValueChange={(v) => { if (v) { setPlatform(v); setShowGuide(false) } }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PLATFORM_GUIDES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Label</Label>
                <Input value={label} onChange={e => setLabel(e.target.value)} placeholder={currentGuide.label} />
              </div>
            </div>

            <button onClick={() => setShowGuide(!showGuide)}
              className="inline-flex items-center gap-2 text-xs text-brand-400 hover:text-brand-300 transition-colors">
              <ExternalLink size={12} />
              {showGuide ? "Hide" : "Show"} detailed setup guide for {currentGuide.label}
              {showGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showGuide && (
              <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-4 space-y-3">
                <p className="text-xs font-semibold text-brand-400">How to connect your {currentGuide.label} account:</p>
                <ol className="list-decimal list-inside space-y-2">
                  {currentGuide.steps.map((step, i) => (
                    <li key={i} className="text-xs text-foreground leading-relaxed">{step}</li>
                  ))}
                </ol>
                <div className="flex items-start gap-2 rounded-md bg-amber-900/20 border border-amber-700/30 p-3 text-xs text-amber-400">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <p>{currentGuide.note}</p>
                </div>
                <a href={currentGuide.guideUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mt-1">
                  <ExternalLink size={12} />
                  Open {currentGuide.guideLabel} (new tab)
                </a>
              </div>
            )}

            {platform === "youtube_shorts" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Client ID</Label>
                  <Input type="password" value={clientId} onChange={e => setClientId(e.target.value)}
                    className="font-mono text-[11px]" placeholder="From Google Cloud Console" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Client Secret</Label>
                  <Input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)}
                    className="font-mono text-[11px]" placeholder="From Google Cloud Console" />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {platform === "youtube_shorts" ? "Refresh Token" : "Access Token"} <span className="text-red-400">*</span>
              </Label>
              <Input type="password" value={token} onChange={e => setToken(e.target.value)}
                className="font-mono text-[11px]"
                placeholder={platform === "youtube_shorts" ? "Paste your Refresh Token (1//...)" : "Paste your API token here..."} />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={saving || !token} size="sm" className="flex-1">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {saving ? "Connecting..." : `Connect ${currentGuide.label}`}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setShowGuide(false) }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {accounts.length > 0 && (
          <div className="space-y-2">
            {accounts.map(a => {
              const g = PLATFORM_GUIDES[a.platform]
              return (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn("text-lg shrink-0", g?.color || "text-muted-foreground")}>{g?.icon || "🔗"}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{a.label}</p>
                      <p className="text-xs text-muted-foreground/70">{g?.label} · {a.access_token_masked}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon-xs" onClick={() => handleDelete(a.id)}
                    className="text-red-400 hover:text-red-400 hover:bg-red-900/20 shrink-0 ml-2">
                    <Trash2 size={14} />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
