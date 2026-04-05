import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const profilePath = path.join(process.cwd(), "tmp", "bot-profile");

  try {
    if (!fs.existsSync(profilePath)) {
      return NextResponse.json({
        configured: false
      });
    }

    const entries = fs.readdirSync(profilePath).filter((entry) => entry !== ".DS_Store");

    return NextResponse.json({
      configured: entries.length > 0
    });
  } catch {
    return NextResponse.json({
      configured: false
    });
  }
}
