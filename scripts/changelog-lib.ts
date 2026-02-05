import fs from "node:fs";
import path from "node:path";

export const CHANGELOG_JSON_PATH = path.join("changelog", "CHANGELOG.json");
export const CHANGELOG_MD_PATH = path.join("changelog", "CHANGELOG.md");

export type ChangeItem = {
  type:
    | "feat"
    | "fix"
    | "perf"
    | "refactor"
    | "docs"
    | "test"
    | "chore"
    | "build"
    | "ci"
    | "security"
    | "breaking";
  scope: string;
  summary: string;
  details: string[];
  impact: "user-facing" | "internal";
  risk: "low" | "medium" | "high";
  breaking: boolean;
  tickets: string[];
  files: string[];
  confidence: number;
};

export type ChangelogEntry = {
  prNumber: number;
  title: string;
  url: string | null;
  author: string;
  mergedAt: string; // ISO string
  labels: string[];
  tags: string[];
  model?: string;
  items: ChangeItem[];
};

export type ChangelogDay = {
  date: string; // YYYY-MM-DD (UTC)
  entries: ChangelogEntry[];
};

export type ConsolidatedChangelog = {
  schemaVersion: 1;
  generatedAt: string; // ISO string
  days: ChangelogDay[];
};

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, " ").toUpperCase();
}

function pushUnique(arr: string[], value: string) {
  const v = normalizeTag(value);
  if (!v) return;
  if (!arr.includes(v)) arr.push(v);
}

export function mergedAtToDateKey(mergedAtIso: string): string {
  // Policy: group by UTC date derived from mergedAt.
  return new Date(mergedAtIso).toISOString().slice(0, 10);
}

export function deriveTagsHybrid(input: {
  labels?: string[];
  items?: Pick<ChangeItem, "type" | "breaking">[];
}): string[] {
  const tags: string[] = [];
  const labelTags = (input.labels ?? []).map(normalizeTag).filter(Boolean);

  // Primary: PR labels (human-controlled)
  for (const t of labelTags) pushUnique(tags, t);

  // Fallback: if no labels, derive from item types.
  if (tags.length === 0) {
    const typeToTag: Record<string, string> = {
      feat: "NEW FEATURE",
      fix: "BUG FIX",
      perf: "PERFORMANCE",
      refactor: "REFACTOR",
      docs: "DOCUMENTATION",
      test: "TESTING",
      chore: "CHORE",
      build: "BUILD",
      ci: "CI",
      security: "SECURITY",
      breaking: "BREAKING CHANGE",
    };

    const items = input.items ?? [];
    const hasBreaking = items.some((it) => it.breaking || it.type === "breaking");
    if (hasBreaking) pushUnique(tags, "BREAKING CHANGE");

    for (const it of items) {
      const mapped = typeToTag[it.type];
      if (mapped) pushUnique(tags, mapped);
    }
  } else {
    // Even with labels, ensure BREAKING CHANGE is visible if needed.
    const items = input.items ?? [];
    const hasBreaking = items.some((it) => it.breaking || it.type === "breaking");
    if (hasBreaking) pushUnique(tags, "BREAKING CHANGE");
  }

  return tags;
}

export function readOrInitChangelog(): ConsolidatedChangelog {
  if (!fs.existsSync(CHANGELOG_JSON_PATH)) {
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      days: [],
    };
  }
  const raw = fs.readFileSync(CHANGELOG_JSON_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return {
    schemaVersion: 1,
    generatedAt: parsed.generatedAt ?? new Date().toISOString(),
    days: Array.isArray(parsed.days) ? parsed.days : [],
  };
}

export function upsertEntry(
  changelog: ConsolidatedChangelog,
  dayKey: string,
  entry: ChangelogEntry
): ConsolidatedChangelog {
  const days = [...(changelog.days ?? [])];
  const dayIdx = days.findIndex((d) => d?.date === dayKey);
  const day: ChangelogDay =
    dayIdx >= 0
      ? { date: dayKey, entries: Array.isArray(days[dayIdx].entries) ? [...days[dayIdx].entries] : [] }
      : { date: dayKey, entries: [] };

  const entryIdx = day.entries.findIndex((e) => e?.prNumber === entry.prNumber);
  if (entryIdx >= 0) day.entries[entryIdx] = entry;
  else day.entries.push(entry);

  // Sort entries by mergedAt desc (then PR number desc)
  day.entries.sort((a, b) => {
    const tA = Date.parse(a.mergedAt);
    const tB = Date.parse(b.mergedAt);
    if (tA !== tB) return tB - tA;
    return b.prNumber - a.prNumber;
  });

  if (dayIdx >= 0) days[dayIdx] = day;
  else days.push(day);

  // Sort days by date desc (YYYY-MM-DD allows lexicographic sort)
  days.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    days,
  };
}

export function renderChangelogMarkdown(changelog: ConsolidatedChangelog): string {
  const lines: string[] = [];
  lines.push("# Changelog");
  lines.push("");
  lines.push(
    `Generated from merged pull requests. Source of truth: \`${CHANGELOG_JSON_PATH}\`.`
  );
  lines.push("");

  for (const day of changelog.days ?? []) {
    // Keep date key format stable (YYYY-MM-DD) for easy diffing and matching the plan.
    lines.push(`## ${day.date}`);
    lines.push("");

    for (const entry of day.entries ?? []) {
      lines.push(`### ${entry.title} (PR #${entry.prNumber})`);
      lines.push("");

      if (entry.tags?.length) {
        const displayTags = entry.tags
          .map((t) => normalizeTag(t))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        lines.push(displayTags.map((t) => `\`${t}\``).join(" "));
        lines.push("");
      }

      for (const it of entry.items ?? []) {
        const breakingSuffix = it.breaking || it.type === "breaking" ? " ⚠️ BREAKING" : "";
        const summary = (it.summary ?? "").trim();
        if (!summary) continue;

        // Plan: top bullet from item.summary, nested bullets from item.details[].
        lines.push(`- ${summary}${breakingSuffix}`);
        if (Array.isArray(it.details) && it.details.length) {
          for (const d of it.details) {
            const detail = (d ?? "").trim();
            if (detail) lines.push(`  - ${detail}`);
          }
        }
      }

      lines.push("");
    }
  }

  // Ensure trailing newline
  return lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}
