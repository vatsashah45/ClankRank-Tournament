const TIER_COLORS: Record<string, string> = {
  AAA: "#20808D",
  AA: "#115058",
  A: "#35D07F",
  BAA: "#627EEA",
  BA: "#FFC553",
  B: "#FF6B35",
  CAA: "#A84B2F",
  CA: "#944454",
  C: "#091717",
};

export function TierBadge({ tier, score, size = "md" }: { tier: string; score?: number; size?: "sm" | "md" }) {
  const color = TIER_COLORS[tier] ?? TIER_COLORS.C;
  const isSmall = size === "sm";

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded font-bold ${
        isSmall ? "px-1 py-px text-[9px] leading-tight" : "px-1.5 py-0.5 text-[11px]"
      }`}
      style={{ backgroundColor: `${color}30`, color, border: `1px solid ${color}40` }}
    >
      {tier}
      {score !== undefined && <span className="font-normal opacity-70">({score})</span>}
    </span>
  );
}
