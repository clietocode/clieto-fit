import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@clieto-fit/shared/session-constants";
import type { Principal } from "@clieto-fit/shared/auth-types";
import { apiUrl } from "@/lib/api-url";

export async function getPrincipalFromApi(): Promise<Principal | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const response = await fetch(apiUrl("/api/auth/me"), {
    headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`The API session check failed with status ${response.status}.`);
  }
  const result = (await response.json()) as { user: Principal };
  return result.user;
}
