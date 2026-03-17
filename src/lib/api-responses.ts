import { NextResponse } from "next/server";

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      success: false,
      message,
      ...(details ? { details } : {})
    },
    { status }
  );
}
