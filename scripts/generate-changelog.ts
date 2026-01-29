import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/*                                Zod schemas                                 */
/* -------------------------------------------------------------------------- */

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
  details: z.array(z.string().min(5).max(180)).max(8),
  impact: z.enum(["user-facing", "internal"]),
  risk: z.enum(["low", "medium", "high"]),
  breaking: z.boolean(),
  tickets: z.array(z.string()).max(10),
  files: z.array(z.string()).max(50),
  confidence: z.number().min(0).max(1),
});

const OutputSchema = z.object({
  prNumber: z.number().int(),
  items: z.array(ChangeItemSchema).min(1).max(5),
});

type Output = z.infer<typeof OutputSchema>;

/* -------------------------------------------------------------------------- */
/*                               Helper utils                                 */
/* -------------------------------------------------------------------------- */

function snippet(text: string, max = 1200) {
  return text.length > max ? text.slice(0, max) + "\n…(truncated)" : text;
}

/* -------------------------------------------------------------------------- */
/*                                    Main                                    */
/* -------------------------------------------------------------------------- */

async function main() {
  /* ----------------------------- env validation ---------------------------- */

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const contextPath = path.join(".tmp", "pr-context.json");
  if (!fs.existsSync(contextPath)) {
    throw new Error(
      "Missing .tmp/pr-context.json. Run build-pr-context.ts first."
    );
  }

  /* ----------------------------- read PR context ---------------------------- */

  const prContext = JSON.parse(fs.readFileSync(contextPath, "utf8"));
  const prNumber: number | undefined = prContext?.pr?.number;

  if (!Number.isFinite(prNumber)) {
    throw new Error("PR number missing from pr-context.json");
  }

  /* ------------------------------ AI input --------------------------------- */

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

  /* --------------------------- Structured Outputs --------------------------- */

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content:
          "You are a release-notes assistant. Be accurate, conservative, and concise. Never invent tickets. If unsure, reduce confidence.",
      },
      {
        role: "user",
        content:
          "Generate changelog items for this merged PR. Focus on user-visible changes. Return ONLY schema-valid JSON.",
      },
      { role: "user", content: JSON.stringify(aiInput) },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "changelog_output", // REQUIRED
        strict: true,
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
                  files: {
                    type: "array",
                    maxItems: 50,
                    items: { type: "string" },
                  },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                },
              },
            },
          },
        },
      },
    },
  });

  /* ------------------------------- Parse output ------------------------------ */

  const raw = response.output_text?.trim();
  if (!raw) {
    throw new Error("OpenAI returned empty output_text");
  }

  let parsed: Output;
  try {
    parsed = OutputSchema.parse(JSON.parse(raw));
  } catch (err) {
    console.error("❌ Raw AI output:\n", snippet(raw));
    throw err;
  }

  // Force correct PR number (never trust the model fully)
  parsed.prNumber = prNumber as number;

  /* ------------------------------- Write file ------------------------------- */

  fs.mkdirSync("changelog/generated", { recursive: true });

  fs.writeFileSync(
    `changelog/generated/pr-${parsed.prNumber}.json`,
    JSON.stringify({ ...parsed, model: "gpt-4.1-mini" }, null, 2),
    "utf8"
  );

  console.log(`✅ Generated changelog/generated/pr-${parsed.prNumber}.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
