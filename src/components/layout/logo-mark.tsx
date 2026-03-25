import Link from "next/link";

export function LogoMark() {
  return (
    <Link href="/" className="inline-flex items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#6c63ff] text-sm font-bold text-white">
        A
      </span>
      <span className="flex flex-col">
        <span className="text-base font-bold text-[#111827]">Artiva</span>
        <span className="text-xs text-slate-500">Meeting Intelligence</span>
      </span>
    </Link>
  );
}
