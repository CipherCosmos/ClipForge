import { cn } from "@/lib/utils"

export function CardSkeleton() {
  return (
    <div className="card animate-fade-in p-4">
      <div className="skeleton mb-3 aspect-video w-full rounded-lg" />
      <div className="skeleton mb-2 h-4 w-3/4" />
      <div className="skeleton mb-4 h-3 w-1/2" />
      <div className="flex gap-2">
        <div className="skeleton h-8 w-20" />
        <div className="skeleton h-8 w-20" />
      </div>
    </div>
  )
}

export function VideoListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center gap-4">
        <div className="skeleton h-10 w-10 rounded-lg" />
        <div className="skeleton h-6 w-48" />
      </div>
      <div className="skeleton aspect-video w-full rounded-xl" />
      <div className="flex gap-4">
        <div className="skeleton h-20 flex-1 rounded-lg" />
        <div className="skeleton h-20 flex-1 rounded-lg" />
        <div className="skeleton h-20 flex-1 rounded-lg" />
      </div>
    </div>
  )
}
