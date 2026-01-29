import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
// import mongoose from "mongoose";

// const ChangeSchema = new mongoose.Schema(
//   {
//     prNumber: { type: Number, required: true, index: true },
//     model: { type: String, required: true },
//     items: { type: Array, required: true },
//     approvedAt: { type: Date },
//     source: { type: String },
//   },
//   { timestamps: true }
// );

// const ChangeModel = mongoose.model("ChangelogEntry", ChangeSchema);

async function main() {
  // const uri = process.env.MONGODB_URI;
  // if (!uri) throw new Error("Missing MONGODB_URI");

  // await mongoose.connect(uri);

  const changedFiles = execSync(
    "git diff-tree --no-commit-id --name-only -r HEAD",
    { encoding: "utf8" }
  )
    .split("\n")
    .filter((f) => f.startsWith("changelog/generated/") && f.endsWith(".json"));

  if (changedFiles.length === 0) {
    console.log("ℹ️ No approved changelog files to ingest");
    return;
  }

  for (const file of changedFiles) {
    const payload = JSON.parse(fs.readFileSync(file, "utf8"));

    console.log(JSON.stringify(payload, null, 2));

    // await ChangeModel.updateOne(
    //   { prNumber: payload.prNumber },
    //   {
    //     $set: {
    //       ...payload,
    //       approvedAt: new Date(),
    //       source: "github-actions",
    //     },
    //   },
    //   { upsert: true }
    // );

    console.log(`✅ Ingested PR #${payload.prNumber}`);
  }

  // await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
