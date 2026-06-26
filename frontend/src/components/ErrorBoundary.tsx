"use client"

import { Component, ReactNode } from "react"

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: any) {
    console.error("ErrorBoundary caught:", error, info)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-8">
          <div className="text-6xl mb-4">⚠</div>
          <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
          <p className="text-slate-400 mb-4 text-sm">
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload() }}
            className="btn-primary px-6 py-2"
          >
            Reload Page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
