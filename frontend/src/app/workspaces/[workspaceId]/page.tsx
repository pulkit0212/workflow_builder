import { redirect } from "next/navigation";
import type { Route } from "next";

export default async function WorkspaceRedirectPage({
  params
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  redirect(`/dashboard/workspaces/${workspaceId}` as Route);
}
