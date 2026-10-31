import { createClient } from "@supabase/supabase-js";

// Server-only environment access for the Nitro/Cloudflare deployment.
// Secrets arrive as runtime bindings on the server fetch() handler. Keep a
// binding fallback because some worker runtimes expose process.env as read-only.
type RuntimeSecretName =
  | "FIRECRAWL_API_KEY"
  | "LOVABLE_API_KEY"
  | "CRON_SECRET"
  | "TENDER_WATCH_ADMIN_TOKEN"
  | "SUPABASE_URL"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "VITE_SUPABASE_URL"
  | "VITE_SUPABASE_ANON_KEY"
  | "SUPABASE_PUBLISHABLE_KEY"
  | "VITE_SUPABASE_PUBLISHABLE_KEY"
  | "SITE_URL"
  | "LOVABLE_SEND_URL";

type RuntimeBindings = Record<string, unknown>;

const allowedNames: readonly RuntimeSecretName[] = [
  "FIRECRAWL_API_KEY",
  "LOVABLE_API_KEY",
  "CRON_SECRET",
  "TENDER_WATCH_ADMIN_TOKEN",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SITE_URL",
  "LOVABLE_SEND_URL",
];

let runtimeBindings: Partial<Record<RuntimeSecretName, string>> = {};

export function setServerRuntimeBindings(env: unknown): void {
  if (!env || typeof env !== "object") return;

  const bindings = env as RuntimeBindings;
  const nextBindings: Partial<Record<RuntimeSecretName, string>> = {};

  for (const name of allowedNames) {
    const value = bindings[name];
    if (typeof value !== "string" || value.trim().length === 0) continue;

    const normalized = value.trim();
    nextBindings[name] = normalized;

    // Node compatibility is convenient where writable, but must not be the
    // only way code can read deployed secrets.
    try {
      if (typeof process !== "undefined" && process.env && !process.env[name]) {
        process.env[name] = normalized;
      }
    } catch {
      // Use the binding-backed fallback below.
    }
  }

  runtimeBindings = { ...runtimeBindings, ...nextBindings };
}

export function getServerRuntimeEnv(name: RuntimeSecretName): string | undefined {
  try {
    const value = typeof process !== "undefined" ? process.env?.[name] : undefined;
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  } catch {
    // process.env can be unavailable/read-only in some worker runtimes.
  }

  const bindingValue = runtimeBindings[name];
  return typeof bindingValue === "string" && bindingValue.trim().length > 0
    ? bindingValue.trim()
    : undefined;
}

export function isServerRuntimeEnvConfigured(name: RuntimeSecretName): boolean {
  return Boolean(getServerRuntimeEnv(name));
}

export function getServerRuntimeEnvDiagnostics(name: RuntimeSecretName): {
  configured: boolean;
  processEnvConfigured: boolean;
  workerBindingConfigured: boolean;
  source: "process.env" | "worker-binding" | "missing";
} {
  let processEnvConfigured = false;
  try {
    const value = typeof process !== "undefined" ? process.env?.[name] : undefined;
    processEnvConfigured = typeof value === "string" && value.trim().length > 0;
  } catch {
    // process.env may be unavailable in the Worker runtime.
  }

  const bindingValue = runtimeBindings[name];
  const workerBindingConfigured =
    typeof bindingValue === "string" && bindingValue.trim().length > 0;

  return {
    configured: processEnvConfigured || workerBindingConfigured,
    processEnvConfigured,
    workerBindingConfigured,
    source: processEnvConfigured
      ? "process.env"
      : workerBindingConfigured
        ? "worker-binding"
        : "missing",
  };
}

/**
 * Create a service-role client that supports both legacy JWT keys and the
 * newer opaque sb_secret_* keys. Opaque keys belong in apikey, not Bearer auth.
 */
export function createServerSupabaseClient(url: string, key: string) {
  const fetchWithApiKey: typeof fetch = (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    }
    const isOpaqueKey = key.startsWith("sb_secret_") || key.startsWith("sb_publishable_");
    if (isOpaqueKey && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };

  return createClient(url, key, {
    global: { fetch: fetchWithApiKey },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
