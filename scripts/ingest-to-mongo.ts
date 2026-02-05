import fs from "node:fs";

import { MongoClient } from "mongodb";
import { CHANGELOG_JSON_PATH, type ConsolidatedChangelog, type ChangelogEntry } from "./changelog-lib";

function isValidDate(d: Date) {
  return Number.isFinite(d.getTime());
}

function parseMergedAt(mergedAtIso: string): Date | null {
  const d = new Date(mergedAtIso);
  return isValidDate(d) ? d : null;
}

function readConsolidatedChangelog(): ConsolidatedChangelog {
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

function flattenEntries(changelog: ConsolidatedChangelog): Array<{ day: string; entry: ChangelogEntry }> {
  const out: Array<{ day: string; entry: ChangelogEntry }> = [];
  for (const day of changelog.days ?? []) {
    if (!day?.date || !Array.isArray(day.entries)) continue;
    for (const entry of day.entries) {
      if (!entry || !Number.isFinite(entry.prNumber)) continue;
      out.push({ day: day.date, entry });
    }
  }
  return out;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    if (process.env.DRY_RUN === "1") {
      const changelog = readConsolidatedChangelog();
      const rows = flattenEntries(changelog);
      console.log(
        `🧪 DRY_RUN=1: would ingest ${rows.length} entr${rows.length === 1 ? "y" : "ies"} from ${CHANGELOG_JSON_PATH}`
      );
      return;
    }
    throw new Error("Missing MONGODB_URI (set DRY_RUN=1 to run without DB)");
  }

  const dbName = process.env.MONGODB_DB || undefined;
  const collectionName = process.env.MONGODB_COLLECTION || "changelog_entries";

  const changelog = readConsolidatedChangelog();
  const rows = flattenEntries(changelog);
  if (rows.length === 0) {
    console.log(`ℹ️ No changelog entries found in ${CHANGELOG_JSON_PATH}`);
    return;
  }

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(dbName);
    const col = db.collection(collectionName);

    // Ensure idempotency at the DB level too (best-effort).
    try {
      await col.createIndex({ prNumber: 1 }, { unique: true });
    } catch (e) {
      console.warn("⚠️ Could not create unique index on prNumber (continuing).");
      console.warn(e);
    }

    let ingested = 0;
    for (const { day, entry } of rows) {
      const mergedAtDate = parseMergedAt(entry.mergedAt);
      const approvedAt = new Date();

      const doc = {
        schemaVersion: 1,
        changelogGeneratedAt: changelog.generatedAt,
        day,
        prNumber: entry.prNumber,
        title: entry.title,
        url: entry.url,
        author: entry.author,
        mergedAt: mergedAtDate,
        mergedAtIso: entry.mergedAt,
        labels: entry.labels ?? [],
        tags: entry.tags ?? [],
        model: entry.model ?? null,
        items: entry.items ?? [],
        approvedAt,
        source: "github-actions",
      };

      await col.updateOne(
        { prNumber: entry.prNumber },
        {
          $set: doc,
          $setOnInsert: { createdAt: approvedAt },
          $currentDate: { updatedAt: true },
        },
        { upsert: true }
      );

      ingested += 1;
    }

    console.log(`✅ Ingested ${ingested} changelog entr${ingested === 1 ? "y" : "ies"} into ${collectionName}`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
