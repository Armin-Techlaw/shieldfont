/**
 * The dev-time warning for an omitted `a11y` prop.
 *
 * Lives in its own file, and re-imports the module per test, because the
 * "once per process" latch is module-scoped: any other test that renders a
 * <Shield> without `a11y` would consume it first and make these assertions
 * meaningless.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const BODY = "The future of writing belongs to those who write it.";

/** A fresh module instance, so the warn-once latch is unset. */
async function freshShield() {
  vi.resetModules();
  return (await import("../src/Shield.js")).Shield;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("omitting a11y", () => {
  it("warns once per process, not once per block", async () => {
    const Shield = await freshShield();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    for (let i = 0; i < 25; i++) Shield({ children: `${BODY} ${i}` });

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain("a11y");
    expect(message).toMatch(/aria-hidden/);
    expect(message).toMatch(/WCAG/);
    // It must point at the fix, including the explicit opt-out...
    expect(message).toMatch(/mode: "none"/);
    // ...and must not re-suggest the thing this release deleted.
    expect(message).toMatch(/speechSynthesis/);
    expect(message).toMatch(/build time/i);
  });

  it("does not warn when a11y IS supplied, in any mode", async () => {
    const Shield = await freshShield();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    Shield({ children: BODY, a11y: { mode: "none" } });
    Shield({ children: BODY, a11y: { mode: "text", href: "/p.txt" } });
    Shield({ children: BODY, a11y: { mode: "audio", src: "/a.mp3" } });

    expect(warn).not.toHaveBeenCalled();
  });

  it("stays quiet in production — it is a development-time warning", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const Shield = await freshShield();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    Shield({ children: BODY });

    expect(warn).not.toHaveBeenCalled();
  });

  it("still renders normally when it warns", async () => {
    const Shield = await freshShield();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const tree = Shield({ children: BODY });
    expect(tree).toBeTruthy();
    expect(JSON.stringify(tree)).toContain("aria-hidden");
  });
});
