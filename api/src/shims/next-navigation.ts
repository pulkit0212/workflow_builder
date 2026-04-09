// Shim for next/navigation — not available outside Next.js.
// redirect() in the Express context just throws so callers get a 401/403 instead.
export function redirect(url: string): never {
  throw new Error(`redirect(${url}) called outside Next.js — handle auth in middleware instead.`);
}

export function notFound(): never {
  throw new Error("notFound() called outside Next.js.");
}

export const useRouter = () => { throw new Error("useRouter() is client-only."); };
export const usePathname = () => { throw new Error("usePathname() is client-only."); };
export const useSearchParams = () => { throw new Error("useSearchParams() is client-only."); };
