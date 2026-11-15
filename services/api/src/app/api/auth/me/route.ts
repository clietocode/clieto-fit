import { handleApiError, requirePrincipal } from "@/lib/api";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    return NextResponse.json({ user: await requirePrincipal() });
  } catch (error) {
    return handleApiError(error);
  }
}
