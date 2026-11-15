import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import {
  ApiError,
  checkIn,
  getCurrentUser,
  getPortal,
  getRecords,
  signIn,
  signOut,
} from "./src/api";
import type {
  PortalMetrics,
  PortalResponse,
  Principal,
  RecordSummary,
  Role,
  Section,
  SectionConfig,
} from "./src/types";

const TOKEN_KEY = "clieto-fit.session-token";

const sectionsByRole: Record<Role, SectionConfig[]> = {
  SUPER_ADMIN: [{ id: "overview", label: "Overview" }],
  ADMIN: [
    { id: "overview", label: "Overview" },
    { id: "members", label: "Members", resource: "members" },
    { id: "training", label: "Training", resource: "training" },
    { id: "diets", label: "Diet guidance", resource: "diets" },
    { id: "attendance", label: "Attendance", resource: "attendance" },
    { id: "fees", label: "Fees", resource: "fees" },
    { id: "payments", label: "Payments", resource: "payments" },
    { id: "offers", label: "Offers", resource: "offers" },
    { id: "equipment", label: "Equipment", resource: "equipment" },
  ],
  USER: [
    { id: "overview", label: "Overview" },
    { id: "training", label: "My training", resource: "training" },
    { id: "diets", label: "Diet guidance", resource: "diets" },
    { id: "attendance", label: "Attendance", resource: "attendance" },
    { id: "fees", label: "Membership fee", resource: "fees" },
    { id: "payments", label: "Payments", resource: "payments" },
    { id: "offers", label: "Offers", resource: "offers" },
    { id: "equipment", label: "Equipment", resource: "equipment" },
  ],
};

const roleOptions: { value: Role; label: string }[] = [
  { value: "USER", label: "Member" },
  { value: "ADMIN", label: "Gym admin" },
  { value: "SUPER_ADMIN", label: "Super admin" },
];

const sectionTitles: Record<Section, string> = {
  overview: "Your overview",
  members: "Gym members",
  training: "Training plans",
  diets: "Diet guidance",
  attendance: "Attendance",
  fees: "Fee structures",
  payments: "Payment history",
  offers: "Gym offers",
  equipment: "Equipment",
};

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function money(cents?: number | null): string {
  if (typeof cents !== "number") return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function displayDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function roleName(role: Role): string {
  return roleOptions.find((option) => option.value === role)?.label ?? "Member";
}

async function getSavedSession(): Promise<{
  token: string;
  user: Principal;
} | null> {
  const savedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!savedToken) return null;
  try {
    const { user } = await getCurrentUser(savedToken);
    return { token: savedToken, user };
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 401) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      return null;
    }
    throw caught;
  }
}

