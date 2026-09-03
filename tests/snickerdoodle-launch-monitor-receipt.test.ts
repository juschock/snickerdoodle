import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const receipt = readFileSync(
  resolve(
    process.cwd(),
    "docs/operations/snickerdoodle-launch-monitor-receipt-2026-09-03.md",
  ),
  "utf8",
);

describe("Snickerdoodle launch monitor receipt", () => {
  it("records the exact five-minute heartbeat cadence", () => {
    expect(receipt).toContain("`every 5 minutes`");
    expect(receipt).toContain(
      "`FREQ=HOURLY;BYMINUTE=0,5,10,15,20,25,30,35,40,45,50,55`",
    );
    expect(receipt).toContain("`minutes 00 and 30 only`");
  });

  it("records independently observed scheduled PASS cycles", () => {
    expect(receipt).toContain(
      "Multiple scheduled heartbeat cycles have now been independently observed",
    );
    expect(receipt).toContain("`SNICKERDOODLE_LAUNCH_MONITOR PASS`");
    expect(receipt).toContain(
      "Scheduled heartbeat execution: PASS — multiple observed cycles",
    );
  });

  it("does not overclaim launch or promotion", () => {
    expect(receipt).toContain("Production promotion: NOT CLAIMED");
    expect(receipt).toContain("Full launch readiness: NOT CLAIMED");
    expect(receipt).not.toContain("Production promotion: PASS");
    expect(receipt).not.toContain("Full launch readiness: PASS");
  });

  it("keeps the current action-gated items out of the monitoring receipt", () => {
    expect(receipt).not.toContain("Confirm remove MFA factors");
    expect(receipt).not.toContain("mailing address");
    expect(receipt).not.toContain("legal notice address");
  });
});
