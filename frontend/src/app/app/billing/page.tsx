"use client"

import { useState, useEffect } from "react"
import api from "@/lib/api"
import { Check, ArrowLeft, Loader2, AlertCircle, CreditCard, Zap, Shield } from "lucide-react"
import { useRouter } from "next/navigation"

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
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
      </div>
    )
  }

  if (billingNotConfigured) {
    return (
      <div className="animate-fade-in space-y-8 max-w-2xl mx-auto">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/app")} className="btn-ghost -ml-2">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Billing</h1>
            <p className="mt-1 text-sm text-slate-400">Manage your subscription</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-slate-700/50 bg-slate-800/30 px-6 py-16 text-center">
          <CreditCard size={40} className="mb-4 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-300">Billing Not Configured</h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            Stripe billing is not yet configured on this instance. Set the
            required environment variables to enable upgrades.
          </p>
          <p className="mt-4 text-xs text-slate-600">
            Required: <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">STRIPE_SECRET_KEY</code>,{" "}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">STRIPE_PUBLISHABLE_KEY</code>,{" "}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono">STRIPE_WEBHOOK_SECRET</code>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <button onClick={() => router.push("/app")} className="btn-ghost -ml-2">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Billing</h1>
          <p className="mt-1 text-sm text-slate-400">Manage your subscription and plan</p>
        </div>
      </div>

      {/* Current plan status */}
      {subscription && (
        <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                isPro ? "bg-brand-500/10 text-brand-400" : "bg-slate-700/50 text-slate-400"
              }`}>
                {isPro ? <Zap size={20} /> : <Shield size={20} />}
              </div>
              <div>
                <p className="text-sm text-slate-400">Current Plan</p>
                <p className="text-lg font-bold text-white">{currentPlanName}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-sm ${subscription.active ? "text-emerald-400" : "text-slate-500"}`}>
                {subscription.active ? "Active" : "Inactive"}
              </p>
              {subscription.current_period_end && (
                <p className="text-xs text-slate-500">
                  {subscription.cancel_at_period_end
                    ? `Ends ${new Date(subscription.current_period_end).toLocaleDateString()}`
                    : `Renews ${new Date(subscription.current_period_end).toLocaleDateString()}`}
                </p>
              )}
            </div>
          </div>
          {isPro && (
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleManageSubscription}
                disabled={actionLoading}
                className="btn-primary text-sm"
              >
                {actionLoading ? "Loading..." : "Manage Subscription"}
              </button>
              <button
                onClick={handleCancel}
                disabled={actionLoading || subscription.cancel_at_period_end}
                className="btn-ghost text-sm text-red-400 hover:bg-red-900/20"
              >
                Cancel at Period End
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-900/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
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
              <div
                key={plan.id}
                className={`relative rounded-xl border p-6 transition-all ${
                  isCurrentPlan
                    ? "border-brand-500/50 bg-brand-500/5"
                    : isPopular
                    ? "border-brand-500/30 bg-slate-800/50"
                    : "border-slate-700/50 bg-slate-800/30"
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-500 px-3 py-0.5 text-xs font-semibold text-white">
                    Most Popular
                  </div>
                )}

                <div className="mb-4">
                  <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                  <p className="mt-2 text-3xl font-bold text-white">
                    {plan.price === 0 ? "Free" : plan.price_display}
                  </p>
                  {plan.price === 0 && (
                    <p className="text-xs text-slate-500 mt-1">No credit card required</p>
                  )}
                </div>

                <ul className="mb-6 space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <Check size={16} className="mt-0.5 shrink-0 text-emerald-400" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {plan.id !== "free" && (
                  <button
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={actionLoading || isCurrentPlan}
                    className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                      isCurrentPlan
                        ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                        : "bg-brand-500 text-white hover:bg-brand-600"
                    }`}
                  >
                    {isCurrentPlan ? "Current Plan" : "Upgrade"}
                  </button>
                )}

                {plan.id === "free" && isPro && (
                  <p className="text-center text-xs text-slate-500 mt-3">
                    You have access to all Pro features
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Feature comparison */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
        <h2 className="text-lg font-bold text-white mb-4">Feature Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left py-3 px-4 text-slate-400 font-medium">Feature</th>
                <th className="text-center py-3 px-4 text-slate-400 font-medium">Free</th>
                <th className="text-center py-3 px-4 text-slate-400 font-medium">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              <tr>
                <td className="py-3 px-4 text-slate-300">Max Videos</td>
                <td className="text-center py-3 px-4 text-slate-400">5</td>
                <td className="text-center py-3 px-4 text-brand-400 font-medium">1000</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-300">Max Resolution</td>
                <td className="text-center py-3 px-4 text-slate-400">720p</td>
                <td className="text-center py-3 px-4 text-brand-400 font-medium">4K</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-300">Watermark</td>
                <td className="text-center py-3 px-4 text-slate-400">Yes</td>
                <td className="text-center py-3 px-4 text-brand-400 font-medium">No</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-300">Exports Per Day</td>
                <td className="text-center py-3 px-4 text-slate-400">3</td>
                <td className="text-center py-3 px-4 text-brand-400 font-medium">1000</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-300">API Access</td>
                <td className="text-center py-3 px-4 text-slate-400">Limited</td>
                <td className="text-center py-3 px-4 text-brand-400 font-medium">Unlimited</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-300">Priority Processing</td>
                <td className="text-center py-3 px-4 text-slate-400">
                  <span className="text-slate-600">—</span>
                </td>
                <td className="text-center py-3 px-4 text-emerald-400">
                  <Check size={16} className="inline" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
