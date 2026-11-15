export type Role = "SUPER_ADMIN" | "ADMIN" | "USER";

export type Principal = {
  id: string;
  email: string;
  name: string;
  role: Role;
  gymId: string | null;
  gymName: string | null;
  gymTimezone: string | null;
  feeId: string | null;
};

export type PortalMetrics = {
  gyms?: number;
  admins?: number;
  members?: number;
  activeGyms?: number;
  attendanceToday?: number;
  billingMonth?: string;
  paidMembers?: number;
  unpaidMembers?: number;
  unassignedFees?: number;
  fee?: { name: string; amountCents: number } | null;
  paymentStatus?: string;
  amountPaidCents?: number;
  dueAt?: string | null;
  trainingPlans?: number;
  dietPlans?: number;
  attendanceCount?: number;
};

export type PortalResponse = {
  user: Principal;
  gym?: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    logoUrl: string | null;
  };
  metrics: PortalMetrics;
};

export type RecordSummary = {
  id: string;
  name?: string;
  email?: string;
  status?: string;
  fee?: { name: string; amountCents: number } | null;
  title?: string;
  details?: string;
  member?: { id: string; name: string };
  user?: { id: string; name: string };
  localDate?: string;
  checkedAt?: string;
  amountCents?: number;
  expectedCents?: number;
  billingMonth?: string;
  dueAt?: string | null;
  active?: boolean;
  description?: string;
  enabled?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt?: string;
};

export type Section =
  | "overview"
  | "members"
  | "training"
  | "diets"
  | "attendance"
  | "fees"
  | "payments"
  | "offers"
  | "equipment";

export type SectionConfig = {
  id: Section;
  label: string;
  resource?: Exclude<Section, "overview">;
};
