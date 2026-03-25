"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { SectionHeader } from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { CheckSquare, ListChecks } from "lucide-react";
import { fetchJoinedMeetings } from "@/features/meetings/api";

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
      return "No high priority items found";
    case "my_items":
      return "No items assigned to you";
    case "this_week":
      return "No items from this week";
    default:
      return "No action items yet";
  }
}

export default function ActionItemsPage() {
  const { user } = useUser();
  const [allItems, setAllItems] = useState<ActionItemRow[]>([]);
  const [activeTab, setActiveTab] = useState<ActionItemTab>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadItems() {
      setIsLoading(true);

      try {
        const meetingSessions = await fetchJoinedMeetings();

        if (!isMounted) {
          return;
        }

        const rows = meetingSessions
          .filter((meeting) => meeting.status === "completed")
          .flatMap((meeting) =>
            meeting.actionItems.map((item, index) => ({
              id: `${meeting.id}-${index}`,
              task: item.task,
              owner: item.owner || "Unassigned",
              dueDate: item.dueDate || item.deadline || "Not specified",
              priority: item.priority || "Medium",
              meetingTitle: meeting.title,
              meetingId: meeting.id,
              createdAt: meeting.createdAt
            }))
          );

        setAllItems(rows);
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
  }, []);

  const filteredItems = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const firstName = user?.firstName?.toLowerCase() || "";

    switch (activeTab) {
      case "high_priority":
        return allItems.filter((item) => item.priority === "High");
      case "my_items":
        return allItems.filter((item) => firstName && item.owner.toLowerCase().includes(firstName));
      case "this_week":
        return allItems.filter((item) => new Date(item.createdAt) >= sevenDaysAgo);
      default:
        return allItems;
    }
  }, [activeTab, allItems, user?.firstName]);

  const totalPages = Math.max(Math.ceil(filteredItems.length / ITEMS_PER_PAGE), 1);
  const paginatedItems = filteredItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  function handleTabChange(tab: ActionItemTab) {
    setActiveTab(tab);
    setCurrentPage(1);
  }

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
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={getEmptyStateCopy(activeTab)}
          description={
            activeTab === "my_items"
              ? "No items assigned to you yet"
              : activeTab === "all"
                ? "No action items yet. Complete a meeting to see tasks here."
                : "Action items matching this filter will appear here."
          }
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
                  {paginatedItems.map((row, index) => (
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
            totalPages={totalPages}
            totalItems={filteredItems.length}
            pageSize={ITEMS_PER_PAGE}
            itemLabel="items"
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </div>
  );
}
