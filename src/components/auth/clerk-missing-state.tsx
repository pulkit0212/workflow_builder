type ClerkMissingStateProps = {
  title: string;
  description: string;
};

export function ClerkMissingState({ title, description }: ClerkMissingStateProps) {
  return (
    <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-white shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Clerk Not Configured</p>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm leading-7 text-slate-300">{description}</p>
      </div>
      <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
        Required env vars: <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code>CLERK_SECRET_KEY</code>
      </div>
    </div>
  );
}
