#!/usr/bin/env bun
/**
 * cgstack-global-discover — discover Codex coding sessions.
 *
 * Resolves each session working directory to a git repo, deduplicates by
 * normalized remote URL, and writes JSON or a compact summary to stdout.
 */

import { existsSync, readdirSync, statSync, readFileSync, openSync, readSync, closeSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";
import { homedir } from "os";

interface Session {
  tool: "codex";
  cwd: string;
}

interface Repo {
  name: string;
  remote: string;
  paths: string[];
  sessions: { codex: number };
}

interface DiscoveryResult {
  window: string;
  start_date: string;
  repos: Repo[];
  tools: {
    codex: { total_sessions: number; repos: number };
  };
  total_sessions: number;
  total_repos: number;
}

function printUsage(): void {
  console.error(`Usage: cgstack-global-discover --since <window> [--format json|summary]

  --since <window>   Time window: e.g. 7d, 14d, 30d, 24h
  --format <fmt>     Output format: json (default) or summary
  --help             Show this help

Examples:
  cgstack-global-discover --since 7d
  cgstack-global-discover --since 14d --format summary`);
}

function parseArgs(): { since: string; format: "json" | "summary" } {
  const args = process.argv.slice(2);
  let since = "";
  let format: "json" | "summary" = "json";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") {
      printUsage();
      process.exit(0);
    } else if (args[i] === "--since" && args[i + 1]) {
      since = args[++i];
    } else if (args[i] === "--format" && args[i + 1]) {
      const f = args[++i];
      if (f !== "json" && f !== "summary") {
        console.error(`Invalid format: ${f}. Use 'json' or 'summary'.`);
        printUsage();
        process.exit(1);
      }
      format = f;
    } else {
      console.error(`Unknown argument: ${args[i]}`);
      printUsage();
      process.exit(1);
    }
  }

  if (!since) {
    console.error("Error: --since is required.");
    printUsage();
    process.exit(1);
  }

  if (!/^\d+(d|h|w)$/.test(since)) {
    console.error(`Invalid window format: ${since}. Use e.g. 7d, 24h, 2w.`);
    process.exit(1);
  }

  return { since, format };
}

