"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  itemLabel?: string;
};

function getPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);

  for (const page of Array.from(pages)) {
    if (page < 1 || page > totalPages) {
      pages.delete(page);
    }
  }

  return Array.from(pages).sort((left, right) => left - right);
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems = 0,
  pageSize = 0,
  itemLabel = "items"
}: PaginationProps) {
  if (totalPages <= 1) {
    if (!totalItems || !pageSize) {
      return null;
    }

    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[#6b7280]">
          Showing 1-{Math.min(totalItems, pageSize)} of {totalItems} {itemLabel}
        </p>
      </div>
    );
  }

  const pageNumbers = getPageNumbers(currentPage, totalPages);
  const start = totalItems && pageSize ? (currentPage - 1) * pageSize + 1 : 0;
  const end = totalItems && pageSize ? Math.min(currentPage * pageSize, totalItems) : 0;

  return (
    <div className="flex flex-col gap-4 border-t border-[#e5e7eb] pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-[#6b7280]">
        {totalItems && pageSize ? `Showing ${start}-${end} of ${totalItems} ${itemLabel}` : `${totalPages} pages`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>
          Previous
        </Button>
        {pageNumbers.map((page, index) => {
          const previous = pageNumbers[index - 1];
          const showEllipsis = previous && page - previous > 1;

          return (
            <div key={page} className="flex items-center gap-2">
              {showEllipsis ? <span className="px-1 text-sm text-[#9ca3af]">...</span> : null}
              <button
                type="button"
                onClick={() => onPageChange(page)}
                className={cn(
                  "inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors",
                  page === currentPage
                    ? "border-transparent bg-[#6c63ff] text-white"
                    : "border-[#d1d5db] bg-white text-[#6b7280] hover:bg-[#f9fafb] hover:text-[#111827]"
                )}
              >
                {page}
              </button>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
