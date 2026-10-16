import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest) {
  return NextResponse.json({ message: "Push notifications disabled" }, { status: 200 });
}