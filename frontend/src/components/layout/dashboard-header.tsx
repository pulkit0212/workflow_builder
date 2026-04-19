"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, FileText, Loader2, Search, Video, X } from "lucide-react";
import { DashboardAccount, type DashboardProfile } from "@/components/layout/dashboard-account";
import { DashboardMobileNav } from "@/components/layout/dashboard-mobile-nav";
import { hasClerkPublishableKey } from "@/lib/auth/clerk-env";
import { cn } from "@/lib/utils";

const pageTitles: Array<{ match: (pathname: string) => boolean; title: string }> = [
  { match: (pathname) => pathname === "/dashboard", title: "Dashboard" },
  { match: (pathname) => pathname.startsWith("/dashboard/meetings"), title: "Meetings" },
  { match: (pathname) => pathname.startsWith("/dashboard/reports"), title: "Meeting Reports" },
  { match: (pathname) => pathname.startsWith("/dashboard/action-items"), title: "Action Items" },
  { match: (pathname) => pathname.startsWith("/dashboard/history"), title: "History" },
  { match: (pathname) => pathname.startsWith("/dashboard/tools"), title: "Tools" },
  { match: (pathname) => pathname.startsWith("/dashboard/workspace"), title: "Workspaces" },
  { match: (pathname) => pathname.startsWith("/dashboard/settings"), title: "Settings" },
  { match: (pathname) => pathname.startsWith("/dashboard/billing"), title: "Billing" },
  { match: (pathname) => pathname.startsWith("/dashboard/meeting-assistant"), title: "Meeting Assistant" },
];

type SearchResult = {
  type: "run" | "meeting";
  id: string;
  title: string;
  subtitle: string;
  status: string;
  href: string;
  createdAt: string;
};

type DashboardHeaderProps = {
  profile: DashboardProfile;
};

export function DashboardHeader({ profile }: DashboardHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const pageTitle = pageTitles.find((item) => item.match(pathname))?.title ?? "Artivaa";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); setIsOpen(false); return; }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = (await res.json()) as { results?: SearchResult[] };
        setResults(data.results ?? []);
        setIsOpen(true);
      } catch { setResults([]); }
      finally { setIsSearching(false); }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(href: string) {
    setIsOpen(false);
    setQuery("");
    router.push(href);
  }

  function handleClear() {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-[#e5e7eb] bg-white">
      <div className="flex h-16 items-center gap-4 px-4 sm:px-6 lg:px-8">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[24px] font-bold text-[#111827]">{pageTitle}</p>
        </div>

        {/* Search */}
        <div ref={containerRef} className="relative hidden flex-[1.2] justify-center md:flex">
          <div className={cn(
            "flex w-full max-w-xl items-center gap-3 rounded-xl border bg-[#f9fafb] px-4 py-2 transition-all",
            isOpen ? "border-[#6c63ff] bg-white shadow-sm ring-2 ring-[#6c63ff]/20" : "border-[#d1d5db]"
          )}>
            {isSearching
              ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#6c63ff]" />
              : <Search className="h-4 w-4 shrink-0 text-[#9ca3af]" />}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => { if (results.length > 0) setIsOpen(true); }}
              placeholder="Search meetings, runs, summaries..."
              className="w-full border-0 bg-transparent p-0 text-sm text-[#374151] outline-none placeholder:text-[#9ca3af]"
            />
            {query && (
              <button type="button" onClick={handleClear} className="shrink-0 text-[#9ca3af] hover:text-[#374151]">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Dropdown */}
          {isOpen && results.length > 0 && (
            <div className="absolute top-full mt-2 w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {results.length} result{results.length !== 1 ? "s" : ""}
              </div>
              <div className="divide-y divide-slate-50">
                {results.map((result) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    type="button"
                    onClick={() => handleSelect(result.href)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[#faf9ff]"
                  >
                    <div className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                      result.type === "run" ? "bg-[#f5f3ff] text-[#6c63ff]" : "bg-slate-100 text-slate-500"
                    )}>
                      {result.type === "run"
                        ? <FileText className="h-4 w-4" />
                        : <Video className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{result.title}</p>
                      <p className="truncate text-xs text-slate-400">{result.subtitle}</p>
                    </div>
                    <span className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      result.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    )}>
                      {result.type === "run" ? "Run" : "Meeting"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isOpen && !isSearching && results.length === 0 && query.trim().length >= 2 && (
            <div className="absolute top-full mt-2 w-full max-w-xl rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center shadow-xl">
              <p className="text-sm text-slate-400">No results for &ldquo;{query}&rdquo;</p>
            </div>
          )}
        </div>

        <div className="flex flex-1 items-center justify-end gap-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#6b7280] transition-colors hover:bg-[#f9fafb] hover:text-[#111827]"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </button>
          {hasClerkPublishableKey ? (
            <DashboardAccount initialProfile={profile} compact />
          ) : (
            <div className="rounded-full border border-[#e5e7eb] bg-white px-3 py-2 text-xs text-slate-500">
              Auth disabled
            </div>
          )}
        </div>
      </div>
      <DashboardMobileNav />
    </header>
  );
}
