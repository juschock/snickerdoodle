import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const monitorPath = resolve(
  repoRoot,
  "scripts/operations/snickerdoodle-launch-monitor.mjs",
);

const source = readFileSync(monitorPath, "utf8");

describe("Snickerdoodle launch monitor", () => {
  it("self-test emits exactly one sanitized ALERT line and exits nonzero", () => {
    const result = spawnSync(process.execPath, [monitorPath, "--self-test"], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false,
      timeout: 5_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe(
      "SNICKERDOODLE_LAUNCH_MONITOR ALERT self-test\n",
    );
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
  });

  it("invokes an exact pinned Vercel CLI without a shell and from the fixed canonical checkout", () => {
    expect(source).toContain('const VERCEL_CLI_PACKAGE = "vercel@59.11.2";');
    expect(source).toContain('spawnSync("npx", ["--yes", VERCEL_CLI_PACKAGE, ...args], {');
    expect(source).not.toContain("vercel@latest");
    expect(source).toContain("shell: false");
    expect(source).not.toContain("shell: true");
    expect(source).toContain(
      '"/Users/joshuauschock/Documents/ChatGPT/Racoben 2/Snickerdoodle"',
    );
    expect(source).toContain("cwd: VERCEL_CWD");
  });

  it("preserves true no-error-log semantics", () => {
    expect(source).toContain(
      '["logs", deployment, "--level", "error", "--since", "10m"]',
    );
    expect(source).toContain(
      "!containsRealLogEvent(result.stdout, result.stderr)",
    );
    expect(source).not.toContain('["inspect", "--logs", deployment]');
  });

  it("pins the exact public origins", () => {
    expect(source).toContain(
      'const CANONICAL_ORIGIN = "https://racoben.com";',
    );
    expect(source).toContain(
      '"https://campaign-qhxpdc496-joshuauschock-gmailcoms-projects.vercel.app"',
    );
    expect(source).toContain(
      '"https://snickerdoodle-webhook-ingress-sandbox.vercel.app"',
    );
  });

  it("requires the exact accepted commercial HTML title", () => {
    expect(source).toContain(
      "<title>Snickerdoodle by Racoben Engineering — One survey. A complete campaign package.</title>",
    );
    expect(source).toContain("result.stdout.includes(ACCEPTED_TITLE)");
    expect(source).toContain("html.includes(ACCEPTED_TITLE)");
  });

  it("pins the persistent production-promotion marker and never removes it automatically", () => {
    expect(source).toContain(
      '"/Users/joshuauschock/.codex/operations/snickerdoodle-production-promoted"',
    );
    expect(source).toContain("existsSync(PROMOTION_MARKER)");
    expect(source).toContain("renameSync(tempPath, PROMOTION_MARKER)");
    expect(source).not.toMatch(/unlinkSync\s*\(\s*PROMOTION_MARKER\s*\)/);
  });

  it("executes self-test before any network, marker, or Vercel operation", () => {
    const runMonitorStart = source.indexOf("async function runMonitor()");
    const runMonitorEnd = source.indexOf("\n}\n\ntry {", runMonitorStart);

    expect(runMonitorStart).toBeGreaterThanOrEqual(0);
    expect(runMonitorEnd).toBeGreaterThan(runMonitorStart);

    const runMonitorSource = source.slice(runMonitorStart, runMonitorEnd);

    const selfTestBranch = [
      "if (SELF_TEST) {",
      "    runSelfTest();",
      "    return;",
      "  }",
    ].join("\n");

    expect(runMonitorSource).toContain(selfTestBranch);

    const selfTestIndex = runMonitorSource.indexOf(selfTestBranch);
    const firstOperationalCheck = runMonitorSource.indexOf(
      "await checkCanonicalSurface();",
    );

    expect(selfTestIndex).toBeGreaterThanOrEqual(0);
    expect(firstOperationalCheck).toBeGreaterThan(selfTestIndex);

    const selfTestStart = source.indexOf("function runSelfTest()");
    const selfTestEnd = source.indexOf(
      "\n}\n\nasync function runMonitor()",
      selfTestStart,
    );

    expect(selfTestStart).toBeGreaterThanOrEqual(0);
    expect(selfTestEnd).toBeGreaterThan(selfTestStart);

    const selfTestSource = source.slice(selfTestStart, selfTestEnd);

    expect(selfTestSource).not.toContain("fetch(");
    expect(selfTestSource).not.toContain("fetchBounded(");
    expect(selfTestSource).not.toContain("runVercel(");
    expect(selfTestSource).not.toContain("spawnSync(");
    expect(selfTestSource).not.toContain("existsSync(");
    expect(selfTestSource).not.toContain("openSync(");
    expect(selfTestSource).not.toContain("writeFileSync(");
    expect(selfTestSource).not.toContain("renameSync(");
    expect(selfTestSource).not.toContain("unlinkSync(");
    expect(selfTestSource).not.toContain("PROMOTION_MARKER");
    expect(selfTestSource).not.toContain("persistPromotionMarker(");
  });

  it("contains no environment-file, cookie, browser-storage, or secret-reading path", () => {
    expect(source).not.toMatch(/\bprocess\.env\b/);
    expect(source).not.toMatch(/\breadFile(?:Sync)?\s*\(/);
    expect(source).not.toMatch(/\blocalStorage\b/);
    expect(source).not.toMatch(/\bsessionStorage\b/);
    expect(source).not.toMatch(/\bdocument\.cookie\b/);
    expect(source).not.toMatch(/\bheaders?\.get\s*\(\s*["']cookie["']\s*\)/i);
    expect(source).not.toMatch(/\bcookieStore\b/);
    expect(source).not.toMatch(/\bSTRIPE_[A-Z0-9_]+\b/);
    expect(source).not.toMatch(/\bSUPABASE_[A-Z0-9_]+\b/);
    expect(source).not.toMatch(/(?:^|[("'`/])\.env(?:\.|["'`)/]|$)/m);
  });

  it("pins the expected public ingress rejection boundaries", () => {
    expect(source).toContain(
      'assertCondition(root.status === 404, "ingress-root-404")',
    );
    expect(source).toContain(
      'assertCondition(webhookGet.status === 405, "ingress-webhook-get-405")',
    );
    expect(source).toContain("unsignedPost.status === 400");
    expect(source).toContain('"Content-Type": "application/json"');
    expect(source).toContain('body: "{}"');
  });

  it("filters the known Vercel Resolving deployment boilerplate narrowly", () => {
    expect(source).toContain("/^Resolving deployment(?:\\s|$)/i");
    expect(source).not.toContain("/^Resolving\\b/i");
    expect(source).not.toContain("/^Resolving/i");
  });

  it("bounds HTTP and Vercel CLI execution", () => {
    expect(source).toContain("const HTTP_TIMEOUT_MS = 10_000;");
    expect(source).toContain("const CLI_TIMEOUT_MS = 20_000;");
    expect(source).toContain("timeout: CLI_TIMEOUT_MS");
    expect(source).toContain(
      "setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)",
    );
  });

  it("emits only the fixed sanitized PASS or ALERT result forms", () => {
    expect(source).toContain(
      'process.stdout.write("SNICKERDOODLE_LAUNCH_MONITOR PASS\\n")',
    );
    expect(source).toContain(
      "`SNICKERDOODLE_LAUNCH_MONITOR ALERT ${checkName}\\n`",
    );
    expect(source).not.toContain("console.log(");
    expect(source).not.toContain("console.error(");
    expect(source).not.toContain("process.stderr.write(");
  });

  it("does not encode scheduler cadence inside the monitor itself", () => {
    expect(source).not.toContain("BYMINUTE=");
    expect(source).not.toContain("FREQ=HOURLY");
    expect(source).not.toContain("every 5 minutes");
    expect(source).not.toContain("every 10 minutes");
  });
});
