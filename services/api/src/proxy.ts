import { NextResponse, type NextRequest } from "next/server";

function getAllowedOrigins(): string[] {
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV !== "production" && allowedOrigins.length === 0) {
    allowedOrigins.push("http://localhost:3000", "http://127.0.0.1:3000");
  }
  return allowedOrigins;
}

function addCorsHeaders(response: Response, origin: string): Response {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Access-Control-Max-Age", "600");
  response.headers.append("Vary", "Origin");
  return response;
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  const isAllowedOrigin = Boolean(origin && getAllowedOrigins().includes(origin));

  if (request.method === "OPTIONS") {
    if (!origin || !isAllowedOrigin) return new Response(null, { status: 403 });
    return addCorsHeaders(new Response(null, { status: 204 }), origin);
  }

  const response = NextResponse.next();
  return origin && isAllowedOrigin ? addCorsHeaders(response, origin) : response;
}

export const config = {
  matcher: "/api/:path*",
};
