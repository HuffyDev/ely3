import { describe, it, expect, beforeEach } from "vitest";
import { useMemoryDb } from "@/lib/db";
import * as d from "@/lib/disclosure/workflow";

function newDisclosure() {
  return d.createDisclosure({ reportId: "r1", network: "elysium", target: "0xabc", severity: "high", internalTitle: "Reentrancy in withdraw" }, "op");
}

describe("responsible-disclosure workflow", () => {
  beforeEach(() => useMemoryDb());

  it("starts in draft and requires notice approval before notifying", () => {
    const x = newDisclosure();
    expect(x.status).toBe("draft");
    expect(() => d.markNotified(x.id, "op")).toThrow();
  });

  it("cannot publish before a fix or the deadline", () => {
    const x = newDisclosure();
    d.approveNotice(x.id, "op");
    d.markNotified(x.id, "op");
    expect(() => d.approvePublish(x.id, "op", "A reentrancy issue was found and reported. This is a long enough summary.")).toThrow(/only allowed after/);
  });

  it("allows publishing after a fix, summary-only", () => {
    const x = newDisclosure();
    d.approveNotice(x.id, "op");
    d.markNotified(x.id, "op");
    d.markFixed(x.id, "op", "patched");
    const pub = d.approvePublish(x.id, "op", "The project fixed a reentrancy issue we reported privately. No exploit details are shared.");
    expect(pub.status).toBe("published");
    expect(d.publicDisclosures()).toHaveLength(1);
  });

  it("rejects a summary that contains exploit code or payloads", () => {
    const x = newDisclosure();
    d.approveNotice(x.id, "op");
    d.markNotified(x.id, "op");
    d.markFixed(x.id, "op");
    expect(() => d.approvePublish(x.id, "op", "function attack() public { target.call{value: 1}(''); }")).toThrow(/exploit code/i);
    expect(() => d.approvePublish(x.id, "op", "payload = 0x" + "a".repeat(90))).toThrow();
  });

  it("every transition is recorded for audit", () => {
    const x = newDisclosure();
    d.approveNotice(x.id, "op");
    d.markNotified(x.id, "op");
    const events = d.events(x.id).map((e) => e.action);
    expect(events).toEqual(["created", "notice_approved", "notified"]);
  });

  it("only published, fixed-or-expired items appear publicly, with no internal title", () => {
    const x = newDisclosure();
    d.approveNotice(x.id, "op");
    d.markNotified(x.id, "op");
    d.markFixed(x.id, "op");
    d.approvePublish(x.id, "op", "A vulnerability was reported and fixed. Summary only, nothing exploitable here.");
    const pubs = d.publicDisclosures();
    expect(pubs[0]).not.toHaveProperty("internalTitle");
    expect(JSON.stringify(pubs[0])).not.toContain("Reentrancy in withdraw");
  });
});
