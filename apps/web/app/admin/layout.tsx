"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { StateBar } from "@/components/admin/StateBar";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: "⊞" },
  { href: "/admin/entries", label: "Entries", icon: "☰" },
  { href: "/admin/qualification", label: "Qualification", icon: "⚡" },
  { href: "/admin/bracket", label: "Bracket", icon: "🏆" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Login page renders without the sidebar layout
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  const handleLogout = () => {
    // Clear the admin-token cookie
    document.cookie = "admin-token=; path=/; max-age=0; samesite=strict";
    router.push("/admin/login");
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0d1b2a] border-r border-[#1b3a5c] flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1b3a5c]">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-white">🏀 ClankRank</span>
          </div>
          <div className="mt-1.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-red-600 text-white text-xs font-bold uppercase tracking-widest">
              ADMIN
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-[#162a44] text-white border border-[#1b3a5c]"
                  : "text-[#7b93af] hover:text-white hover:bg-[#162a44]/60"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Footer: Back to main site + Logout */}
        <div className="px-3 py-4 border-t border-[#1b3a5c] space-y-1">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#5a7a9c] hover:text-[#e8edf3] hover:bg-[#162a44]/60 transition-colors"
          >
            <span className="text-base">←</span>
            Back to Main Site
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#5a7a9c] hover:text-red-400 hover:bg-red-900/20 transition-colors text-left"
          >
            <span className="text-base">⎋</span>
            Logout
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* StateBar */}
        <StateBar />

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
