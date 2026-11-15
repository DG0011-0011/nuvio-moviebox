#!/usr/bin/env node
/**
 * build.js — bundles src/<provider>/index.js → providers/<provider>.js
 *
 * Usage:
 *   node build.js              # build all providers in src/
 *   node build.js moviebox     # build only moviebox
 *   node build.js --minify     # build all, minified
 */

const { build } = require('esbuild');
const path = require('path');
const fs   = require('fs');

const SRC_DIR  = path.join(__dirname, 'src');
const OUT_DIR  = path.join(__dirname, 'providers');
const minify   = process.argv.includes('--minify');

// Which providers to build (from CLI args, excluding flags)
const targets = process.argv
  .slice(2)
  .filter(a => !a.startsWith('--'));

// If no targets specified, build everything in src/
const providers = targets.length
  ? targets
  : fs.readdirSync(SRC_DIR).filter(d =>
      fs.statSync(path.join(SRC_DIR, d)).isDirectory()
    );

(async () => {
  for (const name of providers) {
    const entryPoint = path.join(SRC_DIR, name, 'index.js');
    const outfile    = path.join(OUT_DIR, `${name}.js`);

    if (!fs.existsSync(entryPoint)) {
      console.error(`[build] Entry not found: ${entryPoint}`);
      continue;
    }

    try {
      await build({
        entryPoints: [entryPoint],
        bundle:      true,
        format:      'cjs',
        target:      'es2020',
        platform:    'neutral',
        outfile,
        minify,
        logLevel:    'info',
        // QuickJS / Hermes don't have a DOM; mark browser-only globals external
        define: { 'process.env.NODE_ENV': '"production"' },
      });
      console.log(`[build] ✅ ${name} → ${outfile}`);
    } catch (err) {
      console.error(`[build] ❌ ${name} failed:`, err.message);
    }
  }
})();
