import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Octokit } from "@octokit/rest";

type PRContext = {
  repo: { owner: string; name: string };
  pr: {
    number: number;
    title: string;
    body: string | null;
    labels: string[];
    author: string;
    mergedAt: string | null;
    baseRef: string;
    headRef: string;
  };
  files: {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
  }[];
  commits: { sha: string; message: string }[];
};

const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("Missing GITHUB_TOKEN");

const owner = process.env.GITHUB_REPOSITORY?.split("/")[0];
const name = process.env.GITHUB_REPOSITORY?.split("/")[1];
const prNumber = Number(
  process.env.GITHUB_REF_NAME?.split("/")[0] ?? process.env.PR_NUMBER
); // fallback

if (!owner || !name) throw new Error("Missing GITHUB_REPOSITORY");
if (!Number.isFinite(prNumber)) throw new Error("Missing PR number");

const repoOwner: string = owner;
const repoName: string = name;
const octokit = new Octokit({ auth: token });

async function main() {
  const pr = await octokit.pulls.get({
    owner: repoOwner,
    repo: repoName,
    pull_number: prNumber,
  });
  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner: repoOwner,
    repo: repoName,
    pull_number: prNumber,
    per_page: 100,
  });
  const commits = await octokit.paginate(octokit.pulls.listCommits, {
    owner: repoOwner,
    repo: repoName,
    pull_number: prNumber,
    per_page: 100,
  });

  const ctx: PRContext = {
    repo: { owner: repoOwner, name: repoName },
    pr: {
      number: pr.data.number,
      title: pr.data.title,
      body: pr.data.body ?? null,
      labels: (pr.data.labels ?? []).map((l: any) => l.name).filter(Boolean),
      author: pr.data.user?.login ?? "unknown",
      mergedAt: pr.data.merged_at ?? null,
      baseRef: pr.data.base.ref,
      headRef: pr.data.head.ref,
    },
    files: files.map((f: any) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
    })),
    commits: commits.map((c: any) => ({
      sha: c.sha,
      message: c.commit?.message ?? "",
    })),
  };

  fs.mkdirSync(".tmp", { recursive: true });
  fs.writeFileSync(
    path.join(".tmp", "pr-context.json"),
    JSON.stringify(ctx, null, 2),
    "utf8"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
