import Link from "next/link";

export function LogoMark() {
  return (
    <Link href="/" className="inline-flex items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]">
        AI
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-600">Artiva</span>
        <span className="text-sm text-slate-500">From meetings to meaningful work.</span>
      </span>
    </Link>
  );
}