function windowToDate(window: string): Date {
  const match = window.match(/^(\d+)(d|h|w)$/);
  if (!match) throw new Error(`Invalid window: ${window}`);
  const [, numStr, unit] = match;
  const num = parseInt(numStr, 10);
  const now = new Date();

  if (unit === "h") {
    return new Date(now.getTime() - num * 60 * 60 * 1000);
  }

  const d = new Date(now);
  d.setDate(d.getDate() - num * (unit === "w" ? 7 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function normalizeRemoteUrl(url: string): string {
  let normalized = url.trim();
  const sshMatch = normalized.match(/^(?:ssh:\/\/)?git@([^:]+):(.+)$/);
  if (sshMatch) {
    normalized = `https://${sshMatch[1]}/${sshMatch[2]}`;
  }

  if (normalized.endsWith(".git")) {
    normalized = normalized.slice(0, -4);
  }

  try {
    const parsed = new URL(normalized);
    parsed.hostname = parsed.hostname.toLowerCase();
    normalized = parsed.toString();
    if (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  } catch {
    // Local remotes or non-URL values are returned as-is.
  }

  return normalized;
}

function isGitRepo(dir: string): boolean {
  return existsSync(join(dir, ".git"));
}

function getGitRemote(cwd: string): string | null {
  if (!existsSync(cwd) || !isGitRepo(cwd)) return null;
  try {
    const remote = execSync("git remote get-url origin", {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return remote || null;
  } catch (err: any) {
    if (err?.status !== undefined) return null;
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

function extractCwdFromJsonl(filePath: string): string | null {
  try {
    const fd = openSync(filePath, "r");
    const buf = Buffer.alloc(131072);
    const bytesRead = readSync(fd, buf, 0, 131072, 0);
    closeSync(fd);
    const lines = buf.toString("utf-8", 0, bytesRead).split("\n").slice(0, 25);

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (typeof obj.cwd === "string") return obj.cwd;
        if (typeof obj.payload?.cwd === "string") return obj.payload.cwd;
      } catch {
        continue;
      }
    }
  } catch {
    // Ignore unreadable or partially-written session files.
  }
  return null;
}

function scanCodexRollouts(since: Date): Session[] {
  const sessionsDir = process.env.CODEX_SESSIONS_DIR || join(homedir(), ".codex", "sessions");
  if (!existsSync(sessionsDir)) return [];

  const sessions: Session[] = [];
  try {
    const years = readdirSync(sessionsDir);
    for (const year of years) {
      const yearPath = join(sessionsDir, year);
      if (!statSync(yearPath).isDirectory()) continue;

      for (const month of readdirSync(yearPath)) {
        const monthPath = join(yearPath, month);
        if (!statSync(monthPath).isDirectory()) continue;

        for (const day of readdirSync(monthPath)) {
          const dayPath = join(monthPath, day);
          if (!statSync(dayPath).isDirectory()) continue;

          const files = readdirSync(dayPath).filter((f) => f.startsWith("rollout-") && f.endsWith(".jsonl"));
          for (const file of files) {
            const filePath = join(dayPath, file);
            try {
              if (statSync(filePath).mtime < since) continue;
            } catch {
              continue;
            }

            const cwd = extractCwdFromJsonl(filePath);
            if (cwd && existsSync(cwd)) sessions.push({ tool: "codex", cwd });
          }
        }
      }
    }
  } catch {
    // Directory disappeared or became unreadable during scan.
  }

  return sessions;
}

function scanCodexProjectJsonl(since: Date): Session[] {
  const projectsDir = join(homedir(), ".codex", "projects");
  if (!existsSync(projectsDir)) return [];

  const sessions: Session[] = [];
  let dirs: string[];
  try {
    dirs = readdirSync(projectsDir);
  } catch {
    return [];
  }

  for (const dirName of dirs) {
    const dirPath = join(projectsDir, dirName);
    try {
      if (!statSync(dirPath).isDirectory()) continue;
    } catch {
      continue;
    }

    let jsonlFiles: string[];
    try {
      jsonlFiles = readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }

    for (const file of jsonlFiles) {
      const filePath = join(dirPath, file);
      try {
        if (statSync(filePath).mtime < since) continue;
      } catch {
        continue;
      }

      const cwd = extractCwdFromJsonl(filePath) || decodeProjectPath(dirName);
      if (cwd && existsSync(cwd)) sessions.push({ tool: "codex", cwd });
    }
  }

  return sessions;
}

function decodeProjectPath(dirName: string): string | null {
  const decoded = dirName.replace(/^-/, "/").replace(/-/g, "/");
  return existsSync(decoded) ? decoded : null;
}

async function resolveAndDeduplicate(sessions: Session[]): Promise<Repo[]> {
  const byCwd = new Map<string, Session[]>();
  for (const s of sessions) {
    const existing = byCwd.get(s.cwd) || [];
    existing.push(s);
    byCwd.set(s.cwd, existing);
  }

  const remoteMap = new Map<string, string>();
  for (const cwd of byCwd.keys()) {
    const raw = getGitRemote(cwd);
    if (raw) {
      remoteMap.set(cwd, normalizeRemoteUrl(raw));
    } else if (existsSync(cwd) && isGitRepo(cwd)) {
      remoteMap.set(cwd, `local:${cwd}`);
    }
  }

  const byRemote = new Map<string, { paths: string[]; sessions: Session[] }>();
  for (const [cwd, cwdSessions] of byCwd) {
    const remote = remoteMap.get(cwd);
    if (!remote) continue;

    const existing = byRemote.get(remote) || { paths: [], sessions: [] };
    if (!existing.paths.includes(cwd)) existing.paths.push(cwd);
    existing.sessions.push(...cwdSessions);
    byRemote.set(remote, existing);
  }

  const repos: Repo[] = [];
  for (const [remote, data] of byRemote) {
    const validPath = data.paths.find((p) => existsSync(p) && isGitRepo(p));
    if (!validPath) continue;

    let name: string;
    if (remote.startsWith("local:")) {
      name = basename(remote.replace("local:", ""));
    } else {
      try {
        name = basename(new URL(remote).pathname);
      } catch {
        name = basename(remote);
      }
    }

    repos.push({
      name,
      remote,
      paths: data.paths,
      sessions: { codex: data.sessions.length },
    });
  }

  repos.sort((a, b) => b.sessions.codex - a.sessions.codex);
  return repos;
}

async function main() {
  const { since, format } = parseArgs();
  const sinceDate = windowToDate(since);
  const startDate = sinceDate.toISOString().split("T")[0];

  const sessions = [...scanCodexRollouts(sinceDate), ...scanCodexProjectJsonl(sinceDate)];
  console.error(`Discovered: ${sessions.length} Codex sessions`);

  const repos = await resolveAndDeduplicate(sessions);
  console.error(`-> ${repos.length} unique repos`);

  const codexRepos = new Set(repos.filter((r) => r.sessions.codex > 0).map((r) => r.remote)).size;
  const result: DiscoveryResult = {
    window: since,
    start_date: startDate,
    repos,
    tools: {
      codex: { total_sessions: sessions.length, repos: codexRepos },
    },
    total_sessions: sessions.length,
    total_repos: repos.length,
  };

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Window: ${since} (since ${startDate})`);
  console.log(`Sessions: ${sessions.length} Codex`);
  console.log(`Repos: ${repos.length} unique`);
  console.log("");
  for (const repo of repos) {
    console.log(`  ${repo.name} (${repo.sessions.codex} sessions)`);
    console.log(`    Remote: ${repo.remote}`);
    console.log(`    Paths: ${repo.paths.join(", ")}`);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}
