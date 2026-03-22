export default function TournamentLoading() {
  return (
    <div>
      {/* Header skeleton */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="h-9 w-64 bg-[#0d1b2a] rounded animate-pulse mb-2" />
          <div className="h-5 w-96 bg-[#0d1b2a] rounded animate-pulse" />
        </div>
      </div>

      {/* Status bar skeleton */}
      <div className="flex items-center gap-4 mb-6 px-4 py-3 bg-[#0d1b2a] border border-[#1b3a5c] rounded-xl">
        <div className="h-5 w-24 bg-[#162a44] rounded animate-pulse" />
        <div className="h-5 w-32 bg-[#162a44] rounded animate-pulse" />
        <div className="h-5 w-20 bg-[#162a44] rounded animate-pulse ml-auto" />
      </div>

      {/* Bracket skeleton */}
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-[#0d1b2a] border border-[#1b3a5c] rounded-lg" />
            ))}
          </div>
          <div className="space-y-3 flex flex-col items-center justify-center">
            <div className="h-16 w-full bg-[#0d1b2a] border border-[#1b3a5c] rounded-lg" />
            <div className="h-16 w-full bg-[#0d1b2a] border border-[#1b3a5c] rounded-lg" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-[#0d1b2a] border border-[#1b3a5c] rounded-lg" />
            ))}
          </div>
        </div>
      </div>

      {/* Schedule skeleton */}
      <div className="mt-10 pt-6 border-t border-[#1b3a5c]">
        <div className="h-4 w-40 bg-[#0d1b2a] rounded animate-pulse mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 bg-[#0d1b2a] border border-[#1b3a5c] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
