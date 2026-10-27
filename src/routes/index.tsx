import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  Bell,
  BellOff,
  BellRing,
  CheckCheck,
  ChevronDown,
  ExternalLink,
  FileText,
  Inbox,
  Loader2,
  Radar,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  X,
} from "lucide-react";

import {
  getSettings,
  getSourceHealth,
  listTenders,
  markAllSeen,
  markSeen,
  startCheckInBackground,
  updateAiSettings,
  updateMatchSettings,
  updateNotifyEmail,
  type MatchMode,
  type SourceHealthRow,
} from "@/lib/tenders.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tender Watch — Mattress & Bed supply tenders" },
      {
        name: "description",
        content:
          "Auto-monitors central & Kerala government e-procurement portals for mattress, bed and bedding supply tenders.",
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

const SOURCE_LABELS: Record<string, string> = {
  cppp: "CPPP",
  etenders_central: "eTenders India",
  kerala: "Kerala eTenders",
  defproc: "Defence eProcurement",
  gem: "GeM",
};

function sourceLabel(sourceKey: string): string {
  const prefix = sourceKey.split("__")[0];
  return SOURCE_LABELS[prefix] ?? prefix;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function Dashboard() {
  const qc = useQueryClient();
  const router = useRouter();
  const getSettingsFn = useServerFn(getSettings);
  const listTendersFn = useServerFn(listTenders);
  const runCheckFn = useServerFn(startCheckInBackground);
  const markSeenFn = useServerFn(markSeen);
  const markAllSeenFn = useServerFn(markAllSeen);
  const updateMatchSettingsFn = useServerFn(updateMatchSettings);
  const updateNotifyEmailFn = useServerFn(updateNotifyEmail);
  const updateAiSettingsFn = useServerFn(updateAiSettings);
  const getSourceHealthFn = useServerFn(getSourceHealth);

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
  const tendersQ = useQuery({
    queryKey: ["tenders"],
    queryFn: () => listTendersFn(),
    refetchInterval: isRunning ? 6_000 : 60_000,
  });
  const healthQ = useQuery({
    queryKey: ["source-health"],
    queryFn: () => getSourceHealthFn(),
    refetchInterval: isRunning ? 8_000 : 60_000,
  });

  const [showSettings, setShowSettings] = useState(false);
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
    onError: (e) => toast.error(errMsg(e) || "Check failed"),
  });

  // When a running check flips to a terminal state, refresh tender list + toast.
  const prevStatusRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const status = settingsQ.data?.last_run_status;
    if (prevStatusRef.current === "running" && status && status !== "running") {
      qc.invalidateQueries({ queryKey: ["tenders"] });
      qc.invalidateQueries({ queryKey: ["source-health"] });
      if (status === "ok") toast.success("Background check finished.");
      else if (status === "partial") toast.warning("Background check finished with some errors.");
      else if (status === "error") toast.error("Background check failed — see status details.");
    }
    prevStatusRef.current = status;
  }, [settingsQ.data?.last_run_status, qc]);

  const markMut = useMutation({
    mutationFn: (v: { id: string; seen: boolean }) => markSeenFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenders"] }),
    onError: (e) => toast.error(`Could not update tender: ${errMsg(e)}`),
  });

  const markAllMut = useMutation({
    mutationFn: () => markAllSeenFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenders"] });
      toast.success("All tenders marked as read");
    },
    onError: (e) => toast.error(`Could not mark all read: ${errMsg(e)}`),
  });

  const filtered = useMemo(() => {
    const all = tendersQ.data ?? [];
    const q = search.trim().toLowerCase();
    return all
      .filter((t) => (filter === "new" ? !t.seen : true))
      .filter((t) =>
        q
          ? (t.title + " " + (t.organisation ?? "") + " " + sourceLabel(t.source))
              .toLowerCase()
              .includes(q)
          : true,
      );
  }, [tendersQ.data, filter, search]);

  const totalCount = tendersQ.data?.length ?? 0;
  const newCount = (tendersQ.data ?? []).filter((t) => !t.seen).length;
  const healthySources = (healthQ.data ?? []).filter((h) => h.last_status === "ok").length;
  const totalSources = healthQ.data?.length ?? 0;
  const filtersActive = search.trim().length > 0 || filter === "new";
  const lastStatus = settingsQ.data?.last_run_status ?? null;

  const requestNotifications = async () => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "denied") {
      toast.info("Notifications are blocked — enable them in your browser's site settings.");
      return;
    }
    const p = await Notification.requestPermission();
    setNotifPermission(p);
    if (p === "granted") toast.success("Browser notifications enabled");
    else toast.info("Notification permission was not granted");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Top header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Radar className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold leading-tight tracking-tight">
              Tender Watch
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              Mattress &amp; bedding supply procurement monitor
            </p>
          </div>
          {typeof Notification !== "undefined" && notifPermission !== "granted" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={requestNotifications}
              aria-label={
                notifPermission === "denied"
                  ? "Notifications blocked by browser — open site settings"
                  : "Enable browser notifications"
              }
              title={
                notifPermission === "denied"
                  ? "Notifications blocked — enable in browser site settings"
                  : "Enable browser notifications"
              }
              className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
            >
              {notifPermission === "denied" ? (
                <BellOff className="h-4 w-4" aria-hidden />
              ) : (
                <Bell className="h-4 w-4" aria-hidden />
              )}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowSettings((s) => !s)}
            aria-label={showSettings ? "Close settings" : "Open settings"}
            aria-expanded={showSettings}
            className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
          >
            <SettingsIcon className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            onClick={() => runMut.mutate()}
            disabled={runMut.isPending || isRunning}
            className="gap-1.5"
            aria-label={isRunning ? "Scan in progress" : "Run a tender scan now"}
          >
            {runMut.isPending || isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            {isRunning ? "Scanning…" : "Check now"}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6">
        {/* ── Dark hero / status section ───────────────────────── */}
        <section className="hero-panel rounded-2xl p-5 sm:p-7" aria-label="Scan status">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={lastStatus} running={isRunning} />
                <span className="hero-muted text-xs">
                  Last scan {relTime(settingsQ.data?.last_run_at)} · auto-checks every 2 hours
                </span>
              </div>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {isRunning
                  ? "Scanning government portals…"
                  : newCount > 0
                    ? `${newCount} new matching tender${newCount === 1 ? "" : "s"}`
                    : "No new matches right now"}
              </h2>
              {settingsQ.data?.last_run_message && (
                <p className="hero-muted max-w-2xl text-xs leading-relaxed">
                  {settingsQ.data.last_run_message}
                </p>
              )}
            </div>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => runMut.mutate()}
              disabled={runMut.isPending || isRunning}
              className="w-full shrink-0 gap-2 sm:w-auto"
              aria-label={isRunning ? "Scan in progress" : "Start a manual tender scan"}
            >
              {runMut.isPending || isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Radar className="h-4 w-4" aria-hidden />
              )}
              {isRunning ? "Scan in progress" : "Run scan"}
            </Button>
          </div>
        </section>

        {/* ── Summary cards ────────────────────────────────────── */}
        <section
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          aria-label="Summary"
        >
          <SummaryCard
            icon={<FileText className="h-4 w-4" aria-hidden />}
            label="Saved matches"
            value={String(totalCount)}
          />
          <SummaryCard
            icon={<Inbox className="h-4 w-4" aria-hidden />}
            label="New matches"
            value={String(newCount)}
            highlight={newCount > 0}
          />
          <SummaryCard
            icon={<Activity className="h-4 w-4" aria-hidden />}
            label="Healthy sources"
            value={totalSources > 0 ? `${healthySources}/${totalSources}` : "—"}
          />
          <SummaryCard
            icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
            label="Last scan"
            value={relTime(settingsQ.data?.last_run_at)}
          />
        </section>

        {/* ── Settings ─────────────────────────────────────────── */}
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
              try {
                await updateMatchSettingsFn({
                  data: { keywords: kws, exclude_keywords: ex, match_mode: mode },
                });
                toast.success("Match settings saved");
                qc.invalidateQueries({ queryKey: ["settings"] });
                router.invalidate();
              } catch (e) {
                toast.error(`Could not save match settings: ${errMsg(e)}`);
                throw e;
              }
            }}
            onSaveEmail={async (email) => {
              try {
                await updateNotifyEmailFn({ data: { email } });
                toast.success(email ? "Email alerts enabled" : "Email alerts disabled");
                qc.invalidateQueries({ queryKey: ["settings"] });
              } catch (e) {
                toast.error(`Could not save email: ${errMsg(e)}`);
                throw e;
              }
            }}
            onSaveAi={async (minConf, includeMaybe) => {
              try {
                await updateAiSettingsFn({
                  data: { ai_min_confidence: minConf, ai_include_maybe: includeMaybe },
                });
                toast.success("AI filter saved");
                qc.invalidateQueries({ queryKey: ["settings"] });
              } catch (e) {
                toast.error(`Could not save AI filter: ${errMsg(e)}`);
                throw e;
              }
            }}
          />
        )}

        {/* ── Portal monitoring ────────────────────────────────── */}
        <PortalHealthPanel rows={healthQ.data ?? []} loading={healthQ.isPending} />

        {/* ── Matched tenders feed ─────────────────────────────── */}
        <section aria-label="Matched tenders" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">Matched tenders</h2>
            {newCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => markAllMut.mutate()}
                disabled={markAllMut.isPending}
                className="gap-1.5"
              >
                {markAllMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCheck className="h-4 w-4" aria-hidden />
                )}
                Mark all read
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="tablist"
              aria-label="Tender filter"
              className="flex rounded-md border border-border p-0.5"
            >
              <button
                role="tab"
                aria-selected={filter === "new"}
                onClick={() => setFilter("new")}
                className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                  filter === "new"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                New ({newCount})
              </button>
              <button
                role="tab"
                aria-selected={filter === "all"}
                onClick={() => setFilter("all")}
                className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                  filter === "all"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({totalCount})
              </button>
            </div>
            <div className="relative min-w-[180px] flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, organisation or source"
                aria-label="Search tenders by title, organisation or source"
                className="h-9 pl-8"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          </div>

          {tendersQ.isLoading ? (
            <div
              className="flex items-center justify-center py-16 text-muted-foreground"
              role="status"
              aria-label="Loading tenders"
            >
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            </div>
          ) : tendersQ.isError ? (
            <Card className="space-y-3 p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <BellOff className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="text-sm font-semibold">Couldn’t load tenders</h3>
              <p className="mx-auto max-w-sm text-xs text-muted-foreground">
                {errMsg(tendersQ.error)}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => tendersQ.refetch()}
                className="gap-1.5"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Retry
              </Button>
            </Card>
          ) : filtered.length === 0 ? (
            totalCount > 0 && filtersActive ? (
              <Card className="space-y-3 p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                  <Search className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="text-sm font-semibold">No tenders match your filters</h3>
                <p className="mx-auto max-w-sm text-xs text-muted-foreground">
                  Try a different search term, or clear the filters to see all saved matches.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              </Card>
            ) : (
              <EmptyState
                onCheck={() => runMut.mutate()}
                loading={runMut.isPending || isRunning}
              />
            )
          ) : (
            <ul className="space-y-2">
              {filtered.map((t) => (
                <li key={t.id}>
                  <Card
                    className={`group p-4 transition hover:shadow-md ${
                      t.seen ? "opacity-70" : "border-primary/40"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {!t.seen && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-primary"
                              role="img"
                              aria-label="Unread"
                            />
                          )}
                          <Badge
                            variant="secondary"
                            className="text-[10px] uppercase tracking-wide"
                          >
                            {sourceLabel(t.source)}
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
                        <h3 className="text-sm font-semibold leading-snug">{t.title}</h3>
                        {t.organisation && (
                          <p className="text-xs text-muted-foreground">{t.organisation}</p>
                        )}
                        {t.ai_reason && (
                          <p className="text-xs italic text-muted-foreground">{t.ai_reason}</p>
                        )}
                        {t.doc_excerpt && (
                          <p className="border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground">
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
                          aria-label={`Open tender: ${t.title.slice(0, 60)}`}
                          className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                        >
                          Open <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                        <button
                          onClick={() => markMut.mutate({ id: t.id, seen: !t.seen })}
                          disabled={markMut.isPending}
                          aria-label={t.seen ? "Mark as unread" : "Mark as read"}
                          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          {t.seen ? "Mark unread" : "Mark read"}
                        </button>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="pt-2 text-center text-[11px] text-muted-foreground">
          Auto-checks every 2 hours. Keep this tab open to receive browser notifications.
        </p>
      </main>
    </div>
  );
}

function StatusPill({ status, running }: { status: string | null; running: boolean }) {
  const cfg = running
    ? { text: "Scanning", cls: "bg-primary/20 text-primary-foreground border border-primary/30" }
    : status === "ok"
      ? { text: "Healthy", cls: "bg-success/15 text-success border border-success/30" }
      : status === "partial"
        ? { text: "Partial issues", cls: "bg-warning/15 text-warning border border-warning/30" }
        : status === "error"
          ? {
              text: "Scan error",
              cls: "bg-destructive/15 text-destructive border border-destructive/30",
            }
          : { text: "Idle", cls: "bg-secondary/60 text-secondary-foreground border border-border" };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${cfg.cls}`}
      role="status"
    >
      {running && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      {cfg.text}
    </span>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className={`p-4 ${highlight ? "border-primary/50" : ""}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
    </Card>
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
                className="min-h-5 min-w-5"
              >
                <X className="h-3 w-3" aria-hidden />
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
          aria-label={`Add ${label.toLowerCase()}`}
          className="h-9"
        />
        <Button size="sm" variant="secondary" onClick={add} disabled={!draft.trim()}>
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
  const [emailError, setEmailError] = useState<string | null>(null);
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

  const saveEmail = async (email: string | null) => {
    setEmailError(null);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Enter a valid email address, or leave blank to disable.");
      return;
    }
    setSavingEmail(true);
    try {
      await onSaveEmail(email);
      if (!email) setEmailDraft("");
    } catch {
      // toast already shown by parent handler
    } finally {
      setSavingEmail(false);
    }
  };

  return (
    <Card className="space-y-5 p-4 sm:p-5" aria-label="Settings">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Settings</h2>
        <button
          onClick={onClose}
          aria-label="Close settings"
          className="min-h-8 min-w-8 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
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
          <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning-foreground">
            This address previously unsubscribed. Saving again will re-enable alerts.
          </div>
        )}
        <div className="flex gap-2">
          <Input
            type="email"
            value={emailDraft}
            onChange={(e) => {
              setEmailDraft(e.target.value);
              setEmailError(null);
            }}
            placeholder="you@example.com"
            aria-label="Notification email address"
            aria-invalid={!!emailError}
            className="h-9"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={savingEmail}
            onClick={() => saveEmail(emailDraft.trim() || null)}
          >
            {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Save"}
          </Button>
          {notifyEmail && (
            <Button
              size="sm"
              variant="ghost"
              disabled={savingEmail}
              onClick={() => saveEmail(null)}
            >
              Off
            </Button>
          )}
        </div>
        {emailError && (
          <p className="text-xs text-destructive" role="alert">
            {emailError}
          </p>
        )}
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
              } catch {
                // toast already shown by parent handler
              } finally {
                setSavingAi(false);
              }
            }}
          >
            {savingAi ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              "Save AI filter"
            )}
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
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Match mode">
          {modes.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              aria-pressed={mode === m.value}
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
            } catch {
              // toast already shown by parent handler; keep panel open
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            "Save match settings"
          )}
        </Button>
      </div>
    </Card>
  );
}

function PortalHealthPanel({ rows, loading }: { rows: SourceHealthRow[]; loading: boolean }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Group menu pages under their portal (key prefix before "__").
  const portals = useMemo(() => {
    const map = new Map<string, SourceHealthRow[]>();
    for (const r of rows) {
      const prefix = r.source_key.split("__")[0];
      const arr = map.get(prefix) ?? [];
      arr.push(r);
      map.set(prefix, arr);
    }
    return [...map.entries()];
  }, [rows]);

  if (loading && rows.length === 0) return null;
  if (rows.length === 0) {
    return (
      <Card className="p-4 text-xs text-muted-foreground">
        Portal monitoring will appear here after the first scan completes.
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5" aria-label="Portal monitoring">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Portal monitoring
      </p>
      <div className="space-y-1.5">
        {portals.map(([prefix, items]) => {
          const okCount = items.filter((i) => i.last_status === "ok").length;
          const errCount = items.length - okCount;
          const totalCandidates = items.reduce((n, i) => n + (i.candidate_count ?? 0), 0);
          const lastChecked = items
            .map((i) => i.last_checked_at)
            .filter(Boolean)
            .sort()
            .pop();
          const isOpen = !!expanded[prefix];
          const portalUrl = items[0]?.source_url?.split("?")[0];
          return (
            <div key={prefix} className="rounded-lg border border-border">
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [prefix]: !isOpen }))}
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Collapse" : "Expand"} ${sourceLabel(prefix)} details`}
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left text-xs"
                >
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                      errCount === 0
                        ? "bg-success"
                        : okCount === 0
                          ? "bg-destructive"
                          : "bg-warning"
                    }`}
                    aria-hidden
                  />
                  <span className="font-medium">{sourceLabel(prefix)}</span>
                  <span className="text-muted-foreground">
                    {okCount}/{items.length} pages ok · {totalCandidates} candidates · checked{" "}
                    {relTime(lastChecked)}
                  </span>
                  <ChevronDown
                    className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden
                  />
                </button>
                {portalUrl && (
                  <a
                    href={portalUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${sourceLabel(prefix)} portal`}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                )}
              </div>
              {isOpen && (
                <ul className="space-y-1 border-t border-border px-3 py-2.5">
                  {items.map((i) => (
                    <li
                      key={i.source_key}
                      className="flex flex-wrap items-center gap-2 text-xs"
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          i.last_status === "ok" ? "bg-success" : "bg-destructive"
                        }`}
                        aria-hidden
                      />
                      <span className="text-foreground">
                        {i.source_label.split("—")[1]?.trim() ?? i.source_label}
                      </span>
                      <span className="text-muted-foreground">
                        {i.candidate_count} candidates
                      </span>
                      {i.last_error && (
                        <span className="truncate text-destructive" title={i.last_error}>
                          {i.last_error.slice(0, 100)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function EmptyState({ onCheck, loading }: { onCheck: () => void; loading: boolean }) {
  return (
    <Card className="space-y-3 p-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Search className="h-5 w-5" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold">No matches yet</h3>
      <p className="mx-auto max-w-sm text-xs text-muted-foreground">
        Run a scan to check the central and Kerala procurement portals right now — otherwise it
        runs automatically every 2 hours.
      </p>
      <Button size="sm" onClick={onCheck} disabled={loading} className="gap-1.5">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="h-4 w-4" aria-hidden />
        )}
        Check now
      </Button>
    </Card>
  );
}
