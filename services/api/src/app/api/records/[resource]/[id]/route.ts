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

type RouteContext = { params: Promise<{ resource: string; id: string }> };

function requireGymId(gymId: string | null): string {
  if (!gymId) throw new ApiError("Gym access is required.", 403);
  return gymId;
}

const memberUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()).optional(),
    password: z.string().min(12).max(128).optional(),
    feeId: z.string().cuid().nullable().optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

const planUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    details: z.string().trim().min(1).max(10000).optional(),
    memberId: z.string().cuid().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

const feeUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    amountCents: z.number().int().positive().max(100_000_000).optional(),
    description: z.string().trim().max(2000).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

const paymentUpdateSchema = z
  .object({
    amountCents: z.number().int().nonnegative().max(100_000_000).optional(),
    status: z.enum(["PAID", "PARTIAL", "OVERDUE", "REFUNDED"]).optional(),
    dueAt: z.coerce.date().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

const offerUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(4000).optional(),
    enabled: z.boolean().optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

const equipmentUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(2000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const principal = await requirePrincipal();
    requireRoles(principal, ["ADMIN"]);
    const { resource, id } = await context.params;
    const gymId = requireGymId(principal.gymId);
    const body = await readJson(request);
    let record: unknown;

    if (resource === "members") {
      const input = memberUpdateSchema.parse(body);
      const member = await db.user.findFirst({
        where: { id, gymId, role: "USER" },
        select: { id: true },
      });
      if (!member) throw new ApiError("Member not found.", 404);
      if (input.feeId) {
        const fee = await db.feeStructure.findFirst({
          where: { id: input.feeId, gymId },
          select: { id: true },
        });
        if (!fee) throw new ApiError("Fee structure not found in this gym.", 404);
      }
      const { password, ...fields } = input;
      record = await db.user.update({
        where: { id },
        data: {
          ...fields,
          ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
        },
        select: { id: true, name: true, email: true, status: true, feeId: true },
      });
    } else if (resource === "training" || resource === "diets") {
      const input = planUpdateSchema.parse(body);
      if (input.memberId) {
        const member = await db.user.findFirst({
          where: { id: input.memberId, gymId, role: "USER", status: "ACTIVE" },
          select: { id: true },
        });
        if (!member) throw new ApiError("Member not found in this gym.", 404);
      }
      const existing =
        resource === "training"
          ? await db.trainingPlan.findFirst({ where: { id, gymId }, select: { id: true } })
          : await db.dietPlan.findFirst({ where: { id, gymId }, select: { id: true } });
      if (!existing) throw new ApiError("Record not found.", 404);
      record =
        resource === "training"
          ? await db.trainingPlan.update({
              where: { id },
              data: input,
              include: { member: { select: { id: true, name: true } } },
            })
          : await db.dietPlan.update({
              where: { id },
              data: input,
              include: { member: { select: { id: true, name: true } } },
            });
    } else if (resource === "fees") {
      const input = feeUpdateSchema.parse(body);
      const existing = await db.feeStructure.findFirst({
        where: { id, gymId },
        select: { id: true },
      });
      if (!existing) throw new ApiError("Fee structure not found.", 404);
      record = await db.feeStructure.update({ where: { id }, data: input });
    } else if (resource === "payments") {
      const input = paymentUpdateSchema.parse(body);
      const existing = await db.payment.findFirst({
        where: { id, gymId },
        select: { id: true, expectedCents: true, amountCents: true, status: true },
      });
      if (!existing) throw new ApiError("Payment record not found.", 404);
      const amountCents = input.amountCents ?? existing.amountCents;
      const status = input.status ?? existing.status;
      if (status === "PAID" && amountCents < existing.expectedCents) {
        throw new ApiError("A paid record must cover the full monthly fee.", 400);
      }
      record = await db.payment.update({ where: { id }, data: input });
    } else if (resource === "offers") {
      const input = offerUpdateSchema.parse(body);
      const existing = await db.offer.findFirst({ where: { id, gymId }, select: { id: true } });
      if (!existing) throw new ApiError("Offer not found.", 404);
      const start = input.startsAt;
      const end = input.endsAt;
      if (start && end && end < start) {
        throw new ApiError("Offer end date must be after its start date.", 400);
      }
      record = await db.offer.update({ where: { id }, data: input });
    } else if (resource === "equipment") {
      const input = equipmentUpdateSchema.parse(body);
      const existing = await db.equipment.findFirst({
        where: { id, gymId },
        select: { id: true },
      });
      if (!existing) throw new ApiError("Equipment record not found.", 404);
      record = await db.equipment.update({ where: { id }, data: input });
    } else {
      throw new ApiError("This resource cannot be updated.", 404);
    }

    return NextResponse.json({ record });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const principal = await requirePrincipal();
    requireRoles(principal, ["ADMIN"]);
    const { resource, id } = await context.params;
    const gymId = requireGymId(principal.gymId);

    if (resource === "attendance") {
      const deleted = await db.attendance.deleteMany({ where: { id, gymId } });
      if (!deleted.count) throw new ApiError("Attendance record not found.", 404);
    } else if (resource === "training" || resource === "diets") {
      const deleted =
        resource === "training"
          ? await db.trainingPlan.deleteMany({ where: { id, gymId } })
          : await db.dietPlan.deleteMany({ where: { id, gymId } });
      if (!deleted.count) throw new ApiError("Record not found.", 404);
    } else if (resource === "fees") {
      const deleted = await db.feeStructure.deleteMany({ where: { id, gymId } });
      if (!deleted.count) throw new ApiError("Fee structure not found.", 404);
    } else if (resource === "offers") {
      const deleted = await db.offer.deleteMany({ where: { id, gymId } });
      if (!deleted.count) throw new ApiError("Offer not found.", 404);
    } else if (resource === "equipment") {
      const deleted = await db.equipment.deleteMany({ where: { id, gymId } });
      if (!deleted.count) throw new ApiError("Equipment record not found.", 404);
    } else {
      throw new ApiError("This resource cannot be deleted.", 400);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
