/**
 * The cache of solved blocks, and the only thing that ever removes an entry.
 *
 * A reader who grinds out a block's answer keeps it in `localStorage` so the
 * next visit is instant. Nothing used to take one out again, and every build
 * re-mints every ciphertext, so every deploy orphaned every key the previous one
 * had produced — ~550 bytes each, for as long as the reader kept coming back.
 *
 * The bound is age: each value carries the time it was last used and anything
 * untouched for thirty days is dropped on the next page load. Two things about
 * that are worth a test rather than a comment.
 *
 * THE FIRST IS THE FIX THAT WOULD HAVE LOST DATA. "Drop every key with our
 * prefix that no block on this page needs" is the obvious sweep and it is wrong:
 * the prefix is per-SITE, so the entries it cannot account for are mostly the
 * reader's OTHER PAGES, and every navigation would wipe the cache for all of
 * them. `keeps entries this page knows nothing about` is that bug, standing.
 *
 * THE SECOND IS THAT TWO SCRIPTS SHARE THE STORE. A page may draw the wrapper on
 * one block and use the clipped control on the rest, and then `noticeScript` and
 * `solverScript` both run their sweep over the same keys. If they ever disagreed
 * about the value format, each would read the other's entries as unstamped and
 * delete them, so the fixtures below are run through both and the write paths
 * are pinned to one helper apiece.
 *
 * Like copy.test.ts, this runs the emitted source against a hand-built DOM
 * rather than inspecting the string: the sweep is code, not markup.
 */
import { describe, it, expect } from "vitest";
import { noticeScript } from "../src/notice.js";
import { solverScript } from "../src/solver.js";

const NAMES = {
  attr: "data-typeface",
  flag: "__tf_store__",
  logPrefix: "[typeface]",
  storePrefix: "data-typeface-",
};
const A = NAMES.attr;
const STORE = NAMES.storePrefix;
const DAY = 86_400_000;

const notice = () => noticeScript({ ...NAMES, family: "Optik" });
const solver = () => solverScript(NAMES);
/** Both halves of the pair, so a fix to one that misses the other fails here. */
const both = (): [string, string][] => [
  ["notice", notice()],
  ["solver", solver()],
];

// ---------------------------------------------------------------------------
// localStorage's real surface, and nothing else the scripts could lean on. The
// index-walk (`length` + `key(i)`) is the only way to enumerate a Storage, and
// modelling exactly it is what keeps the sweep honest about its cost.
// ---------------------------------------------------------------------------

class Store {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  /** Test-side only — the scripts never see these. */
  seed(k: string, v: string) { this.m.set(k, v); return this; }
  get keys() { return [...this.m.keys()]; }
}

/** A value the script itself would have written `age` milliseconds ago. */
function stamped(hex: string, age: number): string {
  return `${hex}.${(Date.now() - age).toString(36)}`;
}

/** A 40-character ciphertext head, which is what the key is built from. */
function ct(seed: string): string {
  return (seed + "x".repeat(64)).slice(0, 64);
}
const keyFor = (seed: string) => STORE + ct(seed).slice(0, 40);

// ---------------------------------------------------------------------------
// A DOM small enough to reason about. Same four selector shapes as copy.test.ts.
// ---------------------------------------------------------------------------

interface El {
  attrs: Record<string, string>;
  id: string;
  hidden: boolean;
  textContent: string;
  children: El[];
  parent: El | null;
  isConnected: boolean;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  hasAttribute(name: string): boolean;
  querySelector(sel: string): El | null;
  querySelectorAll(sel: string): El[];
  getElementsByTagName(tag: string): El[];
}

function el(
  attrs: Record<string, string>,
  opts: { id?: string; text?: string; children?: El[] } = {},
): El {
  const n: El = {
    attrs,
    id: opts.id ?? "",
    hidden: false,
    textContent: opts.text ?? "",
    children: opts.children ?? [],
    parent: null,
    isConnected: true,
    getAttribute: (name) => (name in n.attrs ? n.attrs[name]! : null),
    setAttribute: (name, value) => { n.attrs[name] = value; },
    removeAttribute: (name) => { delete n.attrs[name]; },
    hasAttribute: (name) => name in n.attrs,
    querySelector: (sel) => descendants(n).find((e) => matches(e, sel)) ?? null,
    querySelectorAll: (sel) => descendants(n).filter((e) => matches(e, sel)),
    getElementsByTagName: () => [],
  };
  for (const c of n.children) c.parent = n;
  return n;
}

