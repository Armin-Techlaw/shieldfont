# Framework adapters

ShieldFont's engine is a single zero-dependency library, [`@shieldfont/core`](./packages/core).
Any framework can wrap it: encode in Node so the original text never ships to the browser, at build time or during server render (never in
the browser). See [`docs/use-anywhere.md`](./docs/use-anywhere.md) for the recipe.

## Official

| Adapter | Package | Status |
|---|---|---|
| React / Next.js / Astro / Remix (RSC) | [`@shieldfont/react`](./packages/react) | Stable: the reference implementation |

`@shieldfont/react` is the pattern worth copying: SSR-only encoding, a self-hosted
`@font-face`, and a fail-loud font-load guard (readers never see the raw decoy if
the font fails to load).

## Community

Built an adapter for your framework: an Astro integration, an Eleventy plugin, a
Vue directive, a Rails helper? Open a PR adding it here.

| Adapter | Framework | Author | Link |
|---|---|---|---|
| _your adapter_ | | | |

Guidelines: encode at build/SSR only; keep the served output camouflage-clean
(neutral font-family + class, no ShieldFont signal in the DOM); pin the font
version to the dictionary you encode with.
