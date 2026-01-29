// scripts/build-pr-context.ts
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
    url: string | null;
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

function readGitHubEvent(): any | null {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;
  try {
    return JSON.parse(fs.readFileSync(eventPath, "utf8"));
  } catch {
    return null;
  }
}

function resolveRepo(): { owner: string; name: string } {
  const repo = process.env.GITHUB_REPOSITORY; // "owner/name"
  if (!repo || !repo.includes("/")) {
    throw new Error("Missing GITHUB_REPOSITORY (expected 'owner/repo').");
  }
  const [owner, name] = repo.split("/");
  return { owner, name };
}

function resolvePrNumber(event: any | null): number {
  // 1) Local/dev override
  const fromEnv = Number(process.env.PR_NUMBER);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;

  // 2) GitHub Actions pull_request event payload
  const fromEvent = event?.pull_request?.number;
  if (Number.isFinite(fromEvent) && fromEvent > 0) return fromEvent;

  // 3) workflow_dispatch input (if you add inputs.pr_number)
  const fromDispatchInput = Number(event?.inputs?.pr_number);
  if (Number.isFinite(fromDispatchInput) && fromDispatchInput > 0) return fromDispatchInput;

  throw new Error(
    "Missing PR number. In GitHub Actions, ensure this runs on a pull_request event. " +
      "For local runs, set PR_NUMBER (e.g. `export PR_NUMBER=123`)."
  );
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Missing GITHUB_TOKEN. This script is intended to run in GitHub Actions.");

  const event = readGitHubEvent();
  const { owner, name } = resolveRepo();
  const prNumber = resolvePrNumber(event);

  const octokit = new Octokit({ auth: token });

  const prResp = await octokit.pulls.get({ owner, repo: name, pull_number: prNumber });

  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner,
    repo: name,
    pull_number: prNumber,
    per_page: 100,
  });

  const commits = await octokit.paginate(octokit.pulls.listCommits, {
    owner,
    repo: name,
    pull_number: prNumber,
    per_page: 100,
  });

  const ctx: PRContext = {
    repo: { owner, name },
    pr: {
      number: prResp.data.number,
      title: prResp.data.title,
      body: prResp.data.body ?? null,
      labels: (prResp.data.labels ?? []).map((l: any) => l?.name).filter(Boolean),
      author: prResp.data.user?.login ?? "unknown",
      mergedAt: prResp.data.merged_at ?? null,
      baseRef: prResp.data.base?.ref ?? "unknown",
      headRef: prResp.data.head?.ref ?? "unknown",
      url: prResp.data.html_url ?? null,
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
  fs.writeFileSync(path.join(".tmp", "pr-context.json"), JSON.stringify(ctx, null, 2), "utf8");

  console.log(`✅ Wrote .tmp/pr-context.json for PR #${ctx.pr.number}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});