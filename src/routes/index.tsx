import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  BellRing,
  CheckCheck,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Activity,
  CalendarClock,
  ShieldCheck,
  ExternalLink,
  Loader2,
  RefreshCw,
  LogOut,
  Search,
  Settings as SettingsIcon,
  X,
} from "lucide-react";

import {
  getSettings,
  listTenders,
  listSourceHealth,
  markAllSeen,
  markSeen,
  startCheckInBackground,
  updateAiSettings,
  updateMatchSettings,
  updateNotifyEmail,
  type MatchMode,
} from "@/lib/tenders.functions";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tender Finder Pro — Government Supply Tenders" },
      {
        name: "description",
        content:
          "Monitors GeM, central, state and union-territory procurement portals for mattress, bed and bedding supply tenders.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Dashboard,
});

function relTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  cppp: "CPPP",
  etenders_central: "eTenders India",
  kerala: "Kerala",
  andaman_nicobar: "Andaman & Nicobar",
  arunachal: "Arunachal Pradesh",
  assam: "Assam",
  chandigarh: "Chandigarh",
  dadra_nagar_haveli: "Dadra & Nagar Haveli",
  daman_diu: "Daman & Diu",
  delhi: "Delhi",
  goa: "Goa",
  haryana: "Haryana",
  himachal: "Himachal Pradesh",
  jammu_kashmir: "Jammu & Kashmir",
  jharkhand: "Jharkhand",
  ladakh: "Ladakh",
  lakshadweep: "Lakshadweep",
  madhya_pradesh: "Madhya Pradesh",
  maharashtra: "Maharashtra",
  manipur: "Manipur",
  meghalaya: "Meghalaya",
  mizoram: "Mizoram",
  nagaland: "Nagaland",
  odisha: "Odisha",
  punjab: "Punjab",
  puducherry: "Puducherry",
  rajasthan: "Rajasthan",
  sikkim: "Sikkim",
  tamil_nadu: "Tamil Nadu",
  tripura: "Tripura",
  uttar_pradesh: "Uttar Pradesh",
  uttarakhand: "Uttarakhand",
  west_bengal: "West Bengal",
  west_bengal_sdc: "West Bengal SDC",
  gem: "GeM",
  gem_global: "GeM Global",
  bihar: "Bihar",
  gujarat_nprocure: "Gujarat",
  gujarat_tenders: "Gujarat",
  karnataka: "Karnataka",
  goa_tenderwizard: "Goa",
  defence: "Defence",
  bhel: "BHEL",
  bel: "BEL",
  coal_india: "Coal India",
  cpcl: "CPCL",
  grse: "GRSE",
  goa_shipyard: "Goa Shipyard",
  hindustan_shipyard: "Hindustan Shipyard",
  indianoil: "IndianOil",
  mazagon_dock: "Mazagon Dock",
  midhani: "MIDHANI",
  ntpc: "NTPC",
  beml: "BEML",
  pmgsy: "PMGSY",
  andhra_pradesh: "Andhra Pradesh",
  telangana: "Telangana",
  chhattisgarh: "Chhattisgarh",
};

function getSourceLabel(source: string, sourceUrl: string): string {
  const prefix = source.split("__")[0];
  if (SOURCE_DISPLAY_NAMES[prefix]) return SOURCE_DISPLAY_NAMES[prefix];
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return prefix.replace(/_/g, " ");
  }
}

