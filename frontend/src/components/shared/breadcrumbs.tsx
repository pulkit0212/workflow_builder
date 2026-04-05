import type { Route } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

type BreadcrumbsProps = {
  items: Array<{
    label: string;
    href?: string;
  }>;
};

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <div key={`${item.label}-${index}`} className="flex items-center gap-2">
            {item.href && !isLast ? (
              <Link href={item.href as Route} className="font-medium text-slate-600 hover:text-[#6c63ff]">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "font-medium text-slate-900" : undefined}>{item.label}</span>
            )}
            {!isLast ? <ChevronRight className="h-4 w-4 text-slate-400" /> : null}
          </div>
        );
      })}
    </nav>
  );
}
