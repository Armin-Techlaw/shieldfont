/** @type {import('next').NextConfig} */
module.exports = {
  // No special config needed. <Shield> encodes in Node during the server
  // render, so nothing about the encoder reaches the bundler.
  //
  // The font files DO need to be reachable over HTTP: `npm run copy-fonts`
  // (wired to predev/prebuild) copies them from the package into public/fonts/,
  // which is where <Shield> points by default. Override with setFontHost() if
  // you serve them from somewhere else.
};