/** `[name]` or `[name="value"]`. */
function matches(n: El, sel: string): boolean {
  const m = /^\[([^\]=]+)(?:="([^"]*)")?\]$/.exec(sel);
  if (!m) throw new Error(`the harness does not model the selector ${sel}`);
  const [, name, value] = m;
  if (!(name! in n.attrs)) return false;
  return value === undefined || n.attrs[name!] === value;
}

function descendants(n: El, out: El[] = []): El[] {
  for (const c of n.children) {
    out.push(c);
    descendants(c, out);
  }
  return out;
}

/** One frame the notice script will wire, sealed with `seed`'s ciphertext. */
function framePage(seed: string): El {
  const holder = el({ [`${A}-data`]: "" }, {
    text: JSON.stringify({ ct: ct(seed), n: "323", t: 10, iv: "AAAAAAAAAAAAAAAA" }),
  });
  return el({ [`${A}-frame`]: "" }, { children: [holder] });
}

/**
 * Run one emitted script over one store and one page.
 *
 * `crypto.subtle.digest` returns a promise that never settles: it makes the
 * script CAPABLE, so the cache-read path runs in full, and then parks the
 * decryption that follows it — which this file is not testing and which would
 * otherwise need a whole WebCrypto stub to avoid logging its own failure.
 */
function run(js: string, store: Store | null, root?: El) {
  const pool = root ? [root, ...descendants(root)] : [];
  const doc = {
    readyState: "complete",
    documentElement: el({}),
    fonts: { load: () => Promise.resolve([{ status: "loaded" }]) },
    addEventListener: () => {},
    querySelector: (s: string) => pool.find((e) => matches(e, s)) ?? null,
    querySelectorAll: (s: string) => pool.filter((e) => matches(e, s)),
    getElementById: (id: string) => pool.find((e) => e.id === id) ?? null,
  };
  const win: Record<string, unknown> = {
    crypto: { subtle: { digest: () => new Promise(() => {}) } },
    getSelection: () => null,
    isSecureContext: true,
  };
  Object.defineProperty(win, "localStorage", {
    get() {
      if (!store) throw new Error("storage is not available in this context");
      return store;
    },
  });
  new Function("window", "document", js)(win, doc);
}

