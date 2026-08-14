/** @type {import('next').NextConfig} */
module.exports = {
  // Keep `next build` from replacing the client manifest used by a live
  // `next dev` process. The studio is commonly kept open while exports change.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  // ShieldFont Studio is deliberately an authoring tool. Its custom encoder
  // runs in the browser so an author can prepare output to save elsewhere; it
  // must never be copied into a production page as a runtime scraping-friction layer.
};
