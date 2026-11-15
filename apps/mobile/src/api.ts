import type {
  PortalResponse,
  Principal,
  RecordSummary,
  Section,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!configured) {
    throw new ApiError(
      "Set EXPO_PUBLIC_API_URL in apps/mobile/.env to your API server address.",
    );
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new ApiError("EXPO_PUBLIC_API_URL must be a valid HTTP or HTTPS URL.");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  ) {
    throw new ApiError("EXPO_PUBLIC_API_URL must be an HTTP or HTTPS URL without credentials.");
  }
  if (!__DEV__ && url.protocol !== "https:") {
    throw new ApiError("The mobile app requires HTTPS for production API connections.");
  }
  return url.toString().replace(/\/+$/, "");
}

async function request<T>(
  path: string,
  options: { token?: string; method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: options.method ?? "GET",
      headers,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  } catch {
    throw new ApiError("Could not reach the API. Check the server address and network connection.");
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new ApiError("The API returned an unreadable response.", response.status);
  }

  if (!response.ok) {
    const message =
      typeof result === "object" &&
      result !== null &&
      "error" in result &&
      typeof result.error === "string"
        ? result.error
        : "The request could not be completed.";
    throw new ApiError(message, response.status);
  }
  return result as T;
}

export async function signIn(
  email: string,
  password: string,
  portal: Principal["role"],
): Promise<{ accessToken: string }> {
  const result = await request<{
    accessToken?: string;
    tokenType?: string;
  }>("/api/auth/login", {
    method: "POST",
    body: { email, password, portal, client: "mobile" },
  });
  if (result.tokenType !== "Bearer" || typeof result.accessToken !== "string") {
    throw new ApiError("The API did not return a valid mobile session.");
  }
  return { accessToken: result.accessToken };
}

export function getCurrentUser(token: string): Promise<{ user: Principal }> {
  return request("/api/auth/me", { token });
}

export function getPortal(token: string): Promise<PortalResponse> {
  return request("/api/portal", { token });
}

export async function getRecords(
  token: string,
  resource: Exclude<Section, "overview">,
): Promise<RecordSummary[]> {
  const result = await request<{ records: RecordSummary[] }>(
    `/api/records/${resource}`,
    { token },
  );
  return result.records;
}

export function checkIn(
  token: string,
  memberId?: string,
): Promise<{ record: RecordSummary }> {
  return request("/api/records/attendance", {
    token,
    method: "POST",
    body: memberId ? { memberId } : {},
  });
}

export function signOut(token: string): Promise<{ ok: boolean }> {
  return request("/api/auth/logout", { token, method: "POST", body: {} });
}
