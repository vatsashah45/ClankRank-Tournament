import Link from "next/link";
import { AgentDetailPanel } from "@/components/AgentDetailPanel";

interface AgentPageProps {
  params: {
    agentId: string;
  };
}

/**
 * Full-page agent detail view.
 * Shows AgentDetailPanel with a "Back to Bracket" navigation link.
 */
export default function AgentDetailPage({ params }: AgentPageProps) {
  const agentId = decodeURIComponent(params.agentId);

  return (
    <div>
      {/* Navigation */}
      <div className="mb-6">
        <Link
          href="/tournament"
          className="inline-flex items-center gap-2 text-sm text-[#7b93af] hover:text-white transition-colors"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M10 12L6 8l4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to Bracket
        </Link>
      </div>

      <AgentDetailPanel agentId={agentId} />
    </div>
  );
}
