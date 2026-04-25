import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api-client.server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const backendRes = await apiFetch(`/api/meetings/${params.id}`);
    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const backendRes = await apiFetch(`/api/meetings/${params.id}`, {
      method: "DELETE",
    });
    if (backendRes.status === 204) {
      return new NextResponse(null, { status: 204 });
    }
    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const backendRes = await apiFetch(`/api/meetings/${params.id}`, {
      method: "PATCH",
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
