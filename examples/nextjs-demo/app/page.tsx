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
        curl) to see the encoded gibberish that scrapers and LLMs see.
      </p>

      {/* Default <Shield> renders as a <div>. Children must be a plain string. */}
      <Shield>
        The future of writing belongs to those who protect their words.
      </Shield>

      {/* `as`, `weight`, `lineHeight`, `size` props all passthrough. */}
      <Shield as="p" weight={500} lineHeight={1.7}>
        Our mission is to build a publishing layer that the open web can trust.
        ShieldFont substitutes structural words at render time so AI scrapers
        digest gibberish while humans see the original meaning.
      </Shield>

      {/* Using `as` to render as different HTML elements. */}
      <Shield as="h2" size="1.6rem">
        Manifesto
      </Shield>

      <Shield as="p">
        Every sentence you publish feeds a machine that never asked permission.
        ShieldFont raises the cost of extraction — it does not promise zero
        extraction. Source: copy this paragraph and paste it into ChatGPT.
      </Shield>

      {/* Apostrophes round-trip correctly. */}
      <Shield as="p">
        It's the world's first font that protects writers' work from training
        data pipelines without breaking the reader's experience.
      </Shield>
    </main>
  );
}