function LoginScreen({
  onLogin,
  error,
  startupError,
  onRetry,
}: {
  onLogin: (email: string, password: string, role: Role) => Promise<void>;
  error: string;
  startupError: string;
  onRetry: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("USER");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await onLogin(email.trim(), password, role);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.loginKeyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.loginScroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.loginCard}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>CF</Text>
            </View>
            <Text style={styles.brandName}>CLIETO FIT</Text>
            <Text style={styles.loginTitle}>Your fitness, in focus.</Text>
            <Text style={styles.mutedText}>
              Sign in with your Clieto Fit portal account.
            </Text>

            <Text style={styles.fieldLabel}>Sign in as</Text>
            <View style={styles.roleChoices}>
              {roleOptions.map((option) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: role === option.value }}
                  key={option.value}
                  onPress={() => setRole(option.value)}
                  style={[
                    styles.roleChoice,
                    role === option.value && styles.roleChoiceSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.roleChoiceText,
                      role === option.value && styles.roleChoiceTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={COLORS.muted}
              style={styles.input}
              textContentType="emailAddress"
              value={email}
            />
            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoComplete="password"
              onChangeText={setPassword}
              onSubmitEditing={submit}
              placeholder="Your password"
              placeholderTextColor={COLORS.muted}
              secureTextEntry
              style={styles.input}
              textContentType="password"
              value={password}
            />
            {startupError ? (
              <View style={styles.alert}>
                <Text style={styles.alertText}>{startupError}</Text>
                <Pressable accessibilityRole="button" onPress={onRetry}>
                  <Text style={styles.alertAction}>Retry saved session</Text>
                </Pressable>
              </View>
            ) : null}
            {error ? (
              <Text accessibilityRole="alert" style={styles.errorText}>
                {error}
              </Text>
            ) : null}
            <PrimaryButton
              disabled={busy || !email.trim() || !password}
              label={busy ? "Signing in..." : "Sign in"}
              onPress={submit}
            />
            <Text style={styles.loginFootnote}>
              Your account permissions are verified by the Clieto Fit API.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      {disabled && label.includes("...") ? (
        <ActivityIndicator color={COLORS.ink} />
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
    </View>
  );
}

function RecordCard({
  record,
  section,
}: {
  record: RecordSummary;
  section: Exclude<Section, "overview">;
}) {
  let title = "Record";
  let detail = "";
  let meta = "";

  if (section === "members") {
    title = record.name ?? "Member";
    detail = record.email ?? "";
    meta = record.fee?.name ?? record.status ?? "";
  } else if (section === "training" || section === "diets") {
    title = record.title ?? "Plan";
    detail = record.details ?? "";
    meta = record.member?.name ? `For ${record.member.name}` : "";
  } else if (section === "attendance") {
    title = record.user?.name ?? "Check-in";
    detail = record.localDate ? `Gym date · ${record.localDate}` : "";
    meta = record.checkedAt ? displayDate(record.checkedAt) : "";
  } else if (section === "fees") {
    title = record.name ?? "Fee";
    detail = record.description ?? "";
    meta = `${money(record.amountCents)} · ${record.active ? "Active" : "Inactive"}`;
  } else if (section === "payments") {
    title = record.member?.name ?? record.billingMonth ?? "Payment";
    detail = record.billingMonth ? `Billing month · ${record.billingMonth}` : "";
    meta = `${record.status ?? "Recorded"} · ${money(record.amountCents)}`;
  } else if (section === "offers") {
    title = record.title ?? "Offer";
    detail = record.description ?? "";
    meta = record.enabled ? "Available" : "Not currently available";
  } else if (section === "equipment") {
    title = record.name ?? "Equipment";
    detail = record.description ?? "";
  }

  return (
    <View style={styles.recordCard}>
      <View style={styles.recordHeader}>
        <Text style={styles.recordTitle}>{title}</Text>
        {section === "offers" ? (
          <View style={[styles.statusDot, !record.enabled && styles.statusDotMuted]} />
        ) : null}
      </View>
      {detail ? <Text style={styles.recordDetail}>{detail}</Text> : null}
      {meta ? <Text style={styles.recordMeta}>{meta}</Text> : null}
    </View>
  );
}

function Metrics({
  role,
  metrics,
}: {
  role: Role;
  metrics: PortalMetrics;
}) {
  let items: { label: string; value: string | number; hint?: string }[] = [];

  if (role === "SUPER_ADMIN") {
    items = [
      { label: "Gyms", value: metrics.gyms ?? 0 },
      { label: "Active gyms", value: metrics.activeGyms ?? 0 },
      { label: "Gym admins", value: metrics.admins ?? 0 },
      { label: "Members", value: metrics.members ?? 0 },
    ];
  } else if (role === "ADMIN") {
    items = [
      { label: "Members", value: metrics.members ?? 0 },
      { label: "Today's check-ins", value: metrics.attendanceToday ?? 0 },
      {
        label: "Paid this month",
        value: metrics.paidMembers ?? 0,
        hint: metrics.billingMonth,
      },
      {
        label: "Awaiting payment",
        value: metrics.unpaidMembers ?? 0,
        hint: metrics.unassignedFees
          ? `${metrics.unassignedFees} without an active fee`
          : undefined,
      },
    ];
  } else {
    items = [
      {
        label: "Monthly fee",
        value: metrics.fee ? money(metrics.fee.amountCents) : "Not assigned",
        hint: metrics.fee?.name,
      },
      {
        label: "Payment status",
        value: metrics.paymentStatus ?? "Unrecorded",
        hint: metrics.billingMonth,
      },
      { label: "Training plans", value: metrics.trainingPlans ?? 0 },
      { label: "Diet plans", value: metrics.dietPlans ?? 0 },
      { label: "Check-ins", value: metrics.attendanceCount ?? 0 },
    ];
  }

  return (
    <View style={styles.metricsGrid}>
      {items.map((item) => (
        <MetricCard key={item.label} {...item} />
      ))}
    </View>
  );
}

function Dashboard({
  principal,
  token,
  onLogout,
}: {
  principal: Principal;
  token: string;
  onLogout: () => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const [section, setSection] = useState<Section>("overview");
  const [portal, setPortal] = useState<PortalResponse | null>(null);
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [members, setMembers] = useState<RecordSummary[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [loadingPortal, setLoadingPortal] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expired, setExpired] = useState(false);
  const sections = sectionsByRole[principal.role];
  const selectedConfig = sections.find((item) => item.id === section);

  const handleError = useCallback(
    async (caught: unknown) => {
      if (caught instanceof ApiError && caught.status === 401) {
        setExpired(true);
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
      setError(errorMessage(caught));
    },
    [],
  );

  const loadPortal = useCallback(async () => {
    try {
      setPortal(await getPortal(token));
    } catch (caught) {
      await handleError(caught);
    } finally {
      setLoadingPortal(false);
    }
  }, [handleError, token]);

  const loadRecords = useCallback(async () => {
    if (!selectedConfig?.resource) return;
    try {
      setRecords(await getRecords(token, selectedConfig.resource));
    } catch (caught) {
      await handleError(caught);
    } finally {
      setLoadingRecords(false);
    }
  }, [handleError, selectedConfig, token]);

  useEffect(() => {
    let active = true;
    getPortal(token)
      .then((result) => {
        if (active) setPortal(result);
      })
      .catch(async (caught: unknown) => {
        if (active) await handleError(caught);
      })
      .finally(() => {
        if (active) setLoadingPortal(false);
      });
    return () => {
      active = false;
    };
  }, [handleError, token]);

  useEffect(() => {
    if (!selectedConfig?.resource) return;
    let active = true;
    getRecords(token, selectedConfig.resource)
      .then((result) => {
        if (active) setRecords(result);
      })
      .catch(async (caught: unknown) => {
        if (active) await handleError(caught);
      })
      .finally(() => {
        if (active) setLoadingRecords(false);
      });
    return () => {
      active = false;
    };
  }, [handleError, selectedConfig, token]);

  useEffect(() => {
    if (section !== "attendance" || principal.role !== "ADMIN") return;
    let active = true;
    getRecords(token, "members")
      .then((result) => {
        if (active) setMembers(result.filter((member) => member.status === "ACTIVE"));
      })
      .catch((caught: unknown) => {
        if (active) void handleError(caught);
      });
    return () => {
      active = false;
    };
  }, [handleError, principal.role, section, token]);

  useEffect(() => {
    if (expired) {
      void onLogout().catch((caught: unknown) => setError(errorMessage(caught)));
    }
  }, [expired, onLogout]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadPortal(), loadRecords()]);
    setRefreshing(false);
  };

  const handleCheckIn = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await checkIn(
        token,
        principal.role === "ADMIN" ? selectedMemberId : undefined,
      );
      setNotice("Attendance checked in successfully.");
      setSelectedMemberId("");
      await Promise.all([loadRecords(), loadPortal()]);
    } catch (caught) {
      await handleError(caught);
    } finally {
      setBusy(false);
    }
  };

  const doLogout = async () => {
    setError("");
    try {
      await onLogout();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const contentWidth = Math.min(width - 36, 840);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.appShell}>
        <View style={[styles.topBar, { width: contentWidth }]}>
          <View style={styles.brandRow}>
            <View style={styles.brandMarkSmall}>
              <Text style={styles.brandMarkSmallText}>CF</Text>
            </View>
            <View>
              <Text style={styles.topBrand}>CLIETO FIT</Text>
              <Text style={styles.topGym}>
                {portal?.gym?.name ?? principal.gymName ?? roleName(principal.role)}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={doLogout}
            style={styles.signOutButton}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.dashboardContent, { width: contentWidth }]}
          refreshControl={
            <RefreshControl
              colors={[COLORS.accent]}
              onRefresh={refresh}
              refreshing={refreshing}
              tintColor={COLORS.accent}
            />
          }
        >
          <View style={styles.welcomePanel}>
            <Text style={styles.eyebrow}>{roleName(principal.role)}</Text>
            <Text style={styles.welcomeTitle}>Welcome, {principal.name.split(" ")[0]}</Text>
            <Text style={styles.welcomeSubtitle}>
              {portal?.gym?.name
                ? `Your ${portal.gym.name} fitness space.`
                : "Your fitness progress, all in one place."}
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={styles.sectionNav}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {sections.map((item) => (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: section === item.id }}
                key={item.id}
                onPress={() => {
                  setSection(item.id);
                  if (item.resource) {
                    setRecords([]);
                    setLoadingRecords(true);
                  }
                  setError("");
                  setNotice("");
                }}
                style={[
                  styles.sectionTab,
                  section === item.id && styles.sectionTabSelected,
                ]}
              >
                <Text
                  style={[
                    styles.sectionTabText,
                    section === item.id && styles.sectionTabTextSelected,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {error ? (
            <Text accessibilityRole="alert" style={styles.errorText}>
              {error}
            </Text>
          ) : null}
          {notice ? <Text style={styles.successText}>{notice}</Text> : null}

          {section === "overview" ? (
            <View>
              <Text style={styles.sectionHeading}>Your snapshot</Text>
              {loadingPortal ? (
                <LoadingIndicator />
              ) : portal ? (
                <Metrics role={principal.role} metrics={portal.metrics} />
              ) : (
                <EmptyState message="Overview data is not available." />
              )}
              {principal.role === "USER" && portal?.metrics.dueAt ? (
                <Text style={styles.dueText}>
                  Payment due · {displayDate(portal.metrics.dueAt)}
                </Text>
              ) : null}
              <Text style={styles.privacyNote}>
                Account access and data are protected by your portal role.
              </Text>
            </View>
          ) : (
            <View>
              <View style={styles.sectionHeadingRow}>
                <View style={styles.sectionHeadingCopy}>
                  <Text style={styles.sectionHeading}>{sectionTitles[section]}</Text>
                  <Text style={styles.sectionSubheading}>
                    {section === "attendance" && principal.role === "USER"
                      ? "Your check-ins at this gym."
                      : "Information provided by your gym."}
                  </Text>
                </View>
                {section === "attendance" && principal.role === "USER" ? (
                  <PrimaryButton
                    disabled={busy}
                    label={busy ? "Checking in..." : "Check in"}
                    onPress={handleCheckIn}
                  />
                ) : null}
                {section === "attendance" && principal.role === "ADMIN" ? (
                  <PrimaryButton
                    disabled={busy || !selectedMemberId}
                    label={busy ? "Checking in..." : "Check in member"}
                    onPress={handleCheckIn}
                  />
                ) : null}
              </View>
              {section === "attendance" && principal.role === "ADMIN" ? (
                <ScrollView
                  contentContainerStyle={styles.memberChoices}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {members.map((member) => (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{
                        selected: selectedMemberId === member.id,
                      }}
                      key={member.id}
                      onPress={() => setSelectedMemberId(member.id)}
                      style={[
                        styles.memberChoice,
                        selectedMemberId === member.id &&
                          styles.memberChoiceSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.memberChoiceText,
                          selectedMemberId === member.id &&
                            styles.memberChoiceTextSelected,
                        ]}
                      >
                        {member.name ?? member.email ?? "Member"}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
              {loadingRecords ? (
                <LoadingIndicator />
              ) : records.length ? (
                <View style={styles.recordsList}>
                  {records.map((record) => (
                    <RecordCard
                      key={record.id}
                      record={record}
                      section={section}
                    />
                  ))}
                </View>
              ) : (
                <EmptyState message="Nothing to show yet." />
              )}
            </View>
          )}

          <Text style={styles.footerText}>CLIETO FIT · TRAIN WITH PURPOSE</Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function LoadingIndicator() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={COLORS.accent} />
      <Text style={styles.loadingText}>Loading your information...</Text>
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>{message}</Text>
    </View>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [startupError, setStartupError] = useState("");

  const restoreSession = useCallback(async () => {
    setStartupError("");
    try {
      const savedSession = await getSavedSession();
      if (savedSession) {
        setToken(savedSession.token);
        setPrincipal(savedSession.user);
      }
    } catch (caught) {
      setStartupError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getSavedSession()
      .then((savedSession) => {
        if (!active) return;
        if (savedSession) {
          setToken(savedSession.token);
          setPrincipal(savedSession.user);
        }
      })
      .catch((caught: unknown) => {
        if (active) setStartupError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (
    email: string,
    password: string,
    role: Role,
  ) => {
    setLoginError("");
    setStartupError("");
    try {
      const { accessToken } = await signIn(email, password, role);
      await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
      try {
        const { user } = await getCurrentUser(accessToken);
        setToken(accessToken);
        setPrincipal(user);
      } catch (caught) {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        throw caught;
      }
    } catch (caught) {
      setLoginError(errorMessage(caught));
    }
  };

  const handleLogout = useCallback(async () => {
    const activeToken = token;
    setToken(null);
    setPrincipal(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    if (activeToken) {
      try {
        await signOut(activeToken);
      } catch (caught) {
        setLoginError(
          `Signed out on this device, but the API session could not be revoked: ${errorMessage(caught)}`,
        );
      }
    }
  }, [token]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <LoadingIndicator />
      </SafeAreaView>
    );
  }

  if (!principal || !token) {
    return (
      <LoginScreen
        error={loginError}
        onLogin={handleLogin}
        onRetry={restoreSession}
        startupError={startupError}
      />
    );
  }

  return (
    <Dashboard
      key={principal.id}
      onLogout={handleLogout}
      principal={principal}
      token={token}
    />
  );
}

const COLORS = {
  background: "#0D1413",
  panel: "#141E1B",
  panelRaised: "#192521",
  border: "#293832",
  accent: "#B9F36A",
  ink: "#F5F7F1",
  secondary: "#C2CDC4",
  muted: "#87968B",
  danger: "#FF9A8B",
  success: "#B9F36A",
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  appShell: {
    flex: 1,
    alignItems: "center",
  },
  loginKeyboard: {
    flex: 1,
    justifyContent: "center",
  },
  loginScroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loginCard: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.panel,
    padding: 28,
  },
  brandMark: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    marginBottom: 18,
  },
  brandMarkText: {
    color: COLORS.background,
    fontSize: 20,
    fontWeight: "900",
  },
  brandName: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  loginTitle: {
    color: COLORS.ink,
    fontSize: 30,
    fontWeight: "800",
    marginTop: 10,
  },
  mutedText: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 25,
  },
  fieldLabel: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  roleChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  roleChoice: {
    minHeight: 42,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 13,
  },
  roleChoiceSelected: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  roleChoiceText: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: "700",
  },
  roleChoiceTextSelected: {
    color: COLORS.background,
  },
  input: {
    height: 52,
    color: COLORS.ink,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 15,
    fontSize: 15,
  },
  primaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
    borderRadius: 15,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: COLORS.background,
    fontSize: 14,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  loginFootnote: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 20,
    textAlign: "center",
  },
  alert: {
    gap: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 13,
    marginTop: 16,
  },
  alertText: {
    color: COLORS.secondary,
    fontSize: 13,
    lineHeight: 19,
  },
  alertAction: {
    color: COLORS.accent,
    fontWeight: "700",
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    lineHeight: 19,
    marginVertical: 12,
  },
  successText: {
    color: COLORS.success,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 12,
  },
  topBar: {
    minHeight: 76,
    width: "100%",
    maxWidth: 840,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  brandMarkSmall: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: COLORS.accent,
  },
  brandMarkSmallText: {
    color: COLORS.background,
    fontWeight: "900",
    fontSize: 14,
  },
  topBrand: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  topGym: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 3,
  },
  signOutButton: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  signOutText: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: "700",
  },
  dashboardContent: {
    flexGrow: 1,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 23,
    paddingBottom: 36,
  },
  welcomePanel: {
    backgroundColor: COLORS.panel,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: 22,
    marginBottom: 18,
  },
  eyebrow: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  welcomeTitle: {
    color: COLORS.ink,
    fontSize: 27,
    fontWeight: "800",
    marginTop: 9,
  },
  welcomeSubtitle: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  sectionNav: {
    flexDirection: "row",
    gap: 9,
    paddingBottom: 20,
  },
  sectionTab: {
    minHeight: 42,
    justifyContent: "center",
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 15,
  },
  sectionTabSelected: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  sectionTabText: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: "700",
  },
  sectionTabTextSelected: {
    color: COLORS.background,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 14,
  },
  sectionHeadingCopy: {
    flexShrink: 1,
  },
  sectionHeading: {
    color: COLORS.ink,
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 13,
  },
  sectionSubheading: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: -7,
  },
  memberChoices: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 14,
  },
  memberChoice: {
    minHeight: 40,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    paddingHorizontal: 13,
  },
  memberChoiceSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  memberChoiceText: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: "700",
  },
  memberChoiceTextSelected: {
    color: COLORS.background,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 11,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 142,
    minHeight: 116,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.panel,
    borderRadius: 19,
    padding: 17,
  },
  metricValue: {
    color: COLORS.ink,
    fontSize: 22,
    fontWeight: "800",
  },
  metricLabel: {
    color: COLORS.secondary,
    fontSize: 13,
    marginTop: 5,
  },
  metricHint: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 5,
  },
  dueText: {
    color: COLORS.secondary,
    fontSize: 13,
    marginTop: 16,
  },
  privacyNote: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 22,
  },
  recordsList: {
    gap: 10,
  },
  recordCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.panel,
    borderRadius: 17,
    padding: 16,
    gap: 6,
  },
  recordHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  recordTitle: {
    flex: 1,
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  recordDetail: {
    color: COLORS.secondary,
    fontSize: 13,
    lineHeight: 19,
  },
  recordMeta: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },
  statusDotMuted: {
    backgroundColor: COLORS.muted,
  },
  loading: {
    minHeight: 130,
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
  },
  loadingText: {
    color: COLORS.muted,
    fontSize: 13,
  },
  emptyState: {
    minHeight: 116,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    borderRadius: 18,
    padding: 20,
  },
  emptyStateText: {
    color: COLORS.muted,
    fontSize: 14,
    textAlign: "center",
  },
  footerText: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    textAlign: "center",
    marginTop: 30,
  },
});
