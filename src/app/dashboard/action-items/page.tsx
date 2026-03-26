"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { CheckSquare, ListChecks } from "lucide-react";

const ITEMS_PER_PAGE = 10;

type ActionItemTab = "all" | "high_priority" | "my_items" | "this_week";

type ActionItemRow = {
  id: string;
  task: string;
  owner: string;
  dueDate: string;
  priority: string;
  meetingTitle: string;
  meetingId: string;
  createdAt: string;
};

type ActionItemsResponse = {
  success: true;
  items: ActionItemRow[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function getEmptyStateCopy(activeTab: ActionItemTab) {
  switch (activeTab) {
    case "high_priority":
      return {
        title: "No high priority items",
        description: "High priority tasks from your meetings will appear here",
        icon: ListChecks
      };
    case "my_items":
      return {
        title: "No items assigned to you",
        description: "Items where your name is mentioned as owner will appear here",
        icon: ListChecks
      };
    case "this_week":
      return {
        title: "No items from this week",
        description: "Record meetings this week to see tasks here",
        icon: ListChecks
      };
    default:
      return {
        title: "No action items yet",
        description: "Record a meeting to automatically extract tasks",
        icon: CheckSquare
      };
  }
}

export default function ActionItemsPage() {
  const { user } = useUser();
  const [items, setItems] = useState<ActionItemRow[]>([]);
  const [activeTab, setActiveTab] = useState<ActionItemTab>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: ITEMS_PER_PAGE,
    totalPages: 1
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadItems() {
      if (!user) {
        if (isMounted) {
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setLoadError(null);
      setUpgradeRequired(false);

      try {
        const params = new URLSearchParams({
          tab: activeTab,
          page: String(currentPage),
          limit: String(ITEMS_PER_PAGE),
          firstName: user.firstName || ""
        });
        const response = await fetch(`/api/action-items?${params.toString()}`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as
          | ActionItemsResponse
          | {
              success?: false;
              message?: string;
            };

        if (!isMounted) {
          return;
        }

        if (!response.ok || !("success" in payload) || payload.success !== true) {
          if (response.status === 403) {
            setUpgradeRequired(true);
            setLoadError(null);
            return;
          }
          throw new Error("message" in payload ? payload.message || "Failed to load action items." : "Failed to load action items.");
        }

        setUpgradeRequired(false);
        setItems(payload.items);
        setPagination(payload.pagination);
        setCurrentPage(payload.pagination.page);
      } catch (error) {
        if (isMounted) {
          setItems([]);
          setPagination({
            total: 0,
            page: 1,
            limit: ITEMS_PER_PAGE,
            totalPages: 1
          });
          setLoadError(error instanceof Error ? error.message : "Failed to load action items.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadItems();

    return () => {
      isMounted = false;
    };
  }, [activeTab, currentPage, user]);

  function handleTabChange(tab: ActionItemTab) {
    setActiveTab(tab);
    setCurrentPage(1);
  }

  const emptyState = getEmptyStateCopy(activeTab);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Artiva"
        title="Action Items"
        description="All tasks extracted from your meetings"
      />

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "all" as const, label: "All" },
            { id: "high_priority" as const, label: "High Priority" },
            { id: "my_items" as const, label: "My Items" },
            { id: "this_week" as const, label: "This Week" }
          ].map((filter) => (
            <Button
              key={filter.id}
              type="button"
              variant={activeTab === filter.id ? "default" : "ghost"}
              onClick={() => handleTabChange(filter.id)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-6">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="shimmer h-12 rounded-xl" />
            ))}
          </div>
        </Card>
      ) : upgradeRequired ? (
        <Card className="border-[#fde68a] bg-[#fffbeb] p-6">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b45309]">Locked Feature</p>
            <h2 className="text-2xl font-bold text-[#111827]">Action items require Pro or Elite</h2>
            <p className="max-w-2xl text-sm leading-6 text-[#92400e]">
              Upgrade to view and manage action items extracted from meetings.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/dashboard/billing">
                  Upgrade now
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/dashboard/tools">Keep using tools</Link>
              </Button>
            </div>
          </div>
        </Card>
      ) : loadError ? (
        <EmptyState
          icon={ListChecks}
          title="Unable to load action items"
          description={loadError}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={emptyState.icon}
          title={emptyState.title}
          description={emptyState.description}
        />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[#f9fafb] text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="px-4 py-3 font-semibold">Task</th>
                    <th className="px-4 py-3 font-semibold">Owner</th>
                    <th className="px-4 py-3 font-semibold">Priority</th>
                    <th className="px-4 py-3 font-semibold">Due Date</th>
                    <th className="px-4 py-3 font-semibold">Meeting</th>
                    <th className="px-4 py-3 font-semibold">Date extracted</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, index) => (
                    <tr key={row.id} className={index % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}>
                      <td className="px-4 py-4">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-[#d1d5db]">
                          <CheckSquare className="h-3.5 w-3.5 text-[#d1d5db]" />
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-900">{row.task}</td>
                      <td className="px-4 py-4 text-slate-600">
                        <div className="inline-flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f5f3ff] text-[11px] font-semibold text-[#6c63ff]">
                            {row.owner
                              .split(/\s+/)
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((part) => part[0]?.toUpperCase() || "")
                              .join("") || "U"}
                          </span>
                          <span>{row.owner}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={row.priority === "High" ? "danger" : row.priority === "Low" ? "available" : "pending"}>
                          {row.priority}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{row.dueDate}</td>
                      <td className="px-4 py-4 text-slate-600">
                        <Link href={`/dashboard/meetings/${row.meetingId}`} className="font-medium text-[#111827] hover:text-[#6c63ff]">
                          {row.meetingTitle}
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{formatDate(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Pagination
            currentPage={currentPage}
            totalPages={pagination.totalPages}
            totalItems={pagination.total}
            pageSize={pagination.limit}
            itemLabel="items"
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </div>
  );
}
