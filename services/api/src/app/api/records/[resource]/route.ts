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
import { localDateForTimeZone } from "@/lib/policies";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ resource: string }> };
type Resource =
  | "members"
  | "training"
  | "diets"
  | "attendance"
  | "fees"
  | "payments"
  | "offers"
  | "equipment";

const resourceNames = new Set<Resource>([
  "members",
  "training",
  "diets",
  "attendance",
  "fees",
  "payments",
  "offers",
  "equipment",
]);

function parseResource(value: string): Resource {
  if (!resourceNames.has(value as Resource)) {
    throw new ApiError("Resource not found.", 404);
  }
  return value as Resource;
}

function requireGymId(principal: { gymId: string | null }): string {
  if (!principal.gymId) throw new ApiError("Gym access is required.", 403);
  return principal.gymId;
}

async function assertMemberInGym(memberId: string, gymId: string) {
  const member = await db.user.findFirst({
    where: { id: memberId, gymId, role: "USER", status: "ACTIVE" },
    select: { id: true, feeId: true, fee: { select: { amountCents: true } } },
  });
  if (!member) throw new ApiError("Member not found in this gym.", 404);
  return member;
}

async function listResource(resource: Resource, principal: Awaited<ReturnType<typeof requirePrincipal>>) {
  const gymId = requireGymId(principal);
  const isAdmin = principal.role === "ADMIN";

  if (resource === "members" && isAdmin) {
    return db.user.findMany({
      where: { gymId, role: "USER" },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        feeId: true,
        createdAt: true,
        fee: { select: { id: true, name: true, amountCents: true } },
      },
      orderBy: { name: "asc" },
    });
  }
  if (resource === "members") throw new ApiError("You cannot access member accounts.", 403);

  if (resource === "training") {
    return db.trainingPlan.findMany({
      where: isAdmin ? { gymId } : { gymId, memberId: principal.id },
      include: isAdmin ? { member: { select: { id: true, name: true } } } : undefined,
      orderBy: { updatedAt: "desc" },
    });
  }
  if (resource === "diets") {
    return db.dietPlan.findMany({
      where: isAdmin ? { gymId } : { gymId, memberId: principal.id },
      include: isAdmin ? { member: { select: { id: true, name: true } } } : undefined,
      orderBy: { updatedAt: "desc" },
    });
  }
  if (resource === "attendance") {
    return db.attendance.findMany({
      where: isAdmin ? { gymId } : { gymId, userId: principal.id },
      include: isAdmin ? { user: { select: { id: true, name: true } } } : undefined,
      orderBy: { checkedAt: "desc" },
      take: 200,
    });
  }
  if (resource === "fees") {
    return db.feeStructure.findMany({
      where: isAdmin ? { gymId } : { id: principal.feeId ?? "__unassigned__", gymId, active: true },
      orderBy: { amountCents: "asc" },
    });
  }
  if (resource === "payments") {
    return db.payment.findMany({
      where: isAdmin ? { gymId } : { gymId, memberId: principal.id },
      include: isAdmin
        ? {
            member: { select: { id: true, name: true } },
            fee: { select: { id: true, name: true } },
          }
        : { fee: { select: { id: true, name: true } } },
      orderBy: [{ billingMonth: "desc" }, { recordedAt: "desc" }],
      take: 500,
    });
  }
  if (resource === "offers") {
    const now = new Date();
    return db.offer.findMany({
      where: {
        gymId,
        ...(isAdmin
          ? {}
          : {
              enabled: true,
              AND: [
                { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
              ],
            }),
      },
      orderBy: { createdAt: "desc" },
    });
  }
  return db.equipment.findMany({ where: { gymId }, orderBy: { name: "asc" } });
}

const memberSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  feeId: z.string().cuid().nullable().optional(),
});
const assignedPlanSchema = z.object({
  title: z.string().trim().min(2).max(120),
  details: z.string().trim().min(1).max(10000),
  memberId: z.string().cuid(),
});
const attendanceSchema = z.object({ memberId: z.string().cuid().optional() });
const feeSchema = z.object({
  name: z.string().trim().min(2).max(100),
  amountCents: z.number().int().positive().max(100_000_000),
  description: z.string().trim().max(2000).default(""),
});
const paymentSchema = z.object({
  memberId: z.string().cuid(),
  billingMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  amountCents: z.number().int().nonnegative().max(100_000_000),
  status: z.enum(["PAID", "PARTIAL", "OVERDUE", "REFUNDED"]),
  dueAt: z.coerce.date().nullable().optional(),
});
const offerSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(4000).default(""),
  enabled: z.boolean().default(false),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});
const equipmentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(""),
});

export async function GET(_request: Request, context: RouteContext) {
  try {
    const principal = await requirePrincipal();
    requireRoles(principal, ["ADMIN", "USER"]);
    const { resource: resourceName } = await context.params;
    return NextResponse.json({
      records: await listResource(parseResource(resourceName), principal),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const principal = await requirePrincipal();
    requireRoles(principal, ["ADMIN", "USER"]);
    const resource = parseResource((await context.params).resource);
    const gymId = requireGymId(principal);
    const body = await readJson(request);
    let record: unknown;

    if (resource === "attendance") {
      const input = attendanceSchema.parse(body);
      const memberId = principal.role === "USER" ? principal.id : input.memberId;
      if (!memberId) throw new ApiError("Select a member to record attendance.", 400);
      await assertMemberInGym(memberId, gymId);
      const localDate = localDateForTimeZone(
        new Date(),
        principal.gymTimezone ?? "UTC",
      );
      record = await db.attendance.create({
        data: { gymId, userId: memberId, localDate },
      });
    } else {
      requireRoles(principal, ["ADMIN"]);
      if (resource === "members") {
        const input = memberSchema.parse(body);
        if (input.feeId) {
          const fee = await db.feeStructure.findFirst({
            where: { id: input.feeId, gymId },
            select: { id: true },
          });
          if (!fee) throw new ApiError("Fee structure not found in this gym.", 404);
        }
        record = await db.user.create({
          data: {
            name: input.name,
            email: input.email,
            passwordHash: await bcrypt.hash(input.password, 12),
            role: "USER",
            gymId,
            feeId: input.feeId ?? null,
          },
          select: { id: true, name: true, email: true, status: true, feeId: true },
        });
      } else if (resource === "training" || resource === "diets") {
        const input = assignedPlanSchema.parse(body);
        await assertMemberInGym(input.memberId, gymId);
        record =
          resource === "training"
            ? await db.trainingPlan.create({
                data: { ...input, gymId, createdById: principal.id },
                include: { member: { select: { id: true, name: true } } },
              })
            : await db.dietPlan.create({
                data: { ...input, gymId, createdById: principal.id },
                include: { member: { select: { id: true, name: true } } },
              });
      } else if (resource === "fees") {
        record = await db.feeStructure.create({
          data: { ...feeSchema.parse(body), gymId },
        });
      } else if (resource === "payments") {
        const input = paymentSchema.parse(body);
        const member = await assertMemberInGym(input.memberId, gymId);
        const fee = member.feeId
          ? await db.feeStructure.findFirst({
              where: { id: member.feeId, gymId, active: true },
              select: { id: true, amountCents: true },
            })
          : null;
        if (!fee) throw new ApiError("Assign an active fee to this member first.", 400);
        if (input.status === "PAID" && input.amountCents < fee.amountCents) {
          throw new ApiError("A paid record must cover the full monthly fee.", 400);
        }
        record = await db.payment.create({
          data: {
            ...input,
            dueAt: input.dueAt ?? null,
            gymId,
            feeId: fee.id,
            expectedCents: fee.amountCents,
          },
        });
      } else if (resource === "offers") {
        const input = offerSchema.parse(body);
        if (input.startsAt && input.endsAt && input.endsAt < input.startsAt) {
          throw new ApiError("Offer end date must be after its start date.", 400);
        }
        record = await db.offer.create({
          data: { ...input, startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null, gymId },
        });
      } else if (resource === "equipment") {
        record = await db.equipment.create({
          data: { ...equipmentSchema.parse(body), gymId },
        });
      } else {
        throw new ApiError("This resource cannot be created.", 400);
      }
    }

    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
