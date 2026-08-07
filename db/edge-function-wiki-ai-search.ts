// Supabase Edge Function — Wiki "Ask AI" agent.
// Paste into the Supabase Dashboard (Edge Functions → new function
// "wiki-ai-search" → Code) and Deploy. Then set the secret:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// (or Dashboard → Edge Functions → Manage secrets).
//
// What it does: natural-language Q&A over the entire Knowledge Base.
// Phase 1 = keyword-free full scan + Claude reasoning (no embeddings yet):
//   Stage A — send Claude every article the CALLER can see (title + path +
//             short snippet) and let it either pick the best pages to read,
//             or return a disambiguation list when several distinct pages
//             plausibly match (e.g. similar titles).
//   Stage B — fetch the FULL content of the chosen pages and synthesize a
//             grounded answer with citations.
//
// RLS: the function talks to Postgres with the caller's JWT (anon key +
// Authorization header), so it can only ever read wiki the user is allowed
// to see — the Anthropic key is the only privileged secret, and it never
// leaves the server.
//
// Phase 2 (future): add pgvector embeddings for true hybrid retrieval. The
// two-stage shape stays; only Stage A's candidate selection changes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

// One-line cost/quality lever. Currently on Sonnet for lower per-query cost;
// swap to "claude-opus-5" for maximum reasoning quality, or "claude-haiku-4-5"
// for the cheapest/fastest option.
const MODEL = "claude-sonnet-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Cheap HTML → text for feeding article bodies to the model.
function stripHtml(html: string): string {
  return (html || "")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Minimal Anthropic Messages call with structured (JSON-schema) output.
async function askClaude(
  apiKey: string,
  system: string,
  userText: string,
  schema: Record<string, unknown>,
  maxTokens = 2000,
): Promise<Record<string, unknown>> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userText }],
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 500)}`);
  }
  const data = await res.json();
  if (data.stop_reason === "refusal") {
    throw new Error("The assistant declined to answer this request.");
  }
  const textBlock = (data.content || []).find((b: { type: string }) => b.type === "text");
  if (!textBlock?.text) throw new Error("Empty response from the model.");
  return JSON.parse(textBlock.text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "Server missing ANTHROPIC_API_KEY" }, 500);

    const { query } = await req.json();
    if (!query || typeof query !== "string" || !query.trim()) {
      return json({ error: "Missing query" }, 400);
    }

    // RLS-scoped client — reads only what THIS user can see.
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const [artsRes, catsRes] = await Promise.all([
      db.from("wiki_articles").select("id, title, content, category_id, folder_id").is("deleted_at", null),
      db.from("wiki_categories").select("id, name, parent_id").is("deleted_at", null),
    ]);
    if (artsRes.error) return json({ error: "Wiki lookup failed: " + artsRes.error.message }, 500);

    const articles = artsRes.data || [];
    const cats = catsRes.data || [];
    if (articles.length === 0) {
      return json({ mode: "not_found", message: "There are no wiki pages to search yet." });
    }

    // Build a readable category path for each article ("Parent / Child").
    const catById = new Map(cats.map((c) => [c.id, c]));
    const catPath = (id: string | null): string => {
      const parts: string[] = [];
      let cur = id ? catById.get(id) : null;
      let guard = 0;
      while (cur && guard++ < 10) {
        parts.unshift(cur.name);
        cur = cur.parent_id ? catById.get(cur.parent_id) : null;
      }
      return parts.join(" / ");
    };

    // ── Stage A: full scan (titles + path + short snippet) ──
    const catalog = articles
      .map((a) => {
        const path = catPath(a.category_id);
        const snippet = stripHtml(a.content).slice(0, 300);
        return `id: ${a.id}\ntitle: ${a.title}${path ? `\ncategory: ${path}` : ""}\nsnippet: ${snippet}`;
      })
      .join("\n---\n");

    const stageASystem =
      "You are the Knowledge Base assistant for an internal CRM. You are given the FULL list of " +
      "wiki pages the user is allowed to see (title, category, and a short snippet). Decide how to " +
      "answer the user's question:\n" +
      "- mode \"answer\": one or a few pages clearly contain the answer. Put their ids in article_ids " +
      "(most relevant first, at most 5).\n" +
      "- mode \"disambiguate\": several DISTINCT pages plausibly match (e.g. similar titles or overlapping " +
      "topics) and the user should choose which one they mean. List them in options with a one-line reason " +
      "each. Never silently pick one when the choice is genuinely ambiguous.\n" +
      "- mode \"not_found\": nothing in the Knowledge Base is relevant.\n" +
      "Match on meaning, not exact wording — the user's phrasing will differ from page titles.";

    const stageASchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        mode: { type: "string", enum: ["answer", "disambiguate", "not_found"] },
        article_ids: { type: "array", items: { type: "string" } },
        options: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              reason: { type: "string" },
            },
            required: ["id", "title", "reason"],
          },
        },
      },
      required: ["mode", "article_ids", "options"],
    };

    const routing = await askClaude(
      apiKey,
      stageASystem,
      `User question: ${query}\n\nWiki pages:\n${catalog}`,
      stageASchema,
    );

    const byId = new Map(articles.map((a) => [a.id, a]));

    if (routing.mode === "not_found") {
      return json({ mode: "not_found", message: "I couldn't find anything in the Knowledge Base about that." });
    }

    if (routing.mode === "disambiguate") {
      const options = ((routing.options as { id: string; title: string; reason: string }[]) || [])
        .filter((o) => byId.has(o.id));
      if (options.length === 0) {
        return json({ mode: "not_found", message: "I couldn't find a clear match in the Knowledge Base." });
      }
      return json({ mode: "disambiguate", options });
    }

    // ── Stage B: read full content of the chosen pages and synthesize ──
    const chosenIds = ((routing.article_ids as string[]) || []).filter((id) => byId.has(id)).slice(0, 5);
    if (chosenIds.length === 0) {
      return json({ mode: "not_found", message: "I couldn't find a relevant page in the Knowledge Base." });
    }

    const docs = chosenIds
      .map((id) => {
        const a = byId.get(id)!;
        const path = catPath(a.category_id);
        return `=== PAGE ===\nid: ${a.id}\ntitle: ${a.title}${path ? `\ncategory: ${path}` : ""}\n\n${stripHtml(a.content).slice(0, 6000)}`;
      })
      .join("\n\n");

    const stageBSystem =
      "You are the Knowledge Base assistant for an internal CRM. Answer the user's question using ONLY the " +
      "wiki page(s) provided. Be concise and specific — pull out the exact details asked for (numbers, steps, " +
      "costs, names). If the pages don't fully answer it, say what is and isn't covered. Do not invent " +
      "information that isn't in the pages. In source_ids, list the id of every page you actually used.";

    const stageBSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        answer: { type: "string" },
        source_ids: { type: "array", items: { type: "string" } },
      },
      required: ["answer", "source_ids"],
    };

    const result = await askClaude(
      apiKey,
      stageBSystem,
      `User question: ${query}\n\n${docs}`,
      stageBSchema,
      3000,
    );

    const sourceIds = ((result.source_ids as string[]) || []).filter((id) => byId.has(id));
    const sources = (sourceIds.length ? sourceIds : chosenIds).map((id) => ({
      id,
      title: byId.get(id)!.title,
    }));

    return json({ mode: "answer", answer: result.answer, sources });
  } catch (e) {
    return json({ error: (e as Error).message || "Unexpected error" }, 500);
  }
});
