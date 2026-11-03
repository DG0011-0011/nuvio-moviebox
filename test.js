/**
 * Quick test — run AFTER building:
 *   npm install && npm run build && node test.js
 */
const { getStreams } = require('./providers/moviebox.js');

async function run() {
  console.log('\n=== MovieBox Provider Test ===\n');

  // Movie test: Interstellar (tmdbId 157336)
  console.log('[TEST] Movie — Interstellar (157336)');
  const movieStreams = await getStreams('157336', 'movie');
  console.log(`Found ${movieStreams.length} stream(s)`);
  if (movieStreams.length) console.log(JSON.stringify(movieStreams[0], null, 2));

  // TV test: Breaking Bad S1E1 (tmdbId 1396)
  console.log('\n[TEST] TV — Breaking Bad S1E1 (1396)');
  const tvStreams = await getStreams('1396', 'tv', 1, 1);
  console.log(`Found ${tvStreams.length} stream(s)`);
  if (tvStreams.length) console.log(JSON.stringify(tvStreams[0], null, 2));
}

run().catch(console.error);
