import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client.server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const backendRes = await apiFetch("/api/meetings/share-calendar", {
      method: "POST",
      body: JSON.stringify(body),
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
