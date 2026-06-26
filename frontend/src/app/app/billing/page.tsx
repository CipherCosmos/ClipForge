"use client"

import { useState, useEffect } from "react"
import api from "@/lib/api"
import { Check, ArrowLeft, Loader2, AlertCircle, CreditCard, Zap, Shield, HelpCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { cn } from "@/lib/utils"

interface PlanInfo {
  id: string
  name: string
  price: number
  price_display: string
  features: string[]
}

interface PlansResponse {
  free: PlanInfo
  pro_monthly: PlanInfo
  pro_yearly: PlanInfo
}

interface SubscriptionStatus {
  active: boolean
  plan: string
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
}

export default function BillingPage() {
  const router = useRouter()
  const [plans, setPlans] = useState<PlansResponse | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState("")
  const [billingNotConfigured, setBillingNotConfigured] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [plansRes, subRes] = await Promise.allSettled([
        api.get("/billing/plans"),
        api.get("/billing/subscription"),
      ])

      if (plansRes.status === "fulfilled") {
        setPlans(plansRes.value.data)
      } else {
        const err: any = plansRes.reason
        if (err?.response?.status === 501) {
          setBillingNotConfigured(true)
        }
      }

      if (subRes.status === "fulfilled") {
        setSubscription(subRes.value.data)
      }
    } catch {
      setBillingNotConfigured(true)
    } finally {
      setLoading(false)
    }
  }

  const handleUpgrade = async (priceId: string) => {
    setActionLoading(true)
    setError("")
    try {
      const res = await api.post("/billing/create-checkout-session", {
        price_id: priceId,
        success_url: `${window.location.origin}/app/billing?success=true`,
        cancel_url: `${window.location.origin}/app/billing?canceled=true`,
      })
      window.location.href = res.data.url
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to start checkout")
      setActionLoading(false)
    }
  }

  const handleManageSubscription = async () => {
    setActionLoading(true)
    setError("")
    try {
      const res = await api.post("/billing/create-portal-session")
      window.location.href = res.data.url
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to open customer portal")
      setActionLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!confirm("Cancel your subscription? You'll lose Pro features at the end of the billing period.")) return
    setActionLoading(true)
    setError("")
    try {
      await api.post("/billing/cancel")
      await fetchData()
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to cancel subscription")
    } finally {
      setActionLoading(false)
    }
  }

  const isPro = subscription?.active
  const currentPlanName = isPro
    ? subscription?.plan === "pro_yearly" ? "Pro Yearly" : "Pro Monthly"
    : "Free"

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
        <span>Loading billing details...</span>
      </div>
    )
  }

  if (billingNotConfigured) {
    return (
      <div className="animate-fade-in space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3.5 border-b border-border pb-5">
          <Button variant="outline" size="icon" onClick={() => router.push("/app")} className="h-9 w-9 rounded-lg border-border bg-card">
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Billing</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Manage your plans and billing details</p>
          </div>
        </div>

        <Card className="border border-dashed border-border bg-card/15 py-12 px-6 text-center">
          <CardContent className="flex flex-col items-center max-w-md mx-auto space-y-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <CreditCard size={26} />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-foreground">Stripe Integration Pending</h2>
              <p className="text-xs sm:text-sm text-muted-foreground/90 leading-relaxed">
                Stripe payment keys are not configured on this instance. Configure the required environment secrets in the backend config to enable tier upgrades.
              </p>
            </div>
            <div className="w-full bg-muted/65 border border-border/40 p-3 rounded-xl text-left space-y-1">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Required Environment Variables</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"].map(v => (
                  <code key={v} className="text-[10px] font-mono font-bold bg-background border border-border/40 px-2 py-0.5 rounded text-foreground">{v}</code>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3.5 border-b border-border pb-5">
        <Button variant="outline" size="icon" onClick={() => router.push("/app")} className="h-9 w-9 rounded-lg border-border bg-card shrink-0">
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Subscription Plans</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Manage your plan options, invoicing history, and Stripe portal details.</p>
        </div>
      </div>

      {/* Subscription Card Indicator */}
      {subscription && (
        <Card className={cn(
          "border border-border/60 overflow-hidden bg-card/40 backdrop-blur-md border-l-4",
          isPro ? "border-l-brand-500" : "border-l-muted-foreground/30"
        )}>
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
                isPro ? "bg-brand-500/10 text-brand-400 border-brand-500/25" : "bg-muted text-muted-foreground border-border"
              )}>
                {isPro ? <Zap size={20} /> : <Shield size={20} />}
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Current Active Plan</p>
                <p className="text-base font-bold text-foreground">{currentPlanName}</p>
                {subscription.current_period_end && (
                  <p className="text-xs text-muted-foreground">
                    {subscription.cancel_at_period_end
                      ? `Access ends on ${new Date(subscription.current_period_end).toLocaleDateString()}`
                      : `Renews on ${new Date(subscription.current_period_end).toLocaleDateString()}`}
                  </p>
                )}
              </div>
            </div>

            {isPro && (
              <div className="flex gap-2">
                <Button
                  onClick={handleManageSubscription}
                  disabled={actionLoading}
                  size="sm"
                  className="h-9 text-xs font-semibold shadow-sm"
                >
                  {actionLoading ? "Loading..." : "Manage Plan"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={actionLoading || subscription.cancel_at_period_end}
                  size="sm"
                  className="h-9 text-xs text-destructive hover:bg-destructive/10 border-border bg-card font-semibold"
                >
                  Cancel Plan
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-semibold text-destructive shadow-sm">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Pricing cards */}
      {plans && (
        <div className="grid gap-6 md:grid-cols-3">
          {[plans.free, plans.pro_monthly, plans.pro_yearly].map((plan) => {
            const isCurrentPlan = plan.id === "free" ? !isPro : isPro && plan.name.toLowerCase().includes(currentPlanName.toLowerCase().split(" ")[0]?.toLowerCase() || "")
            const isPopular = plan.id === plans.pro_monthly.id

            return (
              <Card
                key={plan.id}
                className={cn(
                  "border border-border/60 bg-card/40 backdrop-blur-md p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-lg relative hover:bg-card/75",
                  isCurrentPlan && "border-brand-500/50 bg-brand-500/[0.02]",
                  isPopular && !isCurrentPlan && "border-brand-500/30 ring-1 ring-brand-500/10"
                )}
              >
                {isPopular && (
                  <Badge className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-brand-500 text-white border-brand-500 hover:bg-brand-600 text-[10px] font-extrabold uppercase tracking-wider shadow-sm">
                    Most Popular
                  </Badge>
                )}

                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-foreground">{plan.name}</h3>
                    <div className="flex items-baseline gap-1 mt-2.5">
                      <span className="text-3xl font-extrabold text-foreground tracking-tight">
                        {plan.price === 0 ? "Free" : plan.price_display}
                      </span>
                    </div>
                    {plan.price === 0 && (
                      <p className="text-[10px] font-semibold text-muted-foreground mt-1 uppercase tracking-wider">No credit card required</p>
                    )}
                  </div>

                  <ul className="space-y-3 pt-3 border-t border-border/40">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-xs text-muted-foreground/90">
                        <Check size={14} className="mt-0.5 shrink-0 text-emerald-400" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-6 mt-6 border-t border-border/40">
                  {plan.id !== "free" ? (
                    <Button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={actionLoading || isCurrentPlan}
                      className="w-full h-10 text-xs font-semibold shadow-sm"
                      variant={isCurrentPlan ? "outline" : "default"}
                    >
                      {isCurrentPlan ? "Current Plan" : "Upgrade Plan"}
                    </Button>
                  ) : (
                    isPro ? (
                      <p className="text-center text-xs font-semibold text-muted-foreground py-2">
                        You have access to all Pro features
                      </p>
                    ) : (
                      <Button
                        disabled
                        className="w-full h-10 text-xs font-semibold border-border"
                        variant="outline"
                      >
                        Current Plan
                      </Button>
                    )
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Feature comparison table */}
      <Card className="border border-border/60 bg-card/40 backdrop-blur-md overflow-hidden">
        <div className="p-5 pb-3 border-b border-border/40">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Plan Feature Matrix</h2>
          <p className="text-xs text-muted-foreground">Comprehensive comparison of plan parameters and quotas</p>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-b border-border/60">
                <TableHead className="text-foreground font-bold text-xs px-5">Features</TableHead>
                <TableHead className="text-center text-foreground font-bold text-xs">Free Tier</TableHead>
                <TableHead className="text-center text-foreground font-bold text-xs">Pro Tier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { name: "Max Project Uploads", free: "5 per month", pro: "1,000 per month", proHighlight: true },
                { name: "Output Resolution", free: "720p HD", pro: "Up to 4K UHD", proHighlight: true },
                { name: "Watermarks Burned", free: "Yes (mandatory)", pro: "No (fully removed)", proHighlight: true },
                { name: "Exports Per Day", free: "3 exports", pro: "1,000 exports", proHighlight: true },
                { name: "Local API Access", free: "Limited", pro: "Unlimited", proHighlight: true },
                { name: "Queue Priority", free: "Standard processing", pro: "Priority GPU worker speed", proHighlight: false, icon: true },
              ].map((row, idx) => (
                <TableRow key={idx} className="border-b border-border/40 hover:bg-muted/10">
                  <TableCell className="font-semibold text-muted-foreground text-xs px-5">{row.name}</TableCell>
                  <TableCell className="text-center text-muted-foreground/80 text-xs">{row.free}</TableCell>
                  <TableCell className={cn(
                    "text-center text-xs",
                    row.proHighlight ? "text-brand-400 font-bold" : "text-muted-foreground"
                  )}>
                    {row.icon ? (
                      <span className="flex items-center justify-center gap-1 text-emerald-400 font-bold">
                        <Check size={14} /> Priority
                      </span>
                    ) : row.pro}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