describe("what bounds the cache of solved blocks", () => {
  it("drops an entry nothing has touched in thirty days", () => {
    for (const [name, js] of both()) {
      const s = new Store().seed(keyFor("old"), stamped("beef", 40 * DAY));
      run(js, s);
      expect(s.keys, `${name} kept a stale entry`).toHaveLength(0);
    }
  });

  it("keeps entries this page knows nothing about", () => {
    // THE TRAP. These belong to other pages of the same site — the prefix is
    // per-site, so a sweep that dropped everything the current page cannot
    // account for would turn "instant on return" into "never instant" for the
    // whole rest of the site, on every navigation.
    for (const [name, js] of both()) {
      const s = new Store()
        .seed(keyFor("elsewhere-1"), stamped("aa11", 3 * DAY))
        .seed(keyFor("elsewhere-2"), stamped("bb22", 29 * DAY));
      run(js, s);
      expect(s.keys.sort(), `${name} evicted another page's cache`).toEqual(
        [keyFor("elsewhere-1"), keyFor("elsewhere-2")].sort(),
      );
    }
  });

  it("never touches a key that is not ours", () => {
    for (const [name, js] of both()) {
      const s = new Store()
        .seed("theme", "dark")
        .seed("data-typeface", "not ours either")
        .seed(`${STORE}`.slice(0, -1) + "x-something", "nor this");
      const before = s.keys.slice();
      run(js, s);
      expect(s.keys, `${name} reached outside its own prefix`).toEqual(before);
    }
  });

  it("drops values written before the stamp existed", () => {
    // 0.3.2 stored the bare answer. Every one of those was written against a
    // ciphertext from an earlier build — sealText mints fresh primes and a fresh
    // IV per call — so it is unreachable by construction, not merely old.
    for (const [name, js] of both()) {
      const s = new Store().seed(keyFor("legacy"), "deadbeef");
      run(js, s);
      expect(s.keys, `${name} kept an unreachable entry`).toHaveLength(0);
    }
  });

  it("drops a value it cannot read a time out of", () => {
    for (const [name, js] of both()) {
      const s = new Store()
        .seed(keyFor("a"), "beef.")
        .seed(keyFor("b"), "beef.not-a-number-⏳");
      run(js, s);
      expect(s.keys, `${name} kept a malformed entry`).toHaveLength(0);
    }
  });

  it("keeps an entry whose stamp is in the future", () => {
    // A clock that moved backwards must not be a reason to throw away work the
    // reader paid for. Ageing resumes once the clock catches up.
    for (const [name, js] of both()) {
      const s = new Store().seed(keyFor("skew"), stamped("beef", -400 * DAY));
      run(js, s);
      expect(s.keys, `${name} evicted on a backwards clock`).toHaveLength(1);
    }
  });

  it("agrees with itself across both scripts on one store", () => {
    // A page can draw the wrapper on one block and use the clipped control on
    // the rest, so both scripts sweep the same keys on the same load.
    const s = new Store()
      .seed(keyFor("live"), stamped("aa11", 2 * DAY))
      .seed(keyFor("stale"), stamped("bb22", 31 * DAY))
      .seed("unrelated", "left alone");
    run(notice(), s);
    run(solver(), s);
    expect(s.keys.sort()).toEqual([keyFor("live"), "unrelated"].sort());
  });

  it("survives storage being disabled, full, or throwing", () => {
    for (const [name, js] of both()) {
      expect(() => run(js, null), `${name} let a storage failure escape`).not.toThrow();
    }
    // A frame on the page, so the read path runs too and not just the sweep.
    expect(() => run(notice(), null, framePage("blocked"))).not.toThrow();
  });

  it("writes through exactly one helper, and reads through two", () => {
    // The bound only holds if every write carries a stamp. A future edit that
    // reaches for localStorage directly — as both scripts used to — fails here
    // rather than silently minting an entry nothing can ever age out.
    for (const [name, js] of both()) {
      expect(js.match(/setItem/g) ?? [], `${name} writes outside keep()`).toHaveLength(1);
      expect(js.match(/getItem/g) ?? [], `${name} reads outside held()/tidy()`).toHaveLength(2);
    }
  });
});

describe("the entry a page is about to use", () => {
  it("survives the sweep and is re-stamped by the read", () => {
    // The bound is "not used in thirty days", not "written thirty days ago", so
    // a page in a reader's rotation stays cached for as long as they keep
    // reading it. Without this, a long-lived deploy would expire a cache its
    // reader was still using every week.
    const s = new Store().seed(keyFor("mine"), stamped("c0ffee", 25 * DAY));
    run(notice(), s, framePage("mine"));

    const after = s.getItem(keyFor("mine"))!;
    expect(after).not.toBeNull();
    const [hex, mark] = after.split(".");
    expect(hex, "the answer itself was altered").toBe("c0ffee");
    expect(Date.now() - parseInt(mark!, 36)).toBeLessThan(2000);

    // And the refreshed value is one the sweep still understands: a second load
    // a month later, with nothing else touching it, must keep it.
    const s2 = new Store().seed(keyFor("mine"), after);
    run(notice(), s2);
    expect(s2.keys).toEqual([keyFor("mine")]);
  });

  it("costs one pass over the store and nothing per entry it keeps", () => {
    // It runs on every page load, so the shape of the sweep is part of the
    // contract: enumerate once, read only our own keys, remove only the dead.
    const s = new Store();
    for (let i = 0; i < 50; i++) s.seed(`other-app-${i}`, "x");
    for (let i = 0; i < 10; i++) s.seed(keyFor(`live-${i}`), stamped("aa", DAY));
    let reads = 0;
    let removes = 0;
    const spied = Object.create(s, {
      getItem: { value: (k: string) => { reads++; return s.getItem(k); } },
      removeItem: { value: (k: string) => { removes++; s.removeItem(k); } },
    }) as Store;
    run(notice(), spied);
    expect(reads, "read a key belonging to another application").toBe(10);
    expect(removes).toBe(0);
  });
});
