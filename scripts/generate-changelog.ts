// scripts/generate-changelog.ts
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";
import { z } from "zod";

const ChangeItemSchema = z.object({
  type: z.enum([
    "feat",
    "fix",
    "perf",
    "refactor",
    "docs",
    "test",
    "chore",
    "build",
    "ci",
    "security",
    "breaking",
  ]),
  scope: z.string().min(1).max(50),
  summary: z.string().min(8).max(140),
  details: z.array(z.string().min(5).max(180)).max(8).default([]),
  impact: z.enum(["user-facing", "internal"]),
  risk: z.enum(["low", "medium", "high"]),
  breaking: z.boolean(),
  tickets: z.array(z.string()).max(10).default([]),
  files: z.array(z.string()).max(50).default([]),
  confidence: z.number().min(0).max(1),
});

const OutputSchema = z.object({
  prNumber: z.number().int(),
  items: z.array(ChangeItemSchema).min(1).max(5),
});

type Output = z.infer<typeof OutputSchema>;

function safeSnippet(s: string, max = 1200) {
  const trimmed = s.slice(0, max);
  return trimmed + (s.length > max ? "\n…(truncated)" : "");
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const prContextPath = path.join(".tmp", "pr-context.json");
  if (!fs.existsSync(prContextPath)) {
    throw new Error(
      "Missing .tmp/pr-context.json. Run build-pr-context.ts first."
    );
  }

  const prContext = JSON.parse(fs.readFileSync(prContextPath, "utf8"));
  const prNumber: number | undefined = prContext?.pr?.number;

  if (!Number.isFinite(prNumber)) {
    throw new Error(
      "prContext.pr.number is missing. Ensure build-pr-context.ts wrote a valid context."
    );
  }

  // Keep the AI input compact & relevant
  const aiInput = {
    pr: {
      number: prContext.pr.number,
      title: prContext.pr.title,
      body: prContext.pr.body,
      labels: prContext.pr.labels,
      baseRef: prContext.pr.baseRef,
      headRef: prContext.pr.headRef,
    },
    files: (prContext.files ?? []).slice(0, 200),
    commits: (prContext.commits ?? []).slice(0, 50).map((c: any) => c.message),
  };

  const client = new OpenAI({ apiKey });

  // JSON Schema for Structured Outputs
  const jsonSchema = {
    name: "changelog_output",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["prNumber", "items"],
      properties: {
        prNumber: { type: "integer" },
        items: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "type",
              "scope",
              "summary",
              "details",
              "impact",
              "risk",
              "breaking",
              "tickets",
              "files",
              "confidence",
            ],
            properties: {
              type: {
                type: "string",
                enum: [
                  "feat",
                  "fix",
                  "perf",
                  "refactor",
                  "docs",
                  "test",
                  "chore",
                  "build",
                  "ci",
                  "security",
                  "breaking",
                ],
              },
              scope: { type: "string", minLength: 1, maxLength: 50 },
              summary: { type: "string", minLength: 8, maxLength: 140 },
              details: {
                type: "array",
                maxItems: 8,
                items: { type: "string", minLength: 5, maxLength: 180 },
              },
              impact: { type: "string", enum: ["user-facing", "internal"] },
              risk: { type: "string", enum: ["low", "medium", "high"] },
              breaking: { type: "boolean" },
              tickets: {
                type: "array",
                maxItems: 10,
                items: { type: "string" },
              },
              files: { type: "array", maxItems: 50, items: { type: "string" } },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
          },
        },
      },
    },
  } as const;

  // Call OpenAI and FORCE schema-valid JSON back
  const resp = await client.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content:
          "You are a release-notes assistant. Be accurate and conservative. Do not invent ticket numbers. If unsure, reduce confidence.",
      },
      {
        role: "user",
        content:
          "Generate changelog items for this merged PR. Focus on user-visible changes. If purely internal, mark impact=internal. Return only schema-valid JSON.",
      },
      { role: "user", content: JSON.stringify(aiInput) },
    ],
    text: {
      format: {
        type: "json_schema",
        json_schema: jsonSchema,
      },
    },
  });

  // With json_schema format, output_text should be JSON.
  const raw = (resp.output_text ?? "").trim();

  if (!raw) {
    throw new Error(
      "OpenAI returned empty output_text. Check the response format/settings."
    );
  }

  let parsed: Output;
  try {
    parsed = OutputSchema.parse(JSON.parse(raw));
  } catch (err) {
    // Helpful debug without leaking too much
    console.error("❌ Raw model output (snippet):\n" + safeSnippet(raw));
    throw err;
  }

  // Ensure PR number is always correct (even if model messes it up)
  parsed.prNumber = prNumber;

  // Default details arrays (in case model returns empty)
  parsed.items = parsed.items.map((it) => ({
    ...it,
    details: it.details ?? [],
  }));

  fs.mkdirSync("changelog/generated", { recursive: true });
  fs.writeFileSync(
    `changelog/generated/pr-${parsed.prNumber}.json`,
    JSON.stringify({ ...parsed, model: "gpt-4.1-mini" }, null, 2),
    "utf8"
  );

  console.log(`✅ Wrote changelog/generated/pr-${parsed.prNumber}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
