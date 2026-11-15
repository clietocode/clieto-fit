import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  requirePrincipal,
  requireRoles,
} from "@/lib/api";
import { logoDirectory } from "@/lib/branding-storage";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_LOGO_BYTES + 64 * 1024;

function detectImage(bytes: Buffer): { extension: string; contentType: string } | null {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { extension: "png", contentType: "image/png" };
  }
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { extension: "webp", contentType: "image/webp" };
  }
  return null;
}

function isSafeFileName(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(value));
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function removeFile(fileName: string): Promise<void> {
  try {
    await unlink(path.join(/*turbopackIgnore: true*/ logoDirectory, fileName));
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
}

async function readLogoForm(request: Request): Promise<FormData> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
    throw new ApiError("Logo upload must not exceed 2 MB.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("Choose a PNG, JPEG, or WebP logo.", 400);
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_MULTIPART_BYTES) {
        await reader.cancel();
        throw new ApiError("Logo upload must not exceed 2 MB.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const formRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: Buffer.concat(chunks),
  });
  try {
    return await formRequest.formData();
  } catch {
    throw new ApiError("Choose a PNG, JPEG, or WebP logo.", 400);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const principal = await requirePrincipal();
    requireRoles(principal, ["ADMIN"]);
    if (!principal.gymId) throw new ApiError("Gym access is required.", 403);
    const form = await readLogoForm(request);
    const uploaded = form.get("logo");
    if (!uploaded || typeof uploaded === "string") {
      throw new ApiError("Choose a PNG, JPEG, or WebP logo.", 400);
    }
    if (uploaded.size === 0 || uploaded.size > MAX_LOGO_BYTES) {
      throw new ApiError("Logo must be between 1 byte and 2 MB.", 400);
    }
    const bytes = Buffer.from(await uploaded.arrayBuffer());
    const image = detectImage(bytes);
    if (!image) throw new ApiError("Only valid PNG, JPEG, and WebP files are accepted.", 400);

    await mkdir(logoDirectory, { recursive: true });
    const fileName = `${randomUUID()}.${image.extension}`;
    const filePath = path.join(/*turbopackIgnore: true*/ logoDirectory, fileName);
    await writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
    let updated: { id: string; logoUrl: string | null };
    try {
      updated = await db.gym.update({
        where: { id: principal.gymId },
        data: { logoUrl: fileName },
        select: { id: true, logoUrl: true },
      });
    } catch (error) {
      try {
        await removeFile(fileName);
      } catch {
        console.error(JSON.stringify({ event: "branding_upload_cleanup_failed" }));
      }
      throw error;
    }
    let warning: string | undefined;
    if (isSafeFileName(updated.logoUrl) && updated.logoUrl !== fileName) {
      try {
        await removeFile(updated.logoUrl);
      } catch {
        console.error(JSON.stringify({ event: "branding_old_file_cleanup_failed" }));
        warning = "The new logo was saved, but an older image could not be removed.";
      }
    }
    return NextResponse.json({
      logoUrl: `/api/branding/${principal.gymId}?v=${Date.now()}`,
      ...(warning ? { warning } : {}),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const principal = await requirePrincipal();
    requireRoles(principal, ["ADMIN"]);
    if (!principal.gymId) throw new ApiError("Gym access is required.", 403);
    const gym = await db.gym.update({
      where: { id: principal.gymId },
      data: { logoUrl: null },
      select: { logoUrl: true },
    });
    let warning: string | undefined;
    if (isSafeFileName(gym.logoUrl)) {
      try {
        await removeFile(gym.logoUrl);
      } catch {
        console.error(JSON.stringify({ event: "branding_remove_cleanup_failed" }));
        warning = "The logo was removed, but its stored image could not be deleted.";
      }
    }
    return NextResponse.json({ ok: true, ...(warning ? { warning } : {}) });
  } catch (error) {
    return handleApiError(error);
  }
}
