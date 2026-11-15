"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { Principal, Role } from "@clieto-fit/shared/auth-types";
import { apiUrl } from "@/lib/api-url";

type Module =
  | "overview"
  | "members"
  | "training"
  | "diets"
  | "attendance"
  | "fees"
  | "payments"
  | "offers"
  | "equipment"
  | "gym-settings"
  | "platform"
  | "system-settings"
  | "activity"
  | "profile";
type GymInfo = { id: string; name: string; slug: string; timezone: string; logoUrl: string | null };
type Metrics = {
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
type PortalData = { user: Principal; gym?: GymInfo; metrics: Metrics };
type Row = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
  feeId?: string | null;
  fee?: { id: string; name: string; amountCents: number } | null;
  title?: string;
  details?: string;
  memberId?: string;
  member?: { id: string; name: string };
  user?: { id: string; name: string };
  localDate?: string;
  checkedAt?: string;
  amountCents?: number;
  expectedCents?: number;
  billingMonth?: string;
  dueAt?: string | null;
  recordedAt?: string;
  active?: boolean;
  description?: string;
  enabled?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt?: string;
};
type PlatformData = {
  gyms: Array<{
    id: string;
    name: string;
    slug: string;
    timezone: string;
    status: string;
    createdAt: string;
    _count: { users: number };
  }>;
  accounts: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    gymId: string | null;
    gym: { name: string } | null;
    createdAt: string;
  }>;
  settings: Array<{ key: string; value: string }>;
  audits: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    createdAt: string;
    actor: { name: string; email: string } | null;
  }>;
};

const navigation: Record<Role, Array<{ id: Module; label: string; icon: string }>> = {
  SUPER_ADMIN: [
    { id: "overview", label: "Overview", icon: "⌂" },
    { id: "platform", label: "Gyms & accounts", icon: "▦" },
    { id: "system-settings", label: "System settings", icon: "⚙" },
    { id: "activity", label: "Audit activity", icon: "◷" },
  ],
  ADMIN: [
    { id: "overview", label: "Overview", icon: "⌂" },
    { id: "members", label: "Members", icon: "◎" },
    { id: "training", label: "Training plans", icon: "↗" },
    { id: "diets", label: "Diet guidance", icon: "◌" },
    { id: "attendance", label: "Attendance", icon: "◷" },
    { id: "fees", label: "Fee structures", icon: "＄" },
    { id: "payments", label: "Payments", icon: "▤" },
    { id: "offers", label: "Offers", icon: "✳" },
    { id: "equipment", label: "Equipment", icon: "◈" },
    { id: "gym-settings", label: "Gym settings", icon: "⚙" },
  ],
  USER: [
    { id: "overview", label: "Overview", icon: "⌂" },
    { id: "training", label: "My training", icon: "↗" },
    { id: "diets", label: "Diet guidance", icon: "◌" },
    { id: "attendance", label: "My attendance", icon: "◷" },
    { id: "fees", label: "Membership fee", icon: "＄" },
    { id: "payments", label: "Payment history", icon: "▤" },
    { id: "offers", label: "Gym offers", icon: "✳" },
    { id: "equipment", label: "Equipment", icon: "◈" },
    { id: "profile", label: "My account", icon: "○" },
  ],
};

const titles: Record<Module, string> = {
  overview: "Your overview",
  members: "Member management",
  training: "Training plans",
  diets: "Diet guidance",
  attendance: "Attendance",
  fees: "Fee structures",
  payments: "Payment records",
  offers: "Offers",
  equipment: "Equipment",
  "gym-settings": "Gym settings",
  platform: "Gyms & accounts",
  "system-settings": "System settings",
  activity: "Audit activity",
  profile: "My account",
};

const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: "Platform administrator",
  ADMIN: "Gym administrator",
  USER: "Member",
};

async function apiRequest<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(apiUrl(url), {
    method,
    cache: "no-store",
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "The request could not be completed.");
  return result;
}

