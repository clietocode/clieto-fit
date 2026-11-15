import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, assertSameOrigin } from "./api";

test("cookie-authenticated writes require an allowed web origin", () => {
  const previousAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS;
  process.env.CORS_ALLOWED_ORIGINS = "https://web.example.com";

  try {
    assert.doesNotThrow(() =>
      assertSameOrigin(new Request("https://api.example.com/api/account", {
        method: "PATCH",
        headers: { origin: "https://web.example.com" },
      })),
    );
    assert.throws(
      () =>
        assertSameOrigin(new Request("https://api.example.com/api/account", {
          method: "PATCH",
          headers: { origin: "https://untrusted.example" },
        })),
      (error: unknown) => error instanceof ApiError && error.status === 403,
    );
  } finally {
    if (previousAllowedOrigins === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = previousAllowedOrigins;
  }
});

test("bearer-authenticated writes do not require a browser origin", () => {
  assert.doesNotThrow(() =>
    assertSameOrigin(new Request("https://api.example.com/api/records/members/1", {
      method: "PATCH",
      headers: { authorization: "Bearer mobile-session-token" },
    })),
  );
});
