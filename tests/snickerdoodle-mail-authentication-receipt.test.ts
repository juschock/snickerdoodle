import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const receipt = readFileSync(
  resolve(
    process.cwd(),
    "docs/operations/snickerdoodle-mail-authentication-receipt-2026-09-04.md",
  ),
  "utf8",
);

describe("Snickerdoodle mail authentication receipt", () => {
  it("records the complete authenticated send and reply loop", () => {
    expect(receipt).toContain("DKIM signing enabled: **YES**");
    expect(receipt).toContain("Outbound message received externally: **PASS**");
    expect(receipt).toContain(
      "Inbound reply received by the Snickerdoodle mailbox: **PASS**",
    );
    expect(receipt).toContain("Reply-back received externally: **PASS**");
    expect(receipt).toContain("Final outbound SPF: **PASS**");
    expect(receipt).toContain("Final outbound DKIM: **PASS**");
    expect(receipt).toContain("Final outbound DMARC: **PASS**");
    expect(receipt).toContain("Mailbox monitored: **YES**");
  });

  it("does not retain provider targets, headers, or message bodies", () => {
    expect(receipt).not.toContain("selector1-racoben-com");
    expect(receipt).not.toContain("selector2-racoben-com");
    expect(receipt).not.toContain("Authentication-Results:");
    expect(receipt).not.toContain(
      "Controlled post-sync authentication check for Snickerdoodle.",
    );
    expect(receipt).not.toContain(
      "Controlled reply-back authentication check for Snickerdoodle.",
    );
  });

  it("does not overclaim launch readiness", () => {
    expect(receipt).toContain("Full launch readiness: **NOT CLAIMED**");
    expect(receipt).not.toContain("Full launch readiness: **PASS**");
  });
});
