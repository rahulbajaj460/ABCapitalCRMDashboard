// Supabase Edge Function: dashboard-ai-summary
// Turns the CRM-wide analytics (the dashboard_overview() payload) into a short
// executive summary — a headline + a few specific, action-oriented bullets.
//
// Deploy:
//   supabase functions deploy dashboard-ai-summary
// Secret (already set for the Wiki AI):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Called from the Dashboard via supabase.functions.invoke("dashboard-ai-summary",
// { body: { overview } }). Stateless — the client handles caching.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODEL = "claude-haiku-4-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

const SYSTEM = `You are a sharp business analyst briefing the CEO of AB Capital, a UAE accounting & corporate-services firm, from their CRM's live metrics.

You receive a JSON snapshot of aggregate task analytics. Write a crisp executive summary:
- One "headline": a single sentence capturing the single most important thing right now.
- 4 to 6 "bullets": specific, number-backed observations — prioritise risk (overdue aging, backlog growth, on-time %, chronic 30d+ items, spaces falling behind) and end with 1-2 concrete recommended actions.

Rules:
- Be specific and quote the actual numbers. No vague filler, no restating every metric.
- Due dates are statutory/filing deadlines, so overdue and upcoming-deadline counts carry compliance/penalty risk — frame them that way.
- An assignee with an abnormally high open count (flagged, e.g. 2000+) is a bulk/import/system account, NOT a real person's workload — never single them out as overloaded.
- Completion % may be low if imported/backlog tasks dominate; note that rather than alarming.
- Plain professional English. Each bullet one line.`;

const SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    bullets: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
  },
  required: ["headline", "bullets"],
  additionalProperties: false,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "Server missing ANTHROPIC_API_KEY" }, 500);

    const { overview } = await req.json();
    if (!overview || typeof overview !== "object") return json({ error: "Missing overview" }, 400);

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: SYSTEM,
        messages: [{ role: "user", content: "CRM metrics snapshot (JSON):\n\n" + JSON.stringify(overview) }],
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: `Anthropic ${res.status}: ${detail.slice(0, 300)}` }, 502);
    }
    const data = await res.json();
    const textBlock = (data.content || []).find((b: { type: string }) => b.type === "text");
    if (!textBlock?.text) return json({ error: "Empty response from the model." }, 502);

    const parsed = JSON.parse(textBlock.text);
    return json({ headline: parsed.headline, bullets: parsed.bullets, generated_at: new Date().toISOString() });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
