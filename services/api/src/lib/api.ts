import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function handleApiError(error: unknown): Promise<NextResponse> {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Please check the submitted information.",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  ) {
    return NextResponse.json(
      { error: "That record already exists." },
      { status: 409 },
    );
  }
  console.error(JSON.stringify({ event: "api_request_failed" }));
  return NextResponse.json(
    { error: "The request could not be completed." },
    { status: 500 },
  );
}

export function assertSameOrigin(request: Request): void {
  if (request.headers.get("authorization")?.startsWith("Bearer ")) return;
  const origin = request.headers.get("origin");
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
  if (process.env.NODE_ENV !== "production" && allowedOrigins.length === 0) {
    allowedOrigins.push("http://localhost:3000", "http://127.0.0.1:3000");
  }
  if (!origin || !allowedOrigins.includes(origin)) {
    throw new ApiError("Request origin could not be verified.", 403);
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("Request body must be valid JSON.", 400);
  }
}

export async function requirePrincipal() {
  const { getPrincipal } = await import("@/lib/auth");
  const principal = await getPrincipal();
  if (!principal) throw new ApiError("Authentication required.", 401);
  return principal;
}

export function requireRoles<T extends string>(
  principal: { role: string },
  roles: readonly T[],
): void {
  if (!roles.includes(principal.role as T)) {
    throw new ApiError("You do not have permission to perform this action.", 403);
  }
}
