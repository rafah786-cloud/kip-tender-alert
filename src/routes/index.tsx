import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  BellRing,
  CheckCheck,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  X,
} from "lucide-react";

import {
  getSettings,
  listTenders,
  markAllSeen,
  markSeen,
  runCheckNow,
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

function Dashboard() {
  const qc = useQueryClient();
  const router = useRouter();
  const getSettingsFn = useServerFn(getSettings);
  const listTendersFn = useServerFn(listTenders);
  const runCheckFn = useServerFn(runCheckNow);
  const markSeenFn = useServerFn(markSeen);
  const markAllSeenFn = useServerFn(markAllSeen);
  const updateMatchSettingsFn = useServerFn(updateMatchSettings);
  const updateNotifyEmailFn = useServerFn(updateNotifyEmail);
  const updateAiSettingsFn = useServerFn(updateAiSettings);


  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: () => getSettingsFn() });
  const tendersQ = useQuery({
    queryKey: ["tenders"],
    queryFn: () => listTendersFn(),
    refetchInterval: 60_000,
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
      toast.success(`${r.new_count} new · ${r.total_matches} total matches`);
      qc.invalidateQueries({ queryKey: ["tenders"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Check failed"),
  });

  const markMut = useMutation({
    mutationFn: (v: { id: string; seen: boolean }) => markSeenFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenders"] }),
  });

  const markAllMut = useMutation({
    mutationFn: () => markAllSeenFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenders"] }),
  });

  const filtered = useMemo(() => {
    const all = tendersQ.data ?? [];
    return all
      .filter((t) => (filter === "new" ? !t.seen : true))
      .filter((t) =>
        search.trim()
          ? (t.title + " " + (t.organisation ?? "")).toLowerCase().includes(search.toLowerCase())
          : true,
      );
  }, [tendersQ.data, filter, search]);

  const newCount = (tendersQ.data ?? []).filter((t) => !t.seen).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BellRing className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-base font-semibold leading-tight">Tender Watch</h1>
            <p className="truncate text-xs text-muted-foreground">
              Last check {relTime(settingsQ.data?.last_run_at)} · {newCount} new
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
            onClick={() => runMut.mutate()}
            disabled={runMut.isPending}
            className="gap-1.5"
          >
            {runMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Check
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-4 space-y-4">
        {showSettings && (
          <SettingsPanel
            keywords={settingsQ.data?.keywords ?? []}
            excludeKeywords={settingsQ.data?.exclude_keywords ?? []}
            matchMode={settingsQ.data?.match_mode ?? "any"}
            notifyEmail={settingsQ.data?.notify_email ?? null}
            emailSuppressed={settingsQ.data?.email_suppressed ?? false}
            lastMessage={settingsQ.data?.last_run_message ?? null}
            lastStatus={settingsQ.data?.last_run_status ?? null}
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
          />
        )}



        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
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
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onCheck={() => runMut.mutate()} loading={runMut.isPending} />
        ) : (
          <div className="space-y-2">
            {filtered.map((t) => (
              <Card
                key={t.id}
                className={`group p-4 transition ${
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
                        {t.source === "cppp"
                          ? "CPPP"
                          : t.source === "etenders_central"
                            ? "eTenders India"
                            : "Kerala"}
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
                      className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                    <button
                      onClick={() => markMut.mutate({ id: t.id, seen: !t.seen })}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t.seen ? "Mark unread" : "Mark read"}
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <p className="pt-4 text-center text-[11px] text-muted-foreground">
          Auto-checks every 2 hours. Keep this tab open to receive browser notifications.
        </p>
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
  onClose,
  onSave,
  onSaveEmail,
}: {
  keywords: string[];
  excludeKeywords: string[];
  matchMode: MatchMode;
  notifyEmail: string | null;
  emailSuppressed: boolean;
  lastMessage: string | null;
  lastStatus: string | null;
  onClose: () => void;
  onSave: (kws: string[], exclude: string[], mode: MatchMode) => Promise<void>;
  onSaveEmail: (email: string | null) => Promise<void>;
}) {
  const [list, setList] = useState<string[]>(keywords);
  const [exList, setExList] = useState<string[]>(excludeKeywords);
  const [mode, setMode] = useState<MatchMode>(matchMode);
  const [saving, setSaving] = useState(false);
  const [emailDraft, setEmailDraft] = useState<string>(notifyEmail ?? "");
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => setList(keywords), [keywords]);
  useEffect(() => setExList(excludeKeywords), [excludeKeywords]);
  useEffect(() => setMode(matchMode), [matchMode]);
  useEffect(() => setEmailDraft(notifyEmail ?? ""), [notifyEmail]);

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
        Tap Check to scan eprocure.gov.in, etenders.gov.in and etenders.kerala.gov.in right now.
        Otherwise it runs every 2 hours automatically.
      </p>
      <Button size="sm" onClick={onCheck} disabled={loading} className="gap-1.5">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Check now
      </Button>
    </Card>
  );
}
