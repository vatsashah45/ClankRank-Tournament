"use client";

import { ROUND_SCHEDULE, CHAMPIONSHIP_VENUE, TOURNAMENT_SCHEDULE } from "@clankrank/shared";
import type { TournamentState } from "@clankrank/shared";

interface ScheduleTimelineProps {
  currentState?: TournamentState;
}

function formatDateTime(value: string | undefined): string {
  if (!value || value === "TBD") return "TBD";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ScheduleTimeline({ currentState }: ScheduleTimelineProps) {
  const isVenueRound = (round: string) => round === "SF" || round === "CHAMPIONSHIP";

  const getNodeStatus = (round: string): "past" | "current" | "future" => {
    if (!currentState) return "future";
    const stateOrder = [
      "REGISTRATION",
      "QUALIFICATION",
      "R64",
      "R32",
      "R16",
      "QF",
      "SF",
      "CHAMPIONSHIP",
      "COMPLETE",
    ];
    const roundIdx = stateOrder.indexOf(round);
    const stateIdx = stateOrder.indexOf(currentState);
    if (currentState === "COMPLETE") return "past";
    if (roundIdx < stateIdx) return "past";
    if (roundIdx === stateIdx) return "current";
    return "future";
  };

  return (
    <div className="rounded-xl border border-[#1b3a5c] bg-[#0d1b2a] p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white uppercase tracking-widest">
          Tournament Schedule
        </h3>
        <p className="text-xs text-[#7b93af] mt-1">
          Qualification closes:{" "}
          <span className="text-[#e8edf3]">
            {formatDateTime(TOURNAMENT_SCHEDULE.QUALIFICATION_END)}
          </span>
          {" · "}
          Seeding Day:{" "}
          <span className="text-[#e8edf3]">
            {formatDateTime(TOURNAMENT_SCHEDULE.SEEDING_DAY)}
          </span>
        </p>
      </div>

      {/* Timeline */}
      <div className="flex items-start gap-0 overflow-x-auto pb-2">
        {ROUND_SCHEDULE.map((entry, idx) => {
          const status = getNodeStatus(entry.round);
          const isLast = idx === ROUND_SCHEDULE.length - 1;

          return (
            <div key={entry.round} className="flex items-center flex-shrink-0">
              {/* Node */}
              <div className="flex flex-col items-center">
                {/* Circle */}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    status === "current"
                      ? "bg-[#3b82f6] border-[#60a5fa] text-white ring-2 ring-[#3b82f6] ring-offset-2 ring-offset-[#0d1b2a]"
                      : status === "past"
                      ? "bg-[#162a44] border-[#1b3a5c] text-[#7b93af]"
                      : "bg-[#0d1b2a] border-[#1b3a5c] text-[#5a7a9c]"
                  }`}
                >
                  {idx + 1}
                </div>

                {/* Label block */}
                <div className="mt-2 text-center w-24">
                  <div
                    className={`text-xs font-semibold leading-tight ${
                      status === "current"
                        ? "text-[#60a5fa]"
                        : status === "past"
                        ? "text-[#5a7a9c]"
                        : "text-[#7b93af]"
                    }`}
                  >
                    {entry.displayName}
                  </div>
                  <div className="text-xs text-[#5a7a9c] mt-0.5">
                    {entry.round}
                  </div>
                  {isVenueRound(entry.round) && (
                    <div className="text-xs text-[#5a7a9c] mt-0.5 leading-tight">
                      {CHAMPIONSHIP_VENUE.city}, {CHAMPIONSHIP_VENUE.state}
                    </div>
                  )}
                </div>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={`w-8 h-0.5 mt-[-20px] flex-shrink-0 ${
                    status === "past" ? "bg-[#1b3a5c]" : "bg-[#162a44]"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
