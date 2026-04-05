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
        <p>
          Set both in <code className="text-slate-200">frontend/.env.local</code>, then restart{" "}
          <code className="text-slate-200">npm run dev</code>:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-slate-400">
          <li>
            <code className="text-slate-200">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> (pk_test_…)
          </li>
          <li>
            <code className="text-slate-200">CLERK_SECRET_KEY</code> (sk_test_…)
          </li>
        </ul>
        <p className="mt-3">
          <a
            className="text-sky-400 underline hover:text-sky-300"
            href="https://dashboard.clerk.com"
            rel="noopener noreferrer"
            target="_blank"
          >
            Clerk Dashboard
          </a>{" "}
          → your application → <strong className="text-slate-200">API Keys</strong> → copy keys into{" "}
          <code className="text-slate-200">.env.local</code>.
        </p>
      </div>
    </div>
  );
}
