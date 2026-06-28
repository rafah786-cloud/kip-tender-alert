import { createServerFn } from "@tanstack/react-start";

export interface TenderRow {
  id: string;
  source: string;
  source_url: string;
  title: string;
  organisation: string | null;
  published_at: string | null;
  closing_at: string | null;
  tender_url: string | null;
  matched_keywords: string[];
  raw_excerpt: string | null;
  seen: boolean;
  created_at: string;
}

export interface Settings {
  keywords: string[];
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  notify_email: string | null;
  email_suppressed: boolean;
}

function getServerClient() {
  // Service-role client is only used here for writes; this app is unauthenticated by design.
  // Loaded lazily so the secret isn't read at module scope on the client bundle.
  const { createClient } = require("@supabase/supabase-js") as typeof import("@supabase/supabase-js");
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  const sb = getServerClient();
  const { data, error } = await sb.from("settings").select("*").eq("id", 1).single();
  if (error) throw new Error(error.message);
  const notifyEmail = (data.notify_email as string | null) ?? null;
  let emailSuppressed = false;
  if (notifyEmail) {
    const { data: sup } = await sb
      .from("suppressed_emails")
      .select("id")
      .eq("email", notifyEmail.toLowerCase())
      .maybeSingle();
    emailSuppressed = !!sup;
  }
  return {
    keywords: data.keywords as string[],
    last_run_at: data.last_run_at as string | null,
    last_run_status: data.last_run_status as string | null,
    last_run_message: data.last_run_message as string | null,
    notify_email: notifyEmail,
    email_suppressed: emailSuppressed,
  } satisfies Settings;
});

export const updateKeywords = createServerFn({ method: "POST" })
  .inputValidator((d: { keywords: string[] }) => d)
  .handler(async ({ data }) => {
    const sb = getServerClient();
    const cleaned = data.keywords
      .map((k) => k.trim())
      .filter((k) => k.length > 0)
      .slice(0, 50);
    const { error } = await sb.from("settings").update({ keywords: cleaned }).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true, keywords: cleaned };
  });

export const updateNotifyEmail = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string | null }) => d)
  .handler(async ({ data }) => {
    const sb = getServerClient();
    const email = data.email?.trim() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email address");
    }
    const { error } = await sb
      .from("settings")
      .update({ notify_email: email })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    // If the address was previously suppressed (e.g. user clicked unsubscribe),
    // clear suppression when they re-enable alerts here.
    if (email) {
      await sb.from("suppressed_emails").delete().eq("email", email.toLowerCase());
    }
    return { ok: true, email };
  });

export const listTenders = createServerFn({ method: "GET" }).handler(async () => {
  const sb = getServerClient();
  const { data, error } = await sb
    .from("tenders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as TenderRow[];
});

export const markSeen = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; seen: boolean }) => d)
  .handler(async ({ data }) => {
    const sb = getServerClient();
    const { error } = await sb.from("tenders").update({ seen: data.seen }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllSeen = createServerFn({ method: "POST" }).handler(async () => {
  const sb = getServerClient();
  const { error } = await sb.from("tenders").update({ seen: true }).eq("seen", false);
  if (error) throw new Error(error.message);
  return { ok: true };
});

export const runCheckNow = createServerFn({ method: "POST" }).handler(async () => {
  const { runTenderCheck } = await import("./tenders.runner.server");
  return runTenderCheck();
});
