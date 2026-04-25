import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client.server";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const backendRes = await apiFetch(`/api/meetings/${params.id}/bot/stop`, {
      method: "POST",
    });
    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
