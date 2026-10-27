// Server-only: uses Lovable AI Gateway to classify tender rows as mattress-supply tenders.
// No keyword pre-filter — the model decides.
import { getServerRuntimeEnv } from "./runtime-env.server";

export interface ClassifyInput {
  id: string; // stable id from caller (e.g. fingerprint)
  text: string; // raw row / title / excerpt
  source_label?: string;
}

export interface ClassifyVerdict {
  id: string;
  verdict: "yes" | "no" | "maybe";
  confidence: number; // 0..1
  reason: string;
  category?: string;
}

const SYSTEM_PROMPT = `You classify Indian government tender listings.
Task: decide whether each tender is for SUPPLY of mattresses or directly related bedding products (coir mattress, foam mattress, spring mattress, hospital mattress, mattress cover, pillow, bedsheet packaged with mattress, bed-roll / bedding kit for jawans/students/patients, etc.).

Rules:
- "yes" = clearly a supply tender for mattresses or bedding products.
- "maybe" = mentions beds/bedding ambiguously, or could include mattresses as part of a larger furniture/hostel/hospital supply package — worth a human look.
- "no" = unrelated (hospital beds as furniture only, spring water, software, civil works, vehicles, etc.).
Return concise reasons (<= 20 words). Confidence 0-1.`;

interface RawItem {
  id: string;
  verdict: string;
  confidence: number;
  reason: string;
  category?: string;
}

export async function classifyTenders(
  items: ClassifyInput[],
): Promise<ClassifyVerdict[]> {
  if (items.length === 0) return [];
  const key = getServerRuntimeEnv("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY missing");

  const verdicts: ClassifyVerdict[] = [];
  // Batch to keep prompts reasonable.
  const CHUNK = 20;
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = items.slice(i, i + CHUNK);
    const userPayload = batch.map((b) => ({
      id: b.id,
      source: b.source_label ?? "",
      text: b.text.slice(0, 1200),
    }));

    const body = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `Classify each item. Respond ONLY with a JSON object {"items":[{"id":"...","verdict":"yes|no|maybe","confidence":0-1,"reason":"...","category":"..."}]}.\n\nITEMS:\n` +
            JSON.stringify(userPayload),
        },
      ],
      response_format: { type: "json_object" as const },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "raw-fetch",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      // On rate limit / credit exhaustion, mark all as "maybe" so we don't silently drop them.
      for (const b of batch) {
        verdicts.push({
          id: b.id,
          verdict: "maybe",
          confidence: 0,
          reason: `AI unavailable (${res.status}): ${errText.slice(0, 120)}`,
        });
      }
      continue;
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { items?: RawItem[] } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }
    const map = new Map<string, RawItem>();
    for (const it of parsed.items ?? []) map.set(String(it.id), it);

    for (const b of batch) {
      const r = map.get(b.id);
      if (!r) {
        verdicts.push({
          id: b.id,
          verdict: "maybe",
          confidence: 0,
          reason: "Not classified by AI",
        });
        continue;
      }
      const v =
        r.verdict === "yes" || r.verdict === "no" || r.verdict === "maybe"
          ? r.verdict
          : "maybe";
      verdicts.push({
        id: b.id,
        verdict: v,
        confidence: typeof r.confidence === "number" ? r.confidence : 0,
        reason: (r.reason ?? "").toString().slice(0, 300),
        category: r.category?.toString().slice(0, 80),
      });
    }
  }
  return verdicts;
}
