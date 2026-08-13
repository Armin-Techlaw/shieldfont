/** @type {import('next').NextConfig} */
module.exports = {
  // ShieldFont Studio is deliberately an authoring tool. Its custom encoder
  // runs in the browser so an author can prepare output to save elsewhere; it
  // must never be copied into a production page as a runtime protection layer.
};
