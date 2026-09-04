#!/usr/bin/env node

/**
 * Node 22+, dependency-free launch monitor for Snickerdoodle.
 * Emits exactly one sanitized PASS or ALERT line.
 */

import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";

const CANONICAL_ORIGIN = "https://racoben.com";
const CANDIDATE_ORIGIN =
  "https://campaign-crnlm7yfl-joshuauschock-gmailcoms-projects.vercel.app";
const INGRESS_ORIGIN =
  "https://snickerdoodle-webhook-ingress-sandbox.vercel.app";
const VERCEL_CWD =
  "/Users/joshuauschock/Documents/ChatGPT/Racoben 2/Snickerdoodle";
const VERCEL_CLI_PACKAGE = "vercel@59.11.2";
const PROMOTION_MARKER =
  "/Users/joshuauschock/.codex/operations/snickerdoodle-production-promoted";
const ACCEPTED_TITLE =
  "<title>Snickerdoodle by Racoben Engineering — One survey. A complete campaign package.</title>";
const HTTP_TIMEOUT_MS = 10_000;
const CLI_TIMEOUT_MS = 20_000;
const SELF_TEST = process.argv.includes("--self-test");

class MonitorFailure extends Error {
  constructor(checkName) {
    super(checkName);
    this.name = "MonitorFailure";
    this.checkName = checkName;
  }
}

function assertCondition(condition, checkName) {
  if (!condition) throw new MonitorFailure(checkName);
}

function fail(checkName) {
  throw new MonitorFailure(checkName);
}

async function fetchBounded(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: "follow",
    });
  } catch {
    fail("http-request");
  } finally {
    clearTimeout(timer);
  }
}

async function readTextBounded(response) {
  try {
    return await response.text();
  } catch {
    fail("http-body");
  }
}

async function readJsonBounded(response) {
  try {
    return await response.json();
  } catch {
    fail("health-json");
  }
}

function runVercel(args, checkName) {
  const result = spawnSync("npx", ["--yes", VERCEL_CLI_PACKAGE, ...args], {
    cwd: VERCEL_CWD,
    encoding: "utf8",
    timeout: CLI_TIMEOUT_MS,
    shell: false,
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error || result.signal || result.status !== 0) fail(checkName);
  return {
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

function containsRealLogEvent(stdout, stderr) {
  const lines = `${stdout}\n${stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const boilerplatePatterns = [
    /^Vercel CLI\b/i,
    /^Resolving deployment(?:\s|$)/i,
    /^Retrieving\b/i,
    /^Fetching\b/i,
    /^Searching\b/i,
    /^Inspecting\b/i,
    /^Connecting\b/i,
    /^Connected\b/i,
    /^Streaming\b/i,
    /^Waiting\b/i,
    /^No logs found\b/i,
    /^No log entries\b/i,
    /^No matching logs\b/i,
    /^No events found\b/i,
    /^There are no logs\b/i,
    /^Tip:/i,
    /^NOTE:/i,
    /^WARN(?:ING)?:?\s+(?:The Vercel CLI|A newer version|Update available)/i,
    /^https:\/\/vercel\.com\//i,
    /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✓✔]+\s*/u,
  ];
  return lines.some(
    (line) => !boilerplatePatterns.some((pattern) => pattern.test(line)),
  );
}

function persistPromotionMarker() {
  if (existsSync(PROMOTION_MARKER)) return;
  const tempPath = `${PROMOTION_MARKER}.tmp-${process.pid}`;
  let fd;
  try {
    fd = openSync(tempPath, "wx", 0o600);
    writeFileSync(fd, "snickerdoodle-production-promoted\n", {
      encoding: "utf8",
    });
    closeSync(fd);
    fd = undefined;
    renameSync(tempPath, PROMOTION_MARKER);
  } catch {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {}
    }
    try {
      unlinkSync(tempPath);
    } catch {}
    fail("promotion-marker-write");
  }
}

async function checkCanonicalSurface() {
  const response = await fetchBounded(`${CANONICAL_ORIGIN}/snickerdoodle`, {
    method: "GET",
    headers: { Accept: "text/html" },
  });
  assertCondition(response.status === 200, "canonical-snickerdoodle-status");
  const html = await readTextBounded(response);
  const hasAcceptedTitle = html.includes(ACCEPTED_TITLE);
  if (existsSync(PROMOTION_MARKER)) {
    assertCondition(hasAcceptedTitle, "canonical-commercial-title-regression");
  } else if (hasAcceptedTitle) {
    persistPromotionMarker();
  }
}

async function checkCanonicalHealth() {
  const response = await fetchBounded(
    `${CANONICAL_ORIGIN}/snickerdoodle/api/health`,
    { method: "GET", headers: { Accept: "application/json" } },
  );
  assertCondition(response.status === 200, "canonical-health-status");
  const body = await readJsonBounded(response);
  assertCondition(
    body !== null &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      Object.keys(body).length === 2 &&
      body.status === "ok" &&
      body.service === "snickerdoodle",
    "canonical-health-contract",
  );
}

function checkProtectedCandidateTitle() {
  const result = runVercel(
    ["curl", "/snickerdoodle", "--deployment", CANDIDATE_ORIGIN],
    "candidate-vercel-curl",
  );
  assertCondition(
    result.stdout.includes(ACCEPTED_TITLE),
    "candidate-commercial-title",
  );
}

async function checkIngressBoundaries() {
  const root = await fetchBounded(INGRESS_ORIGIN, {
    method: "GET",
    headers: { Accept: "text/plain" },
  });
  assertCondition(root.status === 404, "ingress-root-404");
  const webhookGet = await fetchBounded(
    `${INGRESS_ORIGIN}/api/stripe/webhook`,
    { method: "GET", headers: { Accept: "application/json" } },
  );
  assertCondition(webhookGet.status === 405, "ingress-webhook-get-405");
  const unsignedPost = await fetchBounded(
    `${INGRESS_ORIGIN}/api/stripe/webhook`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: "{}",
    },
  );
  assertCondition(unsignedPost.status === 400, "ingress-unsigned-post-400");
}

function checkDeploymentErrorLogs(deployment, checkName) {
  const result = runVercel(
    ["logs", deployment, "--level", "error", "--since", "10m"],
    checkName,
  );
  assertCondition(!containsRealLogEvent(result.stdout, result.stderr), checkName);
}

function runSelfTest() {
  assertCondition(false, "self-test");
}

async function runMonitor() {
  if (SELF_TEST) {
    runSelfTest();
    return;
  }
  await checkCanonicalSurface();
  await checkCanonicalHealth();
  checkProtectedCandidateTitle();
  await checkIngressBoundaries();
  checkDeploymentErrorLogs(CANDIDATE_ORIGIN, "candidate-error-logs");
  checkDeploymentErrorLogs(INGRESS_ORIGIN, "ingress-error-logs");
}

try {
  await runMonitor();
  process.stdout.write("SNICKERDOODLE_LAUNCH_MONITOR PASS\n");
  process.exitCode = 0;
} catch (error) {
  const checkName =
    error instanceof MonitorFailure
      ? error.checkName
      : "unexpected-monitor-failure";
  process.stdout.write(`SNICKERDOODLE_LAUNCH_MONITOR ALERT ${checkName}\n`);
  process.exitCode = 1;
}
