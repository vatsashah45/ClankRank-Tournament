"use client";

export function LiveIndicator({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0"
        style={{ boxShadow: "0 0 6px rgba(74, 222, 128, 0.5)" }}
        aria-hidden="true"
      />
      {!compact && (
        <span className="text-[9px] font-bold text-green-400 animate-live tracking-[0.15em] uppercase">
          Live
        </span>
      )}
    </span>
  );
}