function Dashboard() {
  const [gateLoading, setGateLoading] = useState(true);
  const [gateStatus, setGateStatus] = useState<{ configured: boolean; authenticated: boolean } | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [gateError, setGateError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/session", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok || !result) throw new Error("Unable to check administrator session");
        if (active) setGateStatus(result);
      })
      .catch(() => {
        if (active) setGateError("Tender Watch could not verify its administrator session. Refresh and try again.");
      })
      .finally(() => {
        if (active) setGateLoading(false);
      });
    return () => { active = false; };
  }, []);

  const signIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setGateError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: accessToken }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Administrator sign-in failed");
      setGateStatus({ configured: true, authenticated: true });
      setAccessToken("");
    } catch (error) {
      setGateError(error instanceof Error ? error.message : "Administrator sign-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    try {
      await fetch("/api/admin/session", { method: "DELETE" });
    } finally {
      setGateStatus({ configured: true, authenticated: false });
      setAccessToken("");
    }
  };

  if (gateLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        Checking secure administrator session…
      </div>
    );
  }

  if (!gateStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
          <h1 className="text-xl font-semibold">Tender Watch</h1>
          <p className="mt-2 text-sm text-muted-foreground">{gateError || "Unable to verify access."}</p>
          <Button className="mt-5 w-full" onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  if (!gateStatus.configured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Secure Tender Watch</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Administrator access is not configured yet. In the existing Lovable project, open Settings → Secrets and add
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5">TENDER_WATCH_ADMIN_TOKEN</code>
            with a randomly generated value of at least 32 characters. Do not put this value in GitHub or share it in chat.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            After the secret is saved and this change is published, reload Tender Watch and sign in with that token.
          </p>
        </div>
      </div>
    );
  }

  if (!gateStatus.authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Tender Watch</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Administrator access is required to view tender records, source diagnostics, notification addresses, or settings.
          </p>
          <form className="mt-6 space-y-4" onSubmit={signIn}>
            <div className="space-y-2">
              <label htmlFor="tender-watch-admin-token" className="text-sm font-medium">Administrator access token</label>
              <Input
                id="tender-watch-admin-token"
                type="password"
                autoComplete="current-password"
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
                required
                minLength={32}
                maxLength={512}
                placeholder="Enter your private access token"
              />
            </div>
            {gateError && <p role="alert" className="text-sm text-destructive">{gateError}</p>}
            <Button type="submit" className="w-full" disabled={submitting || accessToken.length < 32}>
              {submitting ? "Signing in…" : "Unlock Tender Watch"}
            </Button>
          </form>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            The token is validated on the server. A signed, HttpOnly session cookie is used; the token is not saved in browser storage.
          </p>
        </div>
      </div>
    );
  }

  return <TenderDashboard onLogout={signOut} />;
}

