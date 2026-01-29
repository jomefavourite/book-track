import fs from "node:fs";
import OpenAI from "openai";
import { z } from "zod";

const ChangeItemSchema = z.object({
  type: z.enum(["feat", "fix", "perf", "refactor", "docs", "test", "chore", "build", "ci", "security", "breaking"]),
  scope: z.string().min(1).max(50),
  summary: z.string().min(8).max(140),
  details: z.array(z.string().min(5).max(180)).min(0).max(8),
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

const prContext = JSON.parse(fs.readFileSync(".tmp/pr-context.json", "utf8"));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  const model = "gpt-4.1-mini"; // pick what your org standardizes on

  const prompt = {
    pr: prContext.pr,
    files: prContext.files,
    commits: prContext.commits.map((c: any) => c.message).slice(0, 50),
  };

  // Structured Outputs: pass a JSON schema and the model will adhere to it. :contentReference[oaicite:7]{index=7}
  const resp = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content:
          "You are a release-notes assistant. Produce accurate changelog items. If uncertain, lower confidence and keep wording conservative. Never invent tickets.",
      },
      {
        role: "user",
        content:
          "Generate changelog items for this merged PR. Return JSON that matches the provided schema exactly. Focus on user-visible changes. If purely internal, mark impact=internal.",
      },
      { role: "user", content: JSON.stringify(prompt) },
    ],
    // Depending on your org’s approach, you can do schema validation purely in code (zod)
    // and rely on Structured Outputs for consistency. :contentReference[oaicite:8]{index=8}
  });

  // Extract text output (SDK shape can vary; keep it defensive)
  const text = resp.output_text;
  const parsed = JSON.parse(text) as Output;

  const validated = OutputSchema.parse(parsed);

  fs.mkdirSync("changelog/generated", { recursive: true });
  fs.writeFileSync(
    `changelog/generated/pr-${validated.prNumber}.json`,
    JSON.stringify({ ...validated, model }, null, 2),
    "utf8"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});