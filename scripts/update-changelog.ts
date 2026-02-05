import fs from "node:fs";
import path from "node:path";

import {
  CHANGELOG_JSON_PATH,
  CHANGELOG_MD_PATH,
  deriveTagsHybrid,
  mergedAtToDateKey,
  readOrInitChangelog,
  renderChangelogMarkdown,
  upsertEntry,
  type ChangeItem,
  type ChangelogEntry,
} from "./changelog-lib";

type PrContext = {
  pr: {
    number: number;
    title: string;
    body: string | null;
    labels: string[];
    author: string;
    mergedAt: string | null;
    url: string | null;
  };
};

type AiChangelog = {
  prNumber: number;
  model?: string;
  items: ChangeItem[];
};

function requireFile(p: string) {
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
}

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function main() {
  const prContextPath = path.join(".tmp", "pr-context.json");
  const aiPath = path.join(".tmp", "ai-changelog.json");

  requireFile(prContextPath);
  requireFile(aiPath);

  const prContext = readJson<PrContext>(prContextPath);
  const ai = readJson<AiChangelog>(aiPath);

  const prNumber = prContext?.pr?.number;
  if (!Number.isFinite(prNumber)) throw new Error("PR number missing in .tmp/pr-context.json");
  if (ai?.prNumber !== prNumber) {
    // Be conservative: PR number mismatch is a strong signal something is wrong.
    throw new Error(`PR number mismatch: context=${prNumber} ai=${ai?.prNumber}`);
  }

  const mergedAt = prContext.pr.mergedAt ?? new Date().toISOString();
  const dayKey = mergedAtToDateKey(mergedAt);

  const tags = deriveTagsHybrid({
    labels: prContext.pr.labels ?? [],
    items: (ai.items ?? []).map((it) => ({ type: it.type, breaking: it.breaking })),
  });

  const entry: ChangelogEntry = {
    prNumber,
    title: prContext.pr.title ?? `PR #${prNumber}`,
    url: prContext.pr.url ?? null,
    author: prContext.pr.author ?? "unknown",
    mergedAt,
    labels: prContext.pr.labels ?? [],
    tags,
    model: ai.model,
    items: ai.items ?? [],
  };

  fs.mkdirSync("changelog", { recursive: true });

  const changelog = readOrInitChangelog();
  const next = upsertEntry(changelog, dayKey, entry);

  fs.writeFileSync(CHANGELOG_JSON_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
  fs.writeFileSync(CHANGELOG_MD_PATH, renderChangelogMarkdown(next), "utf8");

  console.log(`✅ Updated ${CHANGELOG_JSON_PATH} and ${CHANGELOG_MD_PATH} (PR #${prNumber})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
