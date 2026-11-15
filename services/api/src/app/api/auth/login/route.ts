import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError, assertSameOrigin, handleApiError, readJson } from "@/lib/api";
import { createBearerSession, createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
  portal: z.enum(["SUPER_ADMIN", "ADMIN", "USER"]),
  client: z.enum(["web", "mobile"]).default("web"),
});

const attempts = new Map<string, { count: number; resetAt: number }>();
const ATTEMPT_LIMIT = 5;
const WINDOW_MS = 15 * 60 * 1000;

function rateLimitKey(email: string): string {
  return createHash("sha256").update(email).digest("hex");
}

function enforceLoginLimit(key: string): void {
  const now = Date.now();
  if (attempts.size >= 10_000 && !attempts.has(key)) {
    for (const [storedKey, entry] of attempts) {
      if (entry.resetAt <= now) attempts.delete(storedKey);
    }
    if (attempts.size >= 10_000) {
      throw new ApiError("Sign-in is temporarily busy. Try again later.", 429);
    }
  }
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  if (current.count >= ATTEMPT_LIMIT) {
    throw new ApiError("Too many sign-in attempts. Try again later.", 429);
  }
  current.count += 1;
}

export async function POST(request: Request) {
  try {
    const input = credentialsSchema.parse(await readJson(request));
    if (input.client === "web") assertSameOrigin(request);
    const key = rateLimitKey(input.email);
    enforceLoginLimit(key);
    const user = await db.user.findUnique({
      where: { email: input.email },
      include: { gym: true },
    });
    const passwordMatches = user
      ? await bcrypt.compare(input.password, user.passwordHash)
      : false;
    if (
      !user ||
      !passwordMatches ||
      user.status !== "ACTIVE" ||
      user.role !== input.portal ||
      (user.role !== "SUPER_ADMIN" && user.gym?.status !== "ACTIVE")
    ) {
      throw new ApiError("Email, password, or selected portal is incorrect.", 401);
    }

    attempts.delete(key);
    if (input.client === "mobile") {
      const session = await createBearerSession(user.id);
      return NextResponse.json({
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        accessToken: session.token,
        tokenType: "Bearer",
        expiresAt: session.expiresAt,
      });
    }

    await createSession(user.id);
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      redirectTo: "/dashboard",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
