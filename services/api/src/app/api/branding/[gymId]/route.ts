import { readFile } from "node:fs/promises";
import path from "node:path";
import { ApiError, handleApiError, requirePrincipal, requireRoles } from "@/lib/api";
import { logoDirectory } from "@/lib/branding-storage";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ gymId: string }> };

function contentTypeFor(name: string | null): string | null {
  if (!name || !/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name)) return null;
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg")) return "image/jpeg";
  return "image/webp";
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const principal = await requirePrincipal();
    requireRoles(principal, ["SUPER_ADMIN", "ADMIN", "USER"]);
    const { gymId } = await context.params;
    if (principal.role !== "SUPER_ADMIN" && principal.gymId !== gymId) {
      throw new ApiError("You cannot access another gym's branding.", 403);
    }
    const gym = await db.gym.findUnique({
      where: { id: gymId },
      select: { logoUrl: true },
    });
    const contentType = contentTypeFor(gym?.logoUrl ?? null);
    if (!contentType || !gym?.logoUrl) {
      throw new ApiError("Logo not found.", 404);
    }
    const bytes = await readFile(path.join(/*turbopackIgnore: true*/ logoDirectory, gym.logoUrl));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