function money(cents?: number | null): string {
  if (typeof cents !== "number") return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function dateTimeInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function moduleForResource(module: Module): string | null {
  return ["members", "training", "diets", "attendance", "fees", "payments", "offers", "equipment"].includes(module)
    ? module
    : null;
}

export default function DashboardClient({ principal }: { principal: Principal }) {
  const router = useRouter();
  const [active, setActive] = useState<Module>("overview");
  const [portal, setPortal] = useState<PortalData | null>(null);
  const [records, setRecords] = useState<Row[]>([]);
  const [memberOptions, setMemberOptions] = useState<Row[]>([]);
  const [feeOptions, setFeeOptions] = useState<Row[]>([]);
  const [platform, setPlatform] = useState<PlatformData | null>(null);
  const [gymSettings, setGymSettings] = useState<GymInfo | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPortal = useCallback(async () => {
    const data = await apiRequest<PortalData>("/api/portal");
    setPortal(data);
    if (data.gym) setGymSettings(data.gym);
  }, []);

  const loadPlatform = useCallback(async () => {
    setPlatform(await apiRequest<PlatformData>("/api/platform"));
  }, []);

  const loadRecords = useCallback(async (module: Module) => {
    const resource = moduleForResource(module);
    if (!resource) return;
    const data = await apiRequest<{ records: Row[] }>(`/api/records/${resource}`);
    setRecords(data.records);
    if (principal.role === "ADMIN" && ["training", "diets", "attendance", "payments"].includes(module)) {
      const members = await apiRequest<{ records: Row[] }>("/api/records/members");
      setMemberOptions(members.records);
    }
    if (principal.role === "ADMIN" && ["members", "payments"].includes(module)) {
      const fees = await apiRequest<{ records: Row[] }>("/api/records/fees");
      setFeeOptions(fees.records);
    }
  }, [principal.role]);

  const refresh = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      await loadPortal();
      if (principal.role === "SUPER_ADMIN" && ["platform", "system-settings", "activity"].includes(active)) {
        await loadPlatform();
      }
      await loadRecords(active);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load this page.");
    } finally {
      setBusy(false);
    }
  }, [active, loadPlatform, loadPortal, loadRecords, principal.role]);

  useEffect(() => {
    let activeEffect = true;
    async function initialLoad() {
      try {
        await loadPortal();
        if (principal.role === "SUPER_ADMIN") await loadPlatform();
      } catch (requestError) {
        if (activeEffect) setError(requestError instanceof Error ? requestError.message : "Unable to load your portal.");
      } finally {
        if (activeEffect) setLoading(false);
      }
    }
    void initialLoad();
    return () => { activeEffect = false; };
  }, [loadPlatform, loadPortal, principal.role]);

  const activeFees = useMemo(() => feeOptions.filter((fee) => fee.active), [feeOptions]);
  const nav = navigation[principal.role];

  function navigate(module: Module) {
    setActive(module);
    setNotice("");
    setError("");
    setDraft(
      module === "payments" && portal?.metrics.billingMonth
        ? { billingMonth: portal.metrics.billingMonth }
        : {},
    );
    setEditing(null);
    if (moduleForResource(module)) {
      void loadRecords(module).catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : "Unable to load records.");
      });
    } else if (principal.role === "SUPER_ADMIN" && module !== "overview") {
      void loadPlatform().catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : "Unable to load platform data.");
      });
    } else if (module === "gym-settings" && principal.role === "ADMIN") {
      void apiRequest<{ gym: GymInfo }>("/api/gym")
        .then((response) => setGymSettings(response.gym))
        .catch((requestError: unknown) => {
          setError(requestError instanceof Error ? requestError.message : "Unable to load gym settings.");
        });
    }
  }

  function setField(name: string, value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const resource = moduleForResource(active);
    if (!resource) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = buildRecordPayload(active, draft, principal.role, editing);
      const response = await apiRequest<{ record: Row }>(
        editing ? `/api/records/${resource}/${editing.id}` : `/api/records/${resource}`,
        editing ? "PATCH" : "POST",
        payload,
      );
      setNotice(editing ? "Changes saved." : "Record added.");
      setEditing(null);
      setDraft({});
      await loadRecords(active);
      await loadPortal();
      if (active === "members" && response.record?.id) {
        setNotice("Member account created. Share the temporary sign-in password securely.");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save this record.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRecord(resource: string, id: string, payload: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/records/${resource}/${id}`, "PATCH", payload);
      setNotice("Changes saved.");
      setEditing(null);
      await loadRecords(active);
      await loadPortal();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update this record.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecord(resource: string, id: string) {
    if (!window.confirm("Delete this record? This cannot be undone.")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/records/${resource}/${id}`, "DELETE");
      setNotice("Record deleted.");
      await loadRecords(active);
      await loadPortal();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not delete this record.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    try {
      await apiRequest("/api/auth/logout", "POST", {});
      router.replace("/login");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to sign out.");
    }
  }

  const title = titles[active];
  if (loading) {
    return <main className="loading-screen"><span className="spinner" /> Loading your portal…</main>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand sidebar-brand" href="/dashboard">
          <span className="brand-mark">C</span>
          <span>clieto<span className="brand-accent">fit</span></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-switcher">
          <span className="workspace-avatar">{(portal?.gym?.name ?? "C").slice(0, 1).toUpperCase()}</span>
          <span className="workspace-copy">
            <strong>{principal.role === "SUPER_ADMIN" ? "Platform" : portal?.gym?.name ?? principal.gymName ?? "Your gym"}</strong>
            <small>{roleLabels[principal.role]}</small>
          </span>
          <span className="switcher-caret">⌄</span>
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item${active === item.id ? " nav-item-active" : ""}`}
              onClick={() => navigate(item.id)}
              aria-current={active === item.id ? "page" : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {item.id === "payments" && principal.role === "USER" && portal?.metrics.paymentStatus !== "PAID" && (
                <span className="nav-indicator" aria-label="Payment reminder" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <div className="tip-icon">✳</div>
            <strong>Small steps add up.</strong>
            <p>Consistency is the strongest plan.</p>
          </div>
          <button className="user-chip" onClick={() => principal.role === "USER" ? navigate("profile") : undefined}>
            <span className="avatar">{initials(principal.name)}</span>
            <span className="user-chip-text"><strong>{principal.name}</strong><small>{principal.email}</small></span>
            <span className="user-menu-dot" aria-hidden="true">···</span>
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>{principal.role === "SUPER_ADMIN" ? "Platform" : portal?.gym?.name ?? "Workspace"}</span><b>/</b><strong>{title}</strong></div>
          <div className="topbar-actions">
            <span className="today-label">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date())}</span>
            <button className="icon-button" aria-label="Refresh data" onClick={() => void refresh()}>↻</button>
            <button className="button button-quiet button-signout" onClick={() => void signOut()}>Sign out</button>
          </div>
        </header>

        <div className="mobile-nav-wrap">
          <nav className="mobile-nav" aria-label="Mobile navigation">
            {nav.map((item) => (
              <button
                key={item.id}
                className={`mobile-nav-item${active === item.id ? " mobile-nav-active" : ""}`}
                onClick={() => navigate(item.id)}
              >
                <span aria-hidden="true">{item.icon}</span>{item.label}
              </button>
            ))}
          </nav>
        </div>

        <section className="page-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">{principal.role === "SUPER_ADMIN" ? "PLATFORM CONTROL" : principal.role === "ADMIN" ? "GYM OPERATIONS" : "MEMBER SPACE"}</span>
              <h1>{active === "overview" ? `Good ${greeting()}, ${firstName(principal.name)}.` : title}</h1>
              <p>{pageDescription(active, principal.role, portal?.gym?.name)}</p>
            </div>
            {active === "overview" && principal.role === "ADMIN" && (
              <button className="button button-primary" onClick={() => setActive("members")}>＋ Add a member</button>
            )}
          </div>

          {error && <div className="alert alert-error" role="alert"><span>!</span>{error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
          {notice && <div className="alert alert-success" role="status"><span>✓</span>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}

          {active === "overview" && (
            <Overview principal={principal} portal={portal} onNavigate={navigate} />
          )}
          {moduleForResource(active) && (
            <ResourcePanel
              module={active}
              role={principal.role}
              records={records}
              members={memberOptions}
              fees={activeFees}
              draft={draft}
              editing={editing}
              busy={busy}
              onField={setField}
              onSubmit={saveRecord}
              onEdit={(row) => {
                setEditing(row);
                setDraft(editDraft(active, row));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              onCancelEdit={() => { setEditing(null); setDraft({}); }}
              onUpdate={updateRecord}
              onDelete={deleteRecord}
            />
          )}
          {active === "gym-settings" && principal.role === "ADMIN" && (
            <GymSettings
              gym={gymSettings}
              onSave={async (payload) => {
                try {
                  const result = await apiRequest<{ gym: GymInfo }>("/api/gym", "PATCH", payload);
                  setGymSettings(result.gym);
                  await loadPortal();
                  setNotice("Gym settings updated.");
                } catch (requestError) {
                  setError(requestError instanceof Error ? requestError.message : "Unable to save settings.");
                }
              }}
              onUpload={async (file) => {
                const formData = new FormData();
                formData.set("logo", file);
                const response = await fetch(apiUrl("/api/branding"), {
                  method: "PUT",
                  credentials: "include",
                  body: formData,
                  cache: "no-store",
                });
                const result = (await response.json()) as { logoUrl?: string; warning?: string; error?: string };
                if (!response.ok) throw new Error(result.error ?? "Logo upload failed.");
                await loadPortal();
                setNotice(result.warning ?? "Gym logo updated.");
              }}
              onRemoveLogo={async () => {
                try {
                  const result = await apiRequest<{ warning?: string }>("/api/branding", "DELETE", {});
                  await loadPortal();
                  setNotice(result.warning ?? "Gym logo removed.");
                } catch (requestError) {
                  setError(requestError instanceof Error ? requestError.message : "Unable to remove the logo.");
                }
              }}
            />
          )}
          {principal.role === "SUPER_ADMIN" && active === "platform" && platform && (
            <PlatformPanel data={platform} onReload={loadPlatform} onNotice={setNotice} onError={setError} />
          )}
          {principal.role === "SUPER_ADMIN" && active === "system-settings" && platform && (
            <SystemSettings data={platform} onReload={loadPlatform} onNotice={setNotice} onError={setError} />
          )}
          {principal.role === "SUPER_ADMIN" && active === "activity" && platform && (
            <ActivityPanel audits={platform.audits} />
          )}
          {principal.role === "USER" && active === "profile" && (
            <ProfilePanel
              principal={principal}
              onNotice={setNotice}
              onError={setError}
            />
          )}
        </section>
        <footer className="page-footer"><span>Clieto Fit</span><span>Move well. Feel good. Keep going.</span></footer>
      </main>
    </div>
  );
}

function Overview({
  principal,
  portal,
  onNavigate,
}: {
  principal: Principal;
  portal: PortalData | null;
  onNavigate: (module: Module) => void;
}) {
  const metrics = portal?.metrics;
  if (!metrics) return <div className="empty-state">Dashboard information is unavailable.</div>;
  if (principal.role === "SUPER_ADMIN") {
    return (
      <>
        <div className="welcome-banner platform-banner">
          <div><span className="eyebrow eyebrow-light">THE BIG PICTURE</span><h2>A healthier platform starts here.</h2><p>Keep every gym moving with clear, tenant-safe oversight.</p></div>
          <div className="banner-orbit">C</div>
          <button className="button button-light" onClick={() => onNavigate("platform")}>Manage workspaces <span>→</span></button>
        </div>
        <div className="stat-grid stat-grid-four">
          <StatCard label="Total workspaces" value={metrics.gyms ?? 0} note="Across the platform" icon="▦" tone="green" />
          <StatCard label="Active workspaces" value={metrics.activeGyms ?? 0} note="Currently operating" icon="↗" tone="blue" />
          <StatCard label="Gym administrators" value={metrics.admins ?? 0} note="Trainer accounts" icon="◎" tone="purple" />
          <StatCard label="Member accounts" value={metrics.members ?? 0} note="Across all gyms" icon="◌" tone="orange" />
        </div>
        <div className="section-card platform-shortcut">
          <div><span className="card-kicker">PLATFORM CARE</span><h3>Keep the details in good shape</h3><p>Manage workspace access, platform settings, and a traceable history of sensitive changes.</p></div>
          <button className="button button-outline" onClick={() => onNavigate("activity")}>View recent activity <span>→</span></button>
        </div>
      </>
    );
  }
  if (principal.role === "ADMIN") {
    return (
      <>
        <div className="welcome-banner">
          <div><span className="eyebrow eyebrow-light">YOUR GYM, IN GOOD FORM</span><h2>Make room for progress.</h2><p>Here’s what’s happening at {portal?.gym?.name ?? "your gym"} today.</p></div>
          <div className="banner-orbit">✳</div>
          <button className="button button-light" onClick={() => onNavigate("training")}>Build a training plan <span>→</span></button>
        </div>
        <div className="stat-grid">
          <StatCard label="Active members" value={metrics.members ?? 0} note="Ready to train" icon="◎" tone="green" />
          <StatCard label="Checked in today" value={metrics.attendanceToday ?? 0} note="Local gym day" icon="◷" tone="blue" />
          <StatCard label="Paid this month" value={metrics.paidMembers ?? 0} note={metrics.billingMonth ?? "Current billing month"} icon="✓" tone="purple" />
          <StatCard label="Needs follow-up" value={metrics.unpaidMembers ?? 0} note="Unpaid or no record" icon="!" tone="orange" />
        </div>
        {(metrics.unassignedFees ?? 0) > 0 && (
          <div className="inline-note"><span>↗</span><div><strong>{metrics.unassignedFees} member{metrics.unassignedFees === 1 ? "" : "s"} need a fee structure.</strong><p>Members without an active fee are not included in the monthly paid/unpaid totals.</p></div><button onClick={() => onNavigate("members")}>Review members →</button></div>
        )}
        <div className="section-heading"><div><span className="card-kicker">YOUR WORKSPACE</span><h2>Keep the day moving</h2></div><button className="text-button" onClick={() => onNavigate("gym-settings")}>Gym settings →</button></div>
        <div className="quick-grid">
          <QuickCard icon="◎" title="Members" text="Add members and assign fees." onClick={() => onNavigate("members")} />
          <QuickCard icon="↗" title="Training & diet" text="Make a plan that feels personal." onClick={() => onNavigate("training")} />
          <QuickCard icon="▤" title="Payments" text="Keep monthly records up to date." onClick={() => onNavigate("payments")} />
        </div>
      </>
    );
  }

  const paymentStatus = metrics.paymentStatus ?? "UNRECORDED";
  return (
    <>
      <div className="welcome-banner member-banner">
        <div><span className="eyebrow eyebrow-light">YOUR SPACE TO GROW</span><h2>Show up for yourself.</h2><p>Your plans, progress, and gym essentials are all right here.</p></div>
        <div className="banner-orbit">✳</div>
        <button className="button button-light" onClick={() => onNavigate("training")}>See my training <span>→</span></button>
      </div>
      <div className="stat-grid">
        <StatCard label="Training plans" value={metrics.trainingPlans ?? 0} note="Assigned by your trainer" icon="↗" tone="green" />
        <StatCard label="Diet guidance" value={metrics.dietPlans ?? 0} note="Made for your routine" icon="◌" tone="blue" />
        <StatCard label="Check-ins" value={metrics.attendanceCount ?? 0} note="Your gym visits" icon="◷" tone="purple" />
        <StatCard label="This month" value={paymentStatus === "PAID" ? "Paid" : paymentStatus === "UNRECORDED" ? "Reminder" : "Due"} note={`${metrics.billingMonth ?? ""}${metrics.fee ? ` · ${money(metrics.fee.amountCents)}` : ""}`} icon={paymentStatus === "PAID" ? "✓" : "＄"} tone={paymentStatus === "PAID" ? "green" : "orange"} />
      </div>
      <div className={`member-reminder${paymentStatus === "PAID" ? " reminder-paid" : ""}`}>
        <div className="reminder-symbol">{paymentStatus === "PAID" ? "✓" : "＄"}</div>
        <div className="reminder-copy">
          <span className="card-kicker">{paymentStatus === "PAID" ? "ALL CAUGHT UP" : "MONTHLY MEMBERSHIP"}</span>
          <h3>{paymentStatus === "PAID" ? "You’re all set for this month." : paymentStatus === "UNRECORDED" ? "Your monthly fee is ready when you are." : "A quick payment check-in."}</h3>
          <p>{metrics.fee ? `${metrics.fee.name} · ${money(metrics.fee.amountCents)} per month` : "Ask your gym team about your membership fee."} {metrics.dueAt ? `Due ${formatDate(metrics.dueAt)}.` : ""}</p>
        </div>
        <button className="button button-outline" onClick={() => onNavigate("payments")}>View payments <span>→</span></button>
      </div>
      <div className="section-heading"><div><span className="card-kicker">YOUR GYM</span><h2>Good things to explore</h2></div></div>
      <div className="quick-grid">
        <QuickCard icon="✳" title="Offers" text="See what’s new at your gym." onClick={() => onNavigate("offers")} />
        <QuickCard icon="◈" title="Equipment" text="Explore the tools you can use." onClick={() => onNavigate("equipment")} />
        <QuickCard icon="◷" title="Attendance" text="Keep your streak going." onClick={() => onNavigate("attendance")} />
      </div>
    </>
  );
}

function StatCard({ label, value, note, icon, tone }: { label: string; value: string | number; note: string; icon: string; tone: string }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon tone-${tone}`}>{icon}</div>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-note">{note}</span>
    </article>
  );
}

