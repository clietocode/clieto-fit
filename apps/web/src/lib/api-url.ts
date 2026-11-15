const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:3001" : undefined);

export function apiUrl(path: string): string {
  if (!apiBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL must be configured for the web app.");
  }
  return new URL(path, apiBaseUrl).toString();
}
