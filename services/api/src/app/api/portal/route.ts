import { handleApiError, requirePrincipal } from "@/lib/api";
import { db } from "@/lib/db";
import { billingMonthForTimeZone, isPaymentFullyPaid, localDateForTimeZone } from "@/lib/policies";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const principal = await requirePrincipal();

    if (principal.role === "SUPER_ADMIN") {
      const [gyms, admins, members, activeGyms] = await Promise.all([
        db.gym.count(),
        db.user.count({ where: { role: "ADMIN" } }),
        db.user.count({ where: { role: "USER" } }),
        db.gym.count({ where: { status: "ACTIVE" } }),
      ]);
      return NextResponse.json({
        user: principal,
        metrics: { gyms, admins, members, activeGyms },
      });
    }

    const gymId = principal.gymId;
    if (!gymId) return NextResponse.json({ error: "Gym access is required." }, { status: 403 });
    const gym = await db.gym.findUnique({
      where: { id: gymId },
      select: { id: true, name: true, slug: true, timezone: true, logoUrl: true },
    });
    if (!gym) return NextResponse.json({ error: "Gym not found." }, { status: 404 });

    const today = localDateForTimeZone(new Date(), gym.timezone);
    const billingMonth = billingMonthForTimeZone(new Date(), gym.timezone);
    if (principal.role === "ADMIN") {
      const [members, attendanceToday, eligibleMembers, unassignedFees] = await Promise.all([
        db.user.count({ where: { gymId, role: "USER", status: "ACTIVE" } }),
        db.attendance.count({ where: { gymId, localDate: today } }),
        db.user.findMany({
          where: {
            gymId,
            role: "USER",
            status: "ACTIVE",
            fee: { is: { active: true } },
          },
          select: { id: true },
        }),
        db.user.count({
          where: {
            gymId,
            role: "USER",
            status: "ACTIVE",
            OR: [{ feeId: null }, { fee: { is: { active: false } } }],
          },
        }),
      ]);
      const payments = eligibleMembers.length
        ? await db.payment.findMany({
            where: {
              gymId,
              billingMonth,
              memberId: { in: eligibleMembers.map((member) => member.id) },
            },
            select: { memberId: true, amountCents: true, expectedCents: true, status: true },
          })
        : [];
      const paidMemberIds = new Set(
        payments
          .filter((payment) =>
            isPaymentFullyPaid(payment.status, payment.amountCents, payment.expectedCents),
          )
          .map((payment) => payment.memberId),
      );
      return NextResponse.json({
        user: principal,
        gym,
        metrics: {
          members,
          attendanceToday,
          billingMonth,
          paidMembers: paidMemberIds.size,
          unpaidMembers: eligibleMembers.length - paidMemberIds.size,
          unassignedFees,
        },
      });
    }

    const payment = await db.payment.findUnique({
      where: { gymId_memberId_billingMonth: { gymId, memberId: principal.id, billingMonth } },
      select: { status: true, amountCents: true, expectedCents: true, dueAt: true },
    });
    const fee = principal.feeId
      ? await db.feeStructure.findFirst({
          where: { id: principal.feeId, gymId, active: true },
          select: { name: true, amountCents: true },
        })
      : null;
    const [trainingPlans, dietPlans, attendanceCount] = await Promise.all([
      db.trainingPlan.count({ where: { gymId, memberId: principal.id } }),
      db.dietPlan.count({ where: { gymId, memberId: principal.id } }),
      db.attendance.count({ where: { gymId, userId: principal.id } }),
    ]);
    const paid = payment
      ? isPaymentFullyPaid(payment.status, payment.amountCents, payment.expectedCents)
      : false;
    return NextResponse.json({
      user: principal,
      gym,
      metrics: {
        billingMonth,
        fee,
        paymentStatus: paid ? "PAID" : payment?.status ?? "UNRECORDED",
        amountPaidCents: payment?.amountCents ?? 0,
        dueAt: payment?.dueAt ?? null,
        trainingPlans,
        dietPlans,
        attendanceCount,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
