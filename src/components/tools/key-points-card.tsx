import { ResultSection } from "@/components/tools/result-section";

type KeyPointsCardProps = {
  items: string[];
};

export function KeyPointsCard({ items }: KeyPointsCardProps) {
  return (
    <ResultSection title="Key Points" description="Main decisions, concerns, and discussion themes.">
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-700">
            {item}
          </li>
        ))}
      </ul>
    </ResultSection>
  );
}