function TenderDashboard({ onLogout }: { onLogout: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const getSettingsFn = useServerFn(getSettings);
  const listTendersFn = useServerFn(listTenders);
  const listSourceHealthFn = useServerFn(listSourceHealth);
  const runCheckFn = useServerFn(startCheckInBackground);
  const markSeenFn = useServerFn(markSeen);
  const markAllSeenFn = useServerFn(markAllSeen);
  const updateMatchSettingsFn = useServerFn(updateMatchSettings);
  const updateNotifyEmailFn = useServerFn(updateNotifyEmail);
  const updateAiSettingsFn = useServerFn(updateAiSettings);


  const settingsQ = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettingsFn(),
    // While a background check is in progress, poll faster so the UI reflects
    // completion even if the user just came back to the app.
    refetchInterval: (q) =>
      q.state.data?.last_run_status === "running" ? 4_000 : 30_000,
    refetchIntervalInBackground: true,
  });
  const isRunning = settingsQ.data?.last_run_status === "running";
  const sourceHealthQ = useQuery({
    queryKey: ["sourceHealth"],
    queryFn: () => listSourceHealthFn(),
    refetchInterval: isRunning ? 8_000 : 60_000,
  });
  const sourceHealth = sourceHealthQ.data ?? [];
  const sourceErrorCount = sourceHealth.filter((s) => s.last_status === "error").length;
  const sourceHealthyCount = sourceHealth.filter((s) => s.last_status === "ok").length;

  const tendersQ = useQuery({
    queryKey: ["tenders"],
    queryFn: () => listTendersFn(),
    refetchInterval: isRunning ? 6_000 : 60_000,
  });

  const [showSettings, setShowSettings] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [filter, setFilter] = useState<"all" | "new">("new");
  const [search, setSearch] = useState("");
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (typeof Notification !== "undefined") setNotifPermission(Notification.permission);
  }, []);

  // Notify on new unseen tenders since last render
  const seenIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!tendersQ.data) return;
    const unseen = tendersQ.data.filter((t) => !t.seen);
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(tendersQ.data.map((t) => t.id));
      return;
    }
    const fresh = unseen.filter((t) => !seenIdsRef.current!.has(t.id));
    for (const f of fresh) {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("New tender match", { body: f.title.slice(0, 140), tag: f.id });
      }
    }
    seenIdsRef.current = new Set(tendersQ.data.map((t) => t.id));
  }, [tendersQ.data]);

  const runMut = useMutation({
    mutationFn: () => runCheckFn(),
    onSuccess: (r) => {
      if (r.already_running) {
        toast.info("A check is already running in the background.");
      } else {
        toast.success("Check started — running in the background. You can close the app.");
      }
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Check failed"),
  });

  // When a running check flips to a terminal state, refresh tender list + toast.
  const prevStatusRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const status = settingsQ.data?.last_run_status;
    if (prevStatusRef.current === "running" && status && status !== "running") {
      qc.invalidateQueries({ queryKey: ["tenders"] });
      if (status === "ok") toast.success("Background check finished.");
      else if (status === "partial") toast.warning("Background check finished with some errors.");
      else if (status === "error") toast.error("Background check failed.");
    }
    prevStatusRef.current = status;
  }, [settingsQ.data?.last_run_status, qc]);

  const markMut = useMutation({
    mutationFn: (v: { id: string; seen: boolean }) => markSeenFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenders"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update tender status"),
  });

  const markAllMut = useMutation({
    mutationFn: () => markAllSeenFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenders"] });
      toast.success("All tenders marked as read");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not mark tenders as read"),
  });

  const filtered = useMemo(() => {
    const all = tendersQ.data ?? [];
    return all
      .filter((t) => (filter === "new" ? !t.seen : true))
      .filter((t) =>
        search.trim()
          ? (t.title + " " + (t.organisation ?? "") + " " + t.source + " " + t.matched_keywords.join(" ")).toLowerCase().includes(search.toLowerCase())
          : true,
      );
  }, [tendersQ.data, filter, search]);

  const newCount = (tendersQ.data ?? []).filter((t) => !t.seen).length;
  const tenderCount = (tendersQ.data ?? []).length;
  const statusText = isRunning
    ? "Scan in progress"
    : settingsQ.data?.last_run_status === "ok"
      ? "Last scan completed"
      : settingsQ.data?.last_run_status === "partial"
        ? "Scan completed with warnings"
        : settingsQ.data?.last_run_status === "error"
          ? "Last scan needs attention"
          : "Monitoring ready";

  return (
    <div className="app-shell min-h-screen bg-background text-foreground">
      <header className="app-header sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/15">
            <BellRing className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Procurement intelligence</p>
            <h1 className="truncate text-lg font-bold leading-tight tracking-tight">Tender Finder Pro</h1>
            <p className="truncate text-xs text-muted-foreground">
              India-wide government supply tenders · Updated {relTime(settingsQ.data?.last_run_at)}
            </p>
          </div>
          {notifPermission !== "granted" && typeof Notification !== "undefined" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const p = await Notification.requestPermission();
                setNotifPermission(p);
                if (p === "granted") toast.success("Notifications enabled");
              }}
              title="Enable browser notifications"
            >
              <Bell className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowSettings((s) => !s)}
            aria-label="Settings"
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Sign out"
            title="Sign out"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            aria-label={isRunning ? "Tender scan is running" : "Run tender scan now"}
            onClick={() => runMut.mutate()}
            disabled={runMut.isPending || isRunning}
            className="gap-1.5"
          >
            {runMut.isPending || isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isRunning ? "Running…" : "Check"}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {settingsQ.data?.last_run_status === "error" && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-foreground">Tender scan failed</p>
              <p className="mt-1 text-muted-foreground">
                Source checks did not complete successfully. This does not mean there are no matching tenders.
                Check the source errors and configuration, then run the scan again.
              </p>
            </div>
          </div>
        )}
        <section className="overview-hero relative overflow-hidden rounded-3xl p-6 text-white shadow-2xl shadow-slate-900/10 sm:p-8">
          <div className="hero-orb hero-orb-one" aria-hidden="true" />
          <div className="hero-orb hero-orb-two" aria-hidden="true" />
          <div className="relative z-10 grid gap-7 lg:grid-cols-[1.5fr_1fr] lg:items-end">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-100 backdrop-blur">
                <span className={`h-2 w-2 rounded-full ${isRunning ? "animate-pulse bg-amber-300" : settingsQ.data?.last_run_status === "error" ? "bg-rose-300" : "bg-emerald-300"}`} />
                {statusText}
              </div>
              <h2 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                Stay ahead of every relevant tender.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
                Discover mattress, bedding and related supply opportunities across central, state and public-sector procurement portals.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  onClick={() => { setFilter("all"); setSearch(""); document.getElementById("tender-results")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                  className="gap-2 border border-white/15 bg-white text-slate-950 hover:bg-slate-100"
                >
                  Explore tenders <ExternalLink className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowSettings(true)}
                  className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  <SettingsIcon className="mr-2 h-4 w-4" /> Refine matching
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="hero-stat">
                <div className="flex items-center gap-2 text-slate-300"><Search className="h-4 w-4" /><span className="text-xs">Tender matches</span></div>
                <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{tenderCount}</p>
                <p className="mt-1 text-xs text-slate-400">Saved opportunities</p>
              </div>
              <div className="hero-stat">
                <div className="flex items-center gap-2 text-slate-300"><BellRing className="h-4 w-4" /><span className="text-xs">New matches</span></div>
                <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{newCount}</p>
                <p className="mt-1 text-xs text-slate-400">Awaiting review</p>
              </div>
              <div className="hero-stat">
                <div className="flex items-center gap-2 text-slate-300"><Activity className="h-4 w-4" /><span className="text-xs">Healthy sources</span></div>
                <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{sourceHealthyCount}<span className="ml-1 text-sm font-medium text-slate-400">/ {sourceHealth.length}</span></p>
                <p className="mt-1 text-xs text-slate-400">Latest recorded status</p>
              </div>
              <div className="hero-stat">
                <div className="flex items-center gap-2 text-slate-300"><CalendarClock className="h-4 w-4" /><span className="text-xs">Last scan</span></div>
                <p className="mt-3 text-2xl font-semibold tracking-tight">{relTime(settingsQ.data?.last_run_at)}</p>
                <p className="mt-1 text-xs text-slate-400">{sourceErrorCount ? `${sourceErrorCount} sources need attention` : "Monitoring status"}</p>
              </div>
            </div>
          </div>
        </section>

        {(settingsQ.isError || tendersQ.isError) && (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{tendersQ.isError ? "Tender results could not be loaded" : "Some dashboard settings could not be loaded"}</p>
              <p className="mt-1 text-xs text-rose-800/80">{tendersQ.error instanceof Error ? tendersQ.error.message : settingsQ.error instanceof Error ? settingsQ.error.message : "Check your connection and retry."}</p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 border-rose-300 bg-white text-rose-900 hover:bg-rose-100" onClick={() => { void qc.invalidateQueries({ queryKey: ["settings"] }); void qc.invalidateQueries({ queryKey: ["tenders"] }); }}>Retry loading</Button>
          </div>
        )}

        {showSettings && (
          <SettingsPanel
            keywords={settingsQ.data?.keywords ?? []}
            excludeKeywords={settingsQ.data?.exclude_keywords ?? []}
            matchMode={settingsQ.data?.match_mode ?? "any"}
            notifyEmail={settingsQ.data?.notify_email ?? null}
            emailSuppressed={settingsQ.data?.email_suppressed ?? false}
            lastMessage={settingsQ.data?.last_run_message ?? null}
            lastStatus={settingsQ.data?.last_run_status ?? null}
            aiMinConfidence={settingsQ.data?.ai_min_confidence ?? 0.6}
            aiIncludeMaybe={settingsQ.data?.ai_include_maybe ?? false}
            onClose={() => setShowSettings(false)}
            onSave={async (kws, ex, mode) => {
              await updateMatchSettingsFn({
                data: { keywords: kws, exclude_keywords: ex, match_mode: mode },
              });
              toast.success("Match settings saved");
              qc.invalidateQueries({ queryKey: ["settings"] });
              router.invalidate();
            }}
            onSaveEmail={async (email) => {
              await updateNotifyEmailFn({ data: { email } });
              toast.success(email ? "Email alerts enabled" : "Email alerts disabled");
              qc.invalidateQueries({ queryKey: ["settings"] });
            }}
            onSaveAi={async (minConf, includeMaybe) => {
              await updateAiSettingsFn({
                data: { ai_min_confidence: minConf, ai_include_maybe: includeMaybe },
              });
              toast.success("AI filter saved");
              qc.invalidateQueries({ queryKey: ["settings"] });
            }}
          />
        )}



        <Card className="portal-panel rounded-2xl p-5 shadow-sm sm:p-6">
          <button
            type="button"
            onClick={() => setShowSources((value) => !value)}
            aria-expanded={showSources}
            className="flex w-full items-center gap-3 text-left"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <Globe className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Portal monitoring</h2>
              <p className="text-xs text-muted-foreground">
                {sourceHealthQ.isLoading
                  ? "Loading portal status…"
                  : sourceHealth.length
                    ? `${sourceHealth.length} source pages · ${sourceHealthyCount} healthy · ${sourceErrorCount} with errors`
                    : "Status will appear after the first scan"}
              </p>
            </div>
            {sourceHealth.length > 0 && (
              <Badge variant={sourceErrorCount ? "destructive" : "secondary"}>
                {sourceErrorCount ? `${sourceErrorCount} errors` : "All healthy"}
              </Badge>
            )}
            <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${showSources ? "rotate-180" : ""}`} />
          </button>

          {showSources && (
            <div className="mt-4 space-y-2 border-t border-border pt-3">
              {sourceHealthQ.isError ? (
                <p className="text-xs text-muted-foreground">
                  Portal health has not been recorded yet. Run a scan to initialise it.
                </p>
              ) : sourceHealth.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No scan history yet. Choose Check to test the configured portals.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {sourceHealth.map((source) => (
                    <div key={source.source_key} className="rounded-md border border-border p-3">
                      <div className="flex items-start gap-2">
                        {source.last_status === "ok" ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium leading-snug">{source.source_label}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Checked {relTime(source.last_checked_at)} · {source.candidate_count} candidates
                          </p>
                          {source.last_error && (
                            <p className="mt-1 line-clamp-2 text-[11px] text-destructive">
                              {source.last_error}
                            </p>
                          )}
                          <a
                            href={source.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:underline"
                          >
                            Open portal <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        <section id="tender-results" className="space-y-4 scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Opportunity feed</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Matched tenders</h2>
            <p className="mt-1 text-sm text-muted-foreground">Review matching opportunities, open the source notice, and track what you have read.</p>
          </div>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Source-linked results</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/80 bg-white/80 p-3 shadow-sm backdrop-blur">
          <div className="flex rounded-xl border border-border bg-muted/60 p-1">
            <button
              onClick={() => setFilter("new")}
              className={`rounded px-3 py-1 text-xs font-medium transition ${
                filter === "new"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              New ({newCount})
            </button>
            <button
              onClick={() => setFilter("all")}
              className={`rounded px-3 py-1 text-xs font-medium transition ${
                filter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({tendersQ.data?.length ?? 0})
            </button>
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter results"
              className="h-9 pl-8"
            />
          </div>
          {newCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => markAllMut.mutate()}
              disabled={markAllMut.isPending}
              className="gap-1.5"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          )}
        </div>

        {tendersQ.isLoading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading matched tenders…
          </div>
        ) : tendersQ.isError ? (
          <Card className="rounded-2xl border-rose-200 bg-rose-50 p-8 text-center">
            <AlertTriangle className="mx-auto h-7 w-7 text-rose-600" />
            <h3 className="mt-3 text-base font-semibold text-rose-950">Unable to load tender results</h3>
            <p className="mt-2 text-sm text-rose-800">Your saved tenders are not being displayed right now. Retry the request before assuming there are no matches.</p>
            <Button className="mt-4" size="sm" onClick={() => { void qc.invalidateQueries({ queryKey: ["tenders"] }); }}>Try again</Button>
          </Card>
        ) : filtered.length === 0 ? (
          tenderCount > 0 ? (
            <Card className="rounded-2xl border-dashed p-10 text-center">
              <Search className="mx-auto h-7 w-7 text-muted-foreground" />
              <h3 className="mt-3 text-base font-semibold">No tenders match these filters</h3>
              <p className="mt-1 text-sm text-muted-foreground">Try a different phrase or show all saved tenders.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => { setSearch(""); setFilter("all"); }}>Clear filters</Button>
            </Card>
          ) : (
            <EmptyState onCheck={() => runMut.mutate()} loading={runMut.isPending} />
          )
        ) : (
          <div className="space-y-2">
            {filtered.map((t) => (
              <Card
                key={t.id}
                className={`tender-card group rounded-2xl p-5 transition-all duration-200 sm:p-6 ${
                  t.seen ? "opacity-70" : "border-primary/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {!t.seen && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="new" />
                      )}
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                        {getSourceLabel(t.source, t.source_url)}
                      </Badge>
                      {t.ai_verdict && (
                        <Badge
                          className="text-[10px]"
                          variant={t.ai_verdict === "yes" ? "default" : "outline"}
                          title={t.ai_reason ?? undefined}
                        >
                          AI: {t.ai_verdict}
                          {typeof t.ai_confidence === "number" && t.ai_confidence > 0
                            ? ` ${Math.round(t.ai_confidence * 100)}%`
                            : ""}
                        </Badge>
                      )}
                      {typeof t.docs_checked === "number" && t.docs_checked > 0 && (
                        <Badge className="text-[10px]" variant="secondary">
                          {t.docs_checked} doc{t.docs_checked === 1 ? "" : "s"} read
                        </Badge>
                      )}
                      {t.matched_keywords.map((k) => (
                        <Badge key={k} className="text-[10px]" variant="outline">
                          {k}
                        </Badge>
                      ))}
                    </div>
                    <h3 className="text-base font-semibold leading-snug tracking-tight sm:text-[17px]">{t.title}</h3>
                    {t.organisation && (
                      <p className="text-xs text-muted-foreground">{t.organisation}</p>
                    )}
                    {t.ai_reason && (
                      <p className="text-xs italic text-muted-foreground">{t.ai_reason}</p>
                    )}
                    {t.doc_excerpt && (
                      <p className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-2">
                        “{t.doc_excerpt}”
                      </p>
                    )}


                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {t.published_at && <span>Published: {t.published_at}</span>}
                      {t.closing_at && <span>Closes: {t.closing_at}</span>}
                      <span>Found {relTime(t.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <a
                      href={t.tender_url ?? t.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground shadow-sm transition hover:border-primary/30 hover:bg-primary/5"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                    <button
                      type="button"
                      aria-label={t.seen ? "Mark tender unread" : "Mark tender as read"}
                      onClick={() => markMut.mutate({ id: t.id, seen: !t.seen })}
                      disabled={markMut.isPending}
                      className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-50"
                    >
                      {t.seen ? "Mark unread" : "Mark read"}
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
        </section>

        <footer className="flex flex-col gap-2 border-t border-border/70 pt-5 text-center text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <span>Government procurement monitor · Mattress, bedding & related supplies</span>
          <span>Scheduled checks are designed to run every 2 hours. Browser notifications require permission and an open app session.</span>
        </footer>
      </main>
    </div>
  );
}

function KeywordEditor({
  label,
  helper,
  list,
  onChange,
  placeholder,
  tone = "default",
}: {
  label: string;
  helper: string;
  list: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  tone?: "default" | "danger";
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (!list.some((k) => k.toLowerCase() === v.toLowerCase())) onChange([...list, v]);
    setDraft("");
  };
  const chipClass =
    tone === "danger"
      ? "bg-destructive/10 text-destructive border border-destructive/30"
      : "bg-secondary text-secondary-foreground";
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </div>
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {list.map((k) => (
            <span
              key={k}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${chipClass}`}
            >
              {k}
              <button
                onClick={() => onChange(list.filter((x) => x !== k))}
                aria-label={`Remove ${k}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-9"
        />
        <Button size="sm" variant="secondary" onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}

function SettingsPanel({
  keywords,
  excludeKeywords,
  matchMode,
  notifyEmail,
  emailSuppressed,
  lastMessage,
  lastStatus,
  aiMinConfidence,
  aiIncludeMaybe,
  onClose,
  onSave,
  onSaveEmail,
  onSaveAi,
}: {
  keywords: string[];
  excludeKeywords: string[];
  matchMode: MatchMode;
  notifyEmail: string | null;
  emailSuppressed: boolean;
  lastMessage: string | null;
  lastStatus: string | null;
  aiMinConfidence: number;
  aiIncludeMaybe: boolean;
  onClose: () => void;
  onSave: (kws: string[], exclude: string[], mode: MatchMode) => Promise<void>;
  onSaveEmail: (email: string | null) => Promise<void>;
  onSaveAi: (minConf: number, includeMaybe: boolean) => Promise<void>;
}) {
  const [list, setList] = useState<string[]>(keywords);
  const [exList, setExList] = useState<string[]>(excludeKeywords);
  const [mode, setMode] = useState<MatchMode>(matchMode);
  const [saving, setSaving] = useState(false);
  const [emailDraft, setEmailDraft] = useState<string>(notifyEmail ?? "");
  const [savingEmail, setSavingEmail] = useState(false);
  const [minConf, setMinConf] = useState<number>(aiMinConfidence);
  const [includeMaybe, setIncludeMaybe] = useState<boolean>(aiIncludeMaybe);
  const [savingAi, setSavingAi] = useState(false);

  useEffect(() => setList(keywords), [keywords]);
  useEffect(() => setExList(excludeKeywords), [excludeKeywords]);
  useEffect(() => setMode(matchMode), [matchMode]);
  useEffect(() => setEmailDraft(notifyEmail ?? ""), [notifyEmail]);
  useEffect(() => setMinConf(aiMinConfidence), [aiMinConfidence]);
  useEffect(() => setIncludeMaybe(aiIncludeMaybe), [aiIncludeMaybe]);


  const modes: { value: MatchMode; label: string; hint: string }[] = [
    { value: "any", label: "Any word", hint: "Match if any include keyword appears (word match)." },
    { value: "all", label: "All words", hint: "Match only if every include keyword appears." },
    { value: "phrase", label: "Exact phrase", hint: "Match the keyword as a literal substring." },
  ];
  const activeMode = modes.find((m) => m.value === mode) ?? modes[0];

  return (
    <Card className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Settings</h2>
        <button onClick={onClose} aria-label="Close" className="text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <section className="space-y-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Email alerts
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Get an instant email when new matching tenders are found. Leave blank to disable.
          </p>
        </div>
        {emailSuppressed && notifyEmail && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
            This address previously unsubscribed. Saving again will re-enable alerts.
          </div>
        )}
        <div className="flex gap-2">
          <Input
            type="email"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            placeholder="you@example.com"
            className="h-9"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={savingEmail}
            onClick={async () => {
              setSavingEmail(true);
              try {
                await onSaveEmail(emailDraft.trim() || null);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not save email alert settings");
              } finally {
                setSavingEmail(false);
              }
            }}
          >
            {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
          {notifyEmail && (
            <Button
              size="sm"
              variant="ghost"
              disabled={savingEmail}
              onClick={async () => {
                setSavingEmail(true);
                try {
                  await onSaveEmail(null);
                  setEmailDraft("");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not disable email alerts");
                } finally {
                  setSavingEmail(false);
                }
              }}
            >
              Off
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            AI filter
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Only keep tenders the AI is at least this confident about. Optionally include
            ambiguous “maybe” verdicts that meet the same threshold.
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Minimum confidence</span>
            <span className="font-medium tabular-nums">{Math.round(minConf * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(minConf * 100)}
            onChange={(e) => setMinConf(Number(e.target.value) / 100)}
            className="w-full accent-primary"
            aria-label="Minimum AI confidence"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Loose (more hits)</span>
            <span>Strict (fewer, surer)</span>
          </div>
        </div>
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={includeMaybe}
            onChange={(e) => setIncludeMaybe(e.target.checked)}
            className="mt-0.5 accent-primary"
          />
          <span>
            <span className="font-medium text-foreground">Also include “maybe” verdicts</span>
            <span className="block text-muted-foreground">
              When off, only confirmed “yes” tenders meeting the threshold are kept.
            </span>
          </span>
        </label>
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            disabled={savingAi}
            onClick={async () => {
              setSavingAi(true);
              try {
                await onSaveAi(minConf, includeMaybe);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not save AI filter");
              } finally {
                setSavingAi(false);
              }
            }}
          >
            {savingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save AI filter"}
          </Button>
        </div>
      </section>



      <section className="space-y-3 border-t border-border pt-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Match mode
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{activeMode.hint}</p>
        </div>
        <div className="flex rounded-md border border-border p-0.5">
          {modes.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition ${
                mode === m.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-4">
        <KeywordEditor
          label="Include keywords"
          helper="Tenders mentioning these are captured (case-insensitive)."
          list={list}
          onChange={setList}
          placeholder="e.g. mattress, coir mattress"
        />
      </section>

      <section className="space-y-3 border-t border-border pt-4">
        <KeywordEditor
          label="Exclude keywords"
          helper="Drop any tender whose row contains one of these (e.g. spring water, hospital bed)."
          list={exList}
          onChange={setExList}
          placeholder="e.g. spring water, water bed"
          tone="danger"
        />
      </section>

      {lastMessage && (
        <div
          className={`rounded-md border p-2.5 text-xs ${
            lastStatus === "error"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          {lastMessage}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
        <Button
          size="sm"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(list, exList, mode);
              onClose();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not save match settings");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save match settings"}
        </Button>
      </div>
    </Card>
  );
}



function EmptyState({ onCheck, loading }: { onCheck: () => void; loading: boolean }) {
  return (
    <Card className="p-10 text-center space-y-3">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Search className="h-5 w-5" />
      </div>
      <h2 className="text-sm font-semibold">No matches yet</h2>
      <p className="mx-auto max-w-sm text-xs text-muted-foreground">
        Tap Check to scan GeM, central, state and union-territory procurement portals.
        Scheduled checks are designed to run every two hours; use Portal monitoring to see which sources are reachable.
      </p>
      <Button size="sm" onClick={onCheck} disabled={loading} className="gap-1.5">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Check now
      </Button>
    </Card>
  );
}
