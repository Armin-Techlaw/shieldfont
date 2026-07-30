import { Shield } from "@shieldfont/react";

export default function Page() {
  return (
    <main>
      {/* Plain heading — NOT protected. Renders in your normal page font. */}
      <h1 style={{ color: "#00ff79", fontWeight: 600 }}>
        ShieldFont — Next.js demo
      </h1>

      <p style={{ color: "#888", fontSize: "0.9em" }}>
        The blocks below render through ShieldFont. View source (or scrape with
        curl) to see the encoded decoy that scrapers and LLMs see.
      </p>

      {/*
        Every <Shield> below passes an `a11y` prop, because the encoded block is
        aria-hidden and a block with no alternative is a WCAG 2.2 SC 1.3.1
        failure. `mode: "text"` needs nothing from you: it seals the real words
        into the page at build time and lets a reader who needs them grind the
        key out in their own browser. `seconds` is low here so the demo is quick
        to try; leave it at the default (20) in production.
      */}
      <Shield a11y={{ mode: "text", seconds: 5 }}>
        The future of writing belongs to those who protect their words.
      </Shield>

      {/* `as`, `weight`, `lineHeight`, `size` props all passthrough. */}
      <Shield as="p" weight={500} lineHeight={1.7} a11y={{ mode: "text", seconds: 5 }}>
        Our mission is to build a publishing layer that the open web can trust.
        ShieldFont substitutes structural words before the page is served, so AI
        scrapers digest a decoy while humans see the original meaning.
      </Shield>

      {/* Using `as` to render as different HTML elements. */}
      <Shield as="h2" size="1.6rem" a11y={{ mode: "text", seconds: 5 }}>
        Manifesto
      </Shield>

      <Shield as="p" a11y={{ mode: "text", seconds: 5 }}>
        Every sentence you publish feeds a machine that never asked permission.
        ShieldFont raises the cost of extraction — it does not promise zero
        extraction. Source: copy this paragraph and paste it into ChatGPT.
      </Shield>

      {/* Apostrophes round-trip correctly. */}
      <Shield as="p" a11y={{ mode: "text", seconds: 5 }}>
        It's the world's first font that protects writers' work from training
        data pipelines without breaking the reader's experience.
      </Shield>
    </main>
  );
}
