import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  readJson,
  requirePrincipal,
} from "@/lib/api";
import { createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  currentPassword: z.string().min(1).max(128).optional(),
  newPassword: z.string().min(12).max(128).optional(),
}).refine(
  (value) => Boolean(value.name || value.newPassword) &&
    (Boolean(value.currentPassword) === Boolean(value.newPassword)),
  { message: "Enter your current password to set a new password." },
);

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const principal = await requirePrincipal();
    const input = updateSchema.parse(await readJson(request));
    if (input.newPassword && input.currentPassword) {
      const current = await db.user.findUnique({
        where: { id: principal.id },
        select: { passwordHash: true },
      });
      if (!current || !(await bcrypt.compare(input.currentPassword, current.passwordHash))) {
        throw new ApiError("Current password is incorrect.", 400);
      }
    }

    await db.user.update({
      where: { id: principal.id },
      data: {
        name: input.name,
        ...(input.newPassword ? { passwordHash: await bcrypt.hash(input.newPassword, 12) } : {}),
      },
    });
    if (input.newPassword) {
      await db.session.deleteMany({ where: { userId: principal.id } });
      await createSession(principal.id);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
