import Link from "next/link";

export function LogoMark() {
  return (
    <Link href="/" className="inline-flex items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold text-white">
        AI
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-600">Workflow Builder</span>
        <span className="text-sm text-slate-500">AI productivity operating system</span>
      </span>
    </Link>
  );
}