function QuickCard({ icon, title, text, onClick }: { icon: string; title: string; text: string; onClick: () => void }) {
  return <button className="quick-card" onClick={onClick}><span className="quick-icon">{icon}</span><span><strong>{title}</strong><small>{text}</small></span><span className="quick-arrow">↗</span></button>;
}

function ResourcePanel({
  module,
  role,
  records,
  members,
  fees,
  draft,
  editing,
  busy,
  onField,
  onSubmit,
  onEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
}: {
  module: Module;
  role: Role;
  records: Row[];
  members: Row[];
  fees: Row[];
  draft: Record<string, string>;
  editing: Row | null;
  busy: boolean;
  onField: (name: string, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (row: Row) => void;
  onCancelEdit: () => void;
  onUpdate: (resource: string, id: string, payload: unknown) => void;
  onDelete: (resource: string, id: string) => void;
}) {
  const resource = moduleForResource(module);
  if (!resource) return null;
  const admin = role === "ADMIN";
  const emptyText: Record<string, string> = {
    members: "Your member list is ready for its first name.",
    training: "No training plans here yet.",
    diets: "Diet guidance will show up here when it’s assigned.",
    attendance: "Your check-ins will appear here.",
    fees: "Create a fee structure to make membership costs clear.",
    payments: "No payment records for this billing period yet.",
    offers: "There are no active offers to show right now.",
    equipment: "Equipment details will appear here.",
  };
  return (
    <div className="resource-layout">
      {admin && (
        <section className="section-card editor-card">
          <div className="panel-title-row"><div><span className="card-kicker">{editing ? "EDIT RECORD" : "ADD TO YOUR GYM"}</span><h2>{editorTitle(module, Boolean(editing))}</h2></div>{editing && <button className="text-button" type="button" onClick={onCancelEdit}>Cancel edit</button>}</div>
          <form onSubmit={onSubmit} className="editor-form">
            {editorFields(module, members, fees, draft, onField, Boolean(editing))}
            <button className="button button-primary" disabled={busy}>{busy ? "Saving..." : editing ? "Save changes" : submitLabel(module)}</button>
          </form>
        </section>
      )}
      {!admin && module === "attendance" && (
        <section className="checkin-card">
          <div className="checkin-stamp">◷</div>
          <div><span className="card-kicker">TODAY’S MOMENTUM</span><h2>Make today count.</h2><p>Check in once each gym day. Your gym’s local timezone sets the day.</p></div>
          <form onSubmit={onSubmit}><button className="button button-primary" disabled={busy}>{busy ? "Checking in..." : "Check in today"}</button></form>
        </section>
      )}
      {module === "payments" && role === "ADMIN" && (
        <div className="policy-callout"><span>i</span><p><strong>{currentMonthLabel()}</strong> counts a member as paid only when a PAID record covers the full assigned fee. Partial, refunded, overdue, or unrecorded members remain unpaid.</p></div>
      )}
      <section className="section-card records-card">
        <div className="panel-title-row">
          <div><span className="card-kicker">{admin ? "GYM RECORDS" : "YOUR RECORDS"}</span><h2>{recordHeading(module, records.length)}</h2></div>
          <span className="record-count">{records.length} {records.length === 1 ? "record" : "records"}</span>
        </div>
        {records.length === 0 ? <div className="empty-state"><span className="empty-mark">◌</span><strong>Nothing to show just yet</strong><p>{emptyText[module]}</p></div> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr>{tableHeaders(module, admin).map((header) => <th key={header}>{header}</th>)}{admin && <th className="actions-heading">Actions</th>}</tr></thead>
              <tbody>
                {records.map((row) => (
                  <tr key={row.id}>
                    {tableCells(module, row, admin, fees, onUpdate)}
                    {admin && <td className="row-actions">
                      {module !== "attendance" && <button className="action-button" onClick={() => onEdit(row)}>Edit</button>}
                      {module === "members" && <button className={`action-button ${row.status === "ACTIVE" ? "action-warn" : ""}`} onClick={() => onUpdate(resource, row.id, { status: row.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" })}>{row.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button>}
                      {module === "fees" && <button className="action-button" onClick={() => onUpdate(resource, row.id, { active: !row.active })}>{row.active ? "Deactivate" : "Activate"}</button>}
                      {module === "offers" && <button className="action-button" onClick={() => onUpdate(resource, row.id, { enabled: !row.enabled })}>{row.enabled ? "Disable" : "Enable"}</button>}
                      {module === "payments" && row.status !== "PAID" && row.amountCents !== undefined && row.expectedCents !== undefined && row.amountCents >= row.expectedCents && <button className="action-button" onClick={() => onUpdate(resource, row.id, { status: "PAID" })}>Mark paid</button>}
                      {["training", "diets", "attendance", "offers", "equipment"].includes(module) && <button className="action-button action-warn" onClick={() => onDelete(resource, row.id)}>Delete</button>}
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function editorTitle(module: Module, editing: boolean): string {
  if (editing) return `Update ${singularLabel(module)}`;
  const titlesByModule: Partial<Record<Module, string>> = {
    members: "Create a member account",
    training: "Create a training plan",
    diets: "Add diet guidance",
    attendance: "Record a member check-in",
    fees: "Set up a fee structure",
    payments: "Record a monthly payment",
    offers: "Add an offer",
    equipment: "Add gym equipment",
  };
  return titlesByModule[module] ?? "Add a record";
}

function editorFields(
  module: Module,
  members: Row[],
  fees: Row[],
  draft: Record<string, string>,
  onField: (name: string, value: string) => void,
  editing: boolean,
) {
  const input = (name: string, label: string, options: { type?: string; required?: boolean; placeholder?: string; min?: string; minLength?: number; step?: string; autoComplete?: string } = {}) => (
    <label className="field" key={name}><span>{label}</span><input type={options.type ?? "text"} required={options.required ?? true} placeholder={options.placeholder} min={options.min} minLength={options.minLength} step={options.step} autoComplete={options.autoComplete} value={draft[name] ?? ""} onChange={(event) => onField(name, event.target.value)} /></label>
  );
  const textarea = (name: string, label: string, placeholder: string) => (
    <label className="field field-span" key={name}><span>{label}</span><textarea rows={3} required placeholder={placeholder} value={draft[name] ?? ""} onChange={(event) => onField(name, event.target.value)} /></label>
  );
  const select = (name: string, label: string, choices: Array<{ id: string; name: string }>, placeholder: string) => (
    <label className="field" key={name}><span>{label}</span><select required value={draft[name] ?? ""} onChange={(event) => onField(name, event.target.value)}><option value="">{placeholder}</option>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</select></label>
  );
  const fields: React.ReactNode[] = [];

  if (module === "members") {
    if (!editing) {
      fields.push(input("name", "Full name", { placeholder: "e.g. Maya Chen" }));
      fields.push(input("email", "Email address", { type: "email", placeholder: "maya@example.com" }));
      fields.push(input("password", "Temporary password", { type: "password", minLength: 12, placeholder: "At least 12 characters", autoComplete: "new-password" }));
    }
    fields.push(
      <label className="field" key="feeId"><span>Membership fee</span><select value={draft.feeId ?? ""} onChange={(event) => onField("feeId", event.target.value)}><option value="">Not assigned</option>{fees.map((fee) => <option key={fee.id} value={fee.id}>{fee.name} · {money(fee.amountCents)}</option>)}</select></label>,
    );
  } else if (module === "training" || module === "diets") {
    fields.push(select("memberId", "Assign to member", members.map((member) => ({ id: member.id, name: member.name ?? member.email ?? "Member" })), "Choose a member"));
    fields.push(input("title", "Title", { placeholder: module === "training" ? "e.g. Strength foundations" : "e.g. Everyday fuel" }));
    fields.push(textarea("details", module === "training" ? "Plan details" : "Guidance", "Add clear, supportive details."));
  } else if (module === "attendance") {
    fields.push(select("memberId", "Member", members.map((member) => ({ id: member.id, name: member.name ?? member.email ?? "Member" })), "Choose a member"));
  } else if (module === "fees") {
    fields.push(input("name", "Fee name", { placeholder: "e.g. Monthly membership" }));
    fields.push(input("amount", "Monthly amount", { type: "number", min: "0.01", step: "0.01", placeholder: "e.g. 49.00" }));
    fields.push(textarea("description", "Description", "What does this membership include?"));
  } else if (module === "payments") {
    if (!editing) {
      fields.push(select("memberId", "Member", members.map((member) => ({ id: member.id, name: member.name ?? member.email ?? "Member" })), "Choose a member"));
    }
    fields.push(input("billingMonth", "Billing month", { type: "month", placeholder: currentMonthLabel() }));
    fields.push(input("amount", "Amount received", { type: "number", min: "0", step: "0.01", placeholder: "e.g. 49.00" }));
    fields.push(
      <label className="field" key="status"><span>Payment status</span><select required value={draft.status ?? "PAID"} onChange={(event) => onField("status", event.target.value)}><option value="PAID">Paid in full</option><option value="PARTIAL">Partial</option><option value="OVERDUE">Overdue</option><option value="REFUNDED">Refunded</option></select></label>,
    );
    fields.push(input("dueAt", "Due date (optional)", { type: "date", required: false }));
  } else if (module === "offers") {
    fields.push(input("title", "Offer title", { placeholder: "e.g. Bring a friend week" }));
    fields.push(textarea("description", "Description", "Share the details and eligibility."));
    fields.push(input("startsAt", "Starts (optional)", { type: "datetime-local", required: false }));
    fields.push(input("endsAt", "Ends (optional)", { type: "datetime-local", required: false }));
    fields.push(<label className="check-field" key="enabled"><input type="checkbox" checked={draft.enabled === "true"} onChange={(event) => onField("enabled", String(event.target.checked))} /><span>Make this offer visible to eligible members</span></label>);
  } else if (module === "equipment") {
    fields.push(input("name", "Equipment name", { placeholder: "e.g. Adjustable bench" }));
    fields.push(textarea("description", "Details", "Add useful notes for members."));
  }
  return fields;
}

function buildRecordPayload(module: Module, draft: Record<string, string>, role: Role, editing: Row | null) {
  if (module === "members") {
    const payload: Record<string, unknown> = { feeId: draft.feeId || null };
    if (!editing) Object.assign(payload, { name: draft.name, email: draft.email, password: draft.password });
    return payload;
  }
  if (module === "training" || module === "diets") {
    return { title: draft.title, details: draft.details, memberId: draft.memberId };
  }
  if (module === "attendance") return role === "ADMIN" ? { memberId: draft.memberId } : {};
  if (module === "fees") {
    return { name: draft.name, amountCents: Math.round(Number(draft.amount) * 100), description: draft.description ?? "" };
  }
  if (module === "payments") {
    return {
      memberId: draft.memberId,
      billingMonth: draft.billingMonth,
      amountCents: Math.round(Number(draft.amount) * 100),
      status: draft.status || "PAID",
      dueAt: draft.dueAt ? new Date(`${draft.dueAt}T12:00:00`).toISOString() : null,
    };
  }
  if (module === "offers") {
    return {
      title: draft.title,
      description: draft.description ?? "",
      enabled: draft.enabled === "true",
      startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
      endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
    };
  }
  return { name: draft.name, description: draft.description ?? "" };
}

function editDraft(module: Module, row: Row): Record<string, string> {
  if (module === "members") return { feeId: row.feeId ?? "" };
  if (module === "training" || module === "diets") {
    return { title: row.title ?? "", details: row.details ?? "", memberId: row.memberId ?? row.member?.id ?? "" };
  }
  if (module === "fees") {
    return { name: row.name ?? "", amount: row.amountCents === undefined ? "" : (row.amountCents / 100).toFixed(2), description: row.description ?? "" };
  }
  if (module === "payments") {
    return { amount: row.amountCents === undefined ? "" : (row.amountCents / 100).toFixed(2), status: row.status ?? "PARTIAL", dueAt: row.dueAt?.slice(0, 10) ?? "" };
  }
  if (module === "offers") {
    return { title: row.title ?? "", description: row.description ?? "", enabled: String(row.enabled ?? false), startsAt: dateTimeInput(row.startsAt), endsAt: dateTimeInput(row.endsAt) };
  }
  if (module === "equipment") return { name: row.name ?? "", description: row.description ?? "" };
  return {};
}

function tableHeaders(module: Module, admin: boolean): string[] {
  const values: Record<string, string[]> = {
    members: ["Member", "Email", "Membership fee", "Status"],
    training: [admin ? "Plan" : "Training plan", ...(admin ? ["Member"] : []), "Details"],
    diets: [admin ? "Guidance" : "Diet guidance", ...(admin ? ["Member"] : []), "Details"],
    attendance: [admin ? "Member" : "Check-in date", ...(admin ? ["Gym day"] : []), "Checked in"],
    fees: ["Membership", "Monthly fee", "Details", "Status"],
    payments: [...(admin ? ["Member"] : []), "Billing month", "Amount", "Status", "Due date"],
    offers: ["Offer", "Details", "Validity", "Status"],
    equipment: ["Equipment", "Details"],
  };
  return values[module] ?? [];
}

function tableCells(module: Module, row: Row, admin: boolean, fees: Row[], onUpdate: (resource: string, id: string, payload: unknown) => void) {
  const nameCell = (title: string, subtitle?: string) => <td><strong className="cell-title">{title}</strong>{subtitle && <small className="cell-subtitle">{subtitle}</small>}</td>;
  const status = (value: string | undefined, good = value === "ACTIVE" || value === "PAID" || value === "ENABLED") => <span className={`status-pill ${good ? "status-good" : "status-muted"}`}><i />{humanize(value ?? "—")}</span>;
  if (module === "members") {
    return <>
      {nameCell(row.name ?? "Member")}
      <td>{row.email}</td>
      <td>{admin ? <select aria-label={`Fee for ${row.name}`} className="inline-select" value={row.feeId ?? ""} onChange={(event) => onUpdate("members", row.id, { feeId: event.target.value || null })}><option value="">No fee</option>{fees.map((fee) => <option key={fee.id} value={fee.id}>{fee.name} · {money(fee.amountCents)}</option>)}</select> : row.fee?.name ?? "Not assigned"}</td>
      <td>{status(row.status)}</td>
    </>;
  }
  if (module === "training" || module === "diets") {
    return <>{nameCell(row.title ?? "Plan")}{admin && <td>{row.member?.name ?? "Member"}</td>}<td className="details-cell">{row.details}</td></>;
  }
  if (module === "attendance") {
    return <>{nameCell(admin ? row.user?.name ?? "Member" : row.localDate ?? "Check-in")}{admin && <td>{row.localDate}</td>}<td>{formatDate(row.checkedAt)}</td></>;
  }
  if (module === "fees") {
    return <>{nameCell(row.name ?? "Membership")}{<td className="amount-cell">{money(row.amountCents)}<small> / month</small></td>}<td className="details-cell">{row.description || "—"}</td><td>{status(row.active ? "ACTIVE" : "INACTIVE")}</td></>;
  }
  if (module === "payments") {
    return <>{admin && nameCell(row.member?.name ?? "Member")}<td>{row.billingMonth}</td><td className="amount-cell">{money(row.amountCents)}{row.expectedCents !== undefined && row.amountCents !== row.expectedCents && <small> of {money(row.expectedCents)}</small>}</td><td>{status(row.status, row.status === "PAID" && (row.amountCents ?? 0) >= (row.expectedCents ?? 0))}</td><td>{formatDate(row.dueAt)}</td></>;
  }
  if (module === "offers") {
    return <>{nameCell(row.title ?? "Offer")}<td className="details-cell">{row.description || "—"}</td><td>{row.startsAt ? formatDate(row.startsAt) : "Anytime"}{row.endsAt ? ` – ${formatDate(row.endsAt)}` : ""}</td><td>{status(row.enabled ? "ENABLED" : "DISABLED", row.enabled)}</td></>;
  }
  return <>{nameCell(row.name ?? "Equipment")}<td className="details-cell">{row.description || "—"}</td></>;
}

function GymSettings({
  gym,
  onSave,
  onUpload,
  onRemoveLogo,
}: {
  gym: GymInfo | null;
  onSave: (payload: { name: string; timezone: string }) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  onRemoveLogo: () => Promise<void>;
}) {
  const [name, setName] = useState(gym?.name ?? "");
  const [timezone, setTimezone] = useState(gym?.timezone ?? "UTC");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("");
    try { await onSave({ name, timezone }); setMessage("Settings saved."); }
    finally { setWorking(false); }
  }
  async function upload(event: FormEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setWorking(true);
    setMessage("");
    try { await onUpload(file); setMessage("Logo updated."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Logo upload failed."); }
    finally { setWorking(false); event.currentTarget.value = ""; }
  }
  return (
    <div className="settings-grid">
      <section className="section-card settings-card">
        <span className="card-kicker">GYM PROFILE</span><h2>Make it yours</h2><p className="muted">Your name and timezone shape how your team sees check-ins and daily activity.</p>
        <form className="form-stack settings-form" onSubmit={(event) => void save(event)}>
          <label className="field"><span>Gym name</span><input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} /></label>
          <label className="field"><span>Timezone</span><input value={timezone} onChange={(event) => setTimezone(event.target.value)} required placeholder="America/Los_Angeles" /></label>
          <small className="field-hint">Use an IANA timezone, like America/Los_Angeles or Asia/Kolkata.</small>
          <button className="button button-primary" disabled={working}>Save gym settings</button>
        </form>
        {message && <p className="inline-feedback" role="status">{message}</p>}
      </section>
      <section className="section-card settings-card">
        <span className="card-kicker">GYM BRANDING</span><h2>A familiar welcome</h2><p className="muted">Upload a square PNG, JPEG, or WebP logo up to 2 MB. Only your gym can change this image.</p>
        <div className="logo-preview">{gym?.logoUrl ? <Image src={apiUrl(`/api/branding/${gym.id}?v=${encodeURIComponent(gym.logoUrl)}`)} alt={`${gym.name} logo`} width={96} height={96} unoptimized /> : <span>{gym?.name?.slice(0, 1).toUpperCase() ?? "C"}</span>}</div>
        <div className="logo-actions"><label className="button button-outline upload-label">Choose logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void upload(event)} disabled={working} /></label>{gym?.logoUrl && <button className="button button-quiet" onClick={() => void onRemoveLogo()}>Remove</button>}</div>
        {message && <p className="inline-feedback" role="status">{message}</p>}
      </section>
    </div>
  );
}

function PlatformPanel({
  data,
  onReload,
  onNotice,
  onError,
}: {
  data: PlatformData;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [gymDraft, setGymDraft] = useState({ name: "", slug: "", timezone: "UTC" });
  const [accountDraft, setAccountDraft] = useState({ name: "", email: "", password: "", role: "ADMIN", gymId: "" });
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>, action: "create-gym" | "create-account") {
    event.preventDefault();
    setBusy(true);
    onError("");
    try {
      await apiRequest("/api/platform", "POST", action === "create-gym" ? { action, ...gymDraft } : { action, ...accountDraft });
      onNotice(action === "create-gym" ? "Workspace created." : "Account created.");
      if (action === "create-gym") setGymDraft({ name: "", slug: "", timezone: "UTC" });
      else setAccountDraft({ name: "", email: "", password: "", role: "ADMIN", gymId: "" });
      await onReload();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not create this record.");
    } finally { setBusy(false); }
  }
  return (
    <div className="platform-layout">
      <div className="platform-forms">
        <section className="section-card settings-card">
          <span className="card-kicker">NEW WORKSPACE</span><h2>Bring a gym on board</h2><p className="muted">Each workspace is isolated from other gyms.</p>
          <form className="form-stack" onSubmit={(event) => void submit(event, "create-gym")}>
            <label className="field"><span>Gym name</span><input required minLength={2} maxLength={100} value={gymDraft.name} onChange={(event) => setGymDraft({ ...gymDraft, name: event.target.value })} placeholder="Northside Strength" /></label>
            <label className="field"><span>Workspace slug</span><input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={60} value={gymDraft.slug} onChange={(event) => setGymDraft({ ...gymDraft, slug: event.target.value.toLowerCase() })} placeholder="northside-strength" /></label>
            <label className="field"><span>Timezone</span><input required value={gymDraft.timezone} onChange={(event) => setGymDraft({ ...gymDraft, timezone: event.target.value })} placeholder="America/Los_Angeles" /></label>
            <button className="button button-primary" disabled={busy}>Create workspace</button>
          </form>
        </section>
        <section className="section-card settings-card">
          <span className="card-kicker">NEW ACCOUNT</span><h2>Give a team member access</h2><p className="muted">Share their temporary password with them privately.</p>
          <form className="form-stack" onSubmit={(event) => void submit(event, "create-account")}>
            <label className="field"><span>Full name</span><input required minLength={2} maxLength={100} value={accountDraft.name} onChange={(event) => setAccountDraft({ ...accountDraft, name: event.target.value })} /></label>
            <label className="field"><span>Email</span><input required type="email" value={accountDraft.email} onChange={(event) => setAccountDraft({ ...accountDraft, email: event.target.value })} /></label>
            <label className="field"><span>Temporary password</span><input required type="password" minLength={12} autoComplete="new-password" value={accountDraft.password} onChange={(event) => setAccountDraft({ ...accountDraft, password: event.target.value })} /></label>
            <label className="field"><span>Role</span><select value={accountDraft.role} onChange={(event) => setAccountDraft({ ...accountDraft, role: event.target.value })}><option value="ADMIN">Gym administrator</option><option value="USER">Member</option></select></label>
            <label className="field"><span>Workspace</span><select required value={accountDraft.gymId} onChange={(event) => setAccountDraft({ ...accountDraft, gymId: event.target.value })}><option value="">Choose a gym</option>{data.gyms.filter((gym) => gym.status === "ACTIVE").map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}</select></label>
            <button className="button button-primary" disabled={busy || data.gyms.length === 0}>Create account</button>
          </form>
        </section>
      </div>
      <section className="section-card records-card">
        <div className="panel-title-row"><div><span className="card-kicker">PLATFORM WORKSPACES</span><h2>{data.gyms.length} {data.gyms.length === 1 ? "gym" : "gyms"}</h2></div></div>
        {data.gyms.length === 0 ? <div className="empty-state"><strong>No workspaces yet</strong><p>Create a gym to get started.</p></div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Gym</th><th>Timezone</th><th>Accounts</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.gyms.map((gym) => <tr key={gym.id}><td><strong className="cell-title">{gym.name}</strong><small className="cell-subtitle">{gym.slug}</small></td><td>{gym.timezone}</td><td>{gym._count.users}</td><td><span className={`status-pill ${gym.status === "ACTIVE" ? "status-good" : "status-muted"}`}><i />{humanize(gym.status)}</span></td><td><button className="action-button" onClick={() => void patchPlatform({ target: "gym", id: gym.id, status: gym.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }, onReload, onNotice, onError)}>{gym.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button></td></tr>)}</tbody></table></div>}
      </section>
      <section className="section-card records-card">
        <div className="panel-title-row"><div><span className="card-kicker">PLATFORM ACCOUNTS</span><h2>{data.accounts.length} accounts</h2></div></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Account</th><th>Role</th><th>Workspace</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.accounts.map((account) => <tr key={account.id}><td><strong className="cell-title">{account.name}</strong><small className="cell-subtitle">{account.email}</small></td><td>{humanize(account.role)}</td><td>{account.gym?.name ?? "—"}</td><td><span className={`status-pill ${account.status === "ACTIVE" ? "status-good" : "status-muted"}`}><i />{humanize(account.status)}</span></td><td><button className="action-button" onClick={() => void patchPlatform({ target: "account", id: account.id, status: account.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }, onReload, onNotice, onError)}>{account.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button></td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}

async function patchPlatform(payload: unknown, reload: () => Promise<void>, notice: (message: string) => void, error: (message: string) => void) {
  try { await apiRequest("/api/platform", "PATCH", payload); notice("Platform record updated."); await reload(); }
  catch (requestError) { error(requestError instanceof Error ? requestError.message : "Could not update platform record."); }
}

function SystemSettings({ data, onReload, onNotice, onError }: { data: PlatformData; onReload: () => Promise<void>; onNotice: (message: string) => void; onError: (message: string) => void }) {
  const values = Object.fromEntries(data.settings.map((setting) => [setting.key, setting.value]));
  const [draft, setDraft] = useState({
    platform_name: values.platform_name ?? "Clieto Fit",
    support_email: values.support_email ?? "",
    maintenance_mode: values.maintenance_mode ?? "false",
  });
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      for (const [key, value] of Object.entries(draft)) {
        if (key === "support_email" && !value) continue;
        await apiRequest("/api/platform", "POST", { action: "set-setting", key, value });
      }
      onNotice("Platform settings saved.");
      await onReload();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to save platform settings.");
    }
  }
  return <section className="section-card settings-card narrow-settings"><span className="card-kicker">PLATFORM CONFIGURATION</span><h2>Set the tone</h2><p className="muted">Only known, non-secret settings can be managed here. Sensitive actions are recorded.</p><form className="form-stack settings-form" onSubmit={(event) => void save(event)}><label className="field"><span>Platform name</span><input required maxLength={80} value={draft.platform_name} onChange={(event) => setDraft({ ...draft, platform_name: event.target.value })} /></label><label className="field"><span>Support email</span><input type="email" value={draft.support_email} onChange={(event) => setDraft({ ...draft, support_email: event.target.value })} placeholder="help@example.com" /></label><label className="field"><span>Maintenance mode</span><select value={draft.maintenance_mode} onChange={(event) => setDraft({ ...draft, maintenance_mode: event.target.value })}><option value="false">Off</option><option value="true">On</option></select><small className="field-hint">This setting is informational; it does not block sign-in.</small></label><button className="button button-primary">Save settings</button></form></section>;
}

function ActivityPanel({ audits }: { audits: PlatformData["audits"] }) {
  return <section className="section-card records-card"><div className="panel-title-row"><div><span className="card-kicker">SUPER ADMIN ACTIONS</span><h2>Recent platform activity</h2></div><span className="record-count">Latest {audits.length}</span></div>{audits.length === 0 ? <div className="empty-state"><strong>No activity recorded</strong><p>Platform changes will be listed here.</p></div> : <div className="activity-list">{audits.map((audit) => <article className="activity-item" key={audit.id}><span className="activity-icon">◷</span><div><strong>{humanize(audit.action)}</strong><p>{audit.actor?.name ?? "A platform administrator"} · {audit.entityType} · {audit.entityId.slice(0, 10)}</p></div><time>{formatDate(audit.createdAt)}</time></article>)}</div>}<p className="field-hint activity-note">Audit entries record action type and record ID only, not member health or payment details.</p></section>;
}

function ProfilePanel({ principal, onNotice, onError }: { principal: Principal; onNotice: (message: string) => void; onError: (message: string) => void }) {
  const [name, setName] = useState(principal.name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onError("");
    try {
      await apiRequest("/api/account", "PATCH", {
        name,
        ...(newPassword ? { currentPassword, newPassword } : {}),
      });
      setCurrentPassword("");
      setNewPassword("");
      onNotice("Your account is updated.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to update your account.");
    } finally { setBusy(false); }
  }
  return <section className="section-card settings-card narrow-settings"><span className="card-kicker">YOUR PROFILE</span><h2>Keep your account current</h2><p className="muted">{principal.email} · {principal.gymName ?? "Clieto Fit"}</p><form className="form-stack settings-form" onSubmit={(event) => void save(event)}><label className="field"><span>Your name</span><input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label><div className="form-divider" /><span className="card-kicker">CHANGE PASSWORD</span><label className="field"><span>Current password</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required={Boolean(newPassword)} /></label><label className="field"><span>New password</span><input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 12 characters" /></label><button className="button button-primary" disabled={busy}>{busy ? "Saving..." : "Save account"}</button></form></section>;
}

function pageDescription(module: Module, role: Role, gymName?: string): string {
  if (module === "overview") return role === "SUPER_ADMIN" ? "A clear view across every workspace, with the right boundaries." : role === "ADMIN" ? `A little structure goes a long way at ${gymName ?? "your gym"}.` : "Your next small step is waiting for you.";
  if (module === "payments") return role === "USER" ? "A transparent record of your monthly membership." : "Manual payment records, with monthly status derived from the assigned fee.";
  if (module === "attendance") return role === "USER" ? "Your check-ins, in your gym’s local time." : "A quick view of gym check-ins and daily momentum.";
  if (module === "platform") return "Set up gyms and keep platform accounts in the right hands.";
  if (module === "gym-settings") return "Set your gym timezone, name, and member-facing logo.";
  if (module === "system-settings") return "A small set of platform-wide operational preferences.";
  if (module === "activity") return "A traceable history of sensitive platform-level changes.";
  if (module === "profile") return "Manage the details and password for your own account.";
  return "Everything you need, with access scoped to the right people.";
}

function recordHeading(module: Module, count: number): string {
  if (module === "members") return `${count} ${count === 1 ? "member" : "members"}`;
  if (module === "training") return "Training plans";
  if (module === "diets") return "Diet guidance";
  if (module === "attendance") return "Check-in history";
  if (module === "fees") return "Membership fees";
  if (module === "payments") return "Monthly payment records";
  if (module === "offers") return "Offers";
  return "Gym equipment";
}

function submitLabel(module: Module): string {
  const labels: Partial<Record<Module, string>> = {
    members: "Create member",
    training: "Add training plan",
    diets: "Add diet guidance",
    attendance: "Record check-in",
    fees: "Create fee structure",
    payments: "Add payment record",
    offers: "Create offer",
    equipment: "Add equipment",
  };
  return labels[module] ?? "Add record";
}

function singularLabel(module: Module): string {
  const labels: Partial<Record<Module, string>> = {
    members: "member",
    training: "training plan",
    diets: "diet guidance",
    fees: "fee structure",
    payments: "payment record",
    offers: "offer",
    equipment: "equipment",
  };
  return labels[module] ?? "record";
}

function humanize(value: string): string {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "there";
}

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

function currentMonthLabel(): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date());
}
