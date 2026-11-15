import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  readJson,
  requirePrincipal,
  requireRoles,
} from "@/lib/api";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

const createGymSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60),
  timezone: z.string().trim().min(1).max(80),
});

const createAccountSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  role: z.enum(["ADMIN", "USER"]),
  gymId: z.string().cuid(),
});

const settingSchema = z.discriminatedUnion("key", [
  z.object({ key: z.literal("platform_name"), value: z.string().trim().min(1).max(80) }),
  z.object({ key: z.literal("support_email"), value: z.string().email().max(254) }),
  z.object({ key: z.literal("maintenance_mode"), value: z.enum(["true", "false"]) }),
]);

export async function GET() {
  try {
    const principal = await requirePrincipal();
    requireRoles(principal, ["SUPER_ADMIN"]);
    const [gyms, accounts, settings, audits] = await Promise.all([
      db.gym.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          timezone: true,
          status: true,
          createdAt: true,
          _count: { select: { users: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.user.findMany({
        where: { role: { in: ["ADMIN", "USER"] } },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          gymId: true,
          gym: { select: { name: true } },
          createdAt: true,
        },
        orderBy: [{ role: "asc" }, { name: "asc" }],
        take: 500,
      }),
      db.systemSetting.findMany({ orderBy: { key: "asc" } }),
      db.auditLog.findMany({
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          createdAt: true,
          actor: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    return NextResponse.json({ gyms, accounts, settings, audits });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const principal = await requirePrincipal();
    requireRoles(principal, ["SUPER_ADMIN"]);
    const body = await readJson(request);
    if (typeof body !== "object" || body === null || !("action" in body)) {
      throw new ApiError("A platform action is required.", 400);
    }

    if (body.action === "create-gym") {
      const input = createGymSchema.parse(body);
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
      } catch {
        throw new ApiError("Enter a valid IANA timezone.", 400);
      }
      const gym = await db.$transaction(async (transaction) => {
        const created = await transaction.gym.create({
          data: { name: input.name, slug: input.slug, timezone: input.timezone },
        });
        await transaction.auditLog.create({
          data: {
            actorId: principal.id,
            action: "gym.created",
            entityType: "Gym",
            entityId: created.id,
          },
        });
        return created;
      });
      return NextResponse.json({ gym }, { status: 201 });
    }

    if (body.action === "create-account") {
      const input = createAccountSchema.parse(body);
      const gym = await db.gym.findFirst({
        where: { id: input.gymId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!gym) throw new ApiError("Active gym not found.", 404);
      const user = await db.$transaction(async (transaction) => {
        const created = await transaction.user.create({
          data: {
            name: input.name,
            email: input.email,
            passwordHash: await bcrypt.hash(input.password, 12),
            role: input.role,
            gymId: input.gymId,
          },
          select: { id: true, name: true, email: true, role: true, status: true, gymId: true },
        });
        await transaction.auditLog.create({
          data: {
            actorId: principal.id,
            action: "account.created",
            entityType: "User",
            entityId: created.id,
          },
        });
        return created;
      });
      return NextResponse.json({ account: user }, { status: 201 });
    }

    if (body.action === "set-setting") {
      const input = settingSchema.parse(body);
      const setting = await db.$transaction(async (transaction) => {
        const saved = await transaction.systemSetting.upsert({
          where: { key: input.key },
          update: { value: input.value },
          create: input,
        });
        await transaction.auditLog.create({
          data: {
            actorId: principal.id,
            action: "setting.updated",
            entityType: "SystemSetting",
            entityId: input.key,
          },
        });
        return saved;
      });
      return NextResponse.json({ setting });
    }

    throw new ApiError("Unknown platform action.", 400);
  } catch (error) {
    return handleApiError(error);
  }
}

const patchSchema = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("gym"),
    id: z.string().cuid(),
    name: z.string().trim().min(2).max(100).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  }).refine((value) => value.name || value.timezone || value.status),
  z.object({
    target: z.literal("account"),
    id: z.string().cuid(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
    role: z.enum(["ADMIN", "USER"]).optional(),
  }).refine((value) => value.status || value.role),
]);

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const principal = await requirePrincipal();
    requireRoles(principal, ["SUPER_ADMIN"]);
    const input = patchSchema.parse(await readJson(request));
    if (input.target === "gym") {
      if (input.timezone) {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
        } catch {
          throw new ApiError("Enter a valid IANA timezone.", 400);
        }
      }
      const updated = await db.$transaction(async (transaction) => {
        const result = await transaction.gym.update({
          where: { id: input.id },
          data: { name: input.name, timezone: input.timezone, status: input.status },
          select: { id: true, name: true, slug: true, timezone: true, status: true },
        });
        await transaction.auditLog.create({
          data: {
            actorId: principal.id,
            action: "gym.updated",
            entityType: "Gym",
            entityId: input.id,
          },
        });
        return result;
      });
      return NextResponse.json({ gym: updated });
    }

    if (input.id === principal.id) {
      throw new ApiError("You cannot change your own platform account here.", 400);
    }
    const existing = await db.user.findFirst({
      where: { id: input.id, role: { in: ["ADMIN", "USER"] } },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Account not found.", 404);
    const account = await db.$transaction(async (transaction) => {
      const result = await transaction.user.update({
        where: { id: input.id },
        data: { status: input.status, role: input.role },
        select: { id: true, name: true, email: true, role: true, status: true, gymId: true },
      });
      await transaction.auditLog.create({
        data: {
          actorId: principal.id,
          action: "account.updated",
          entityType: "User",
          entityId: input.id,
        },
      });
      return result;
    });
    return NextResponse.json({ account });
  } catch (error) {
    return handleApiError(error);
  }
}
