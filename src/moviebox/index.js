/**
 * MovieBox Provider for Nuvio
 * Uses the MovieBox (aoneroom.com) API to resolve streams via TMDB ID.
 *
 * API base  : https://h5-api.aoneroom.com
 * Supported : Movies + TV Shows
 * Formats   : MP4, DASH (MPD), HLS (M3U8)
 */

const API_BASE  = 'https://h5-api.aoneroom.com';
const SITE_BASE = 'https://themoviebox.xyz';

/** Common headers expected by the MovieBox API */
const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Origin': SITE_BASE,
  'Referer': SITE_BASE + '/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** Playback headers to attach to returned stream objects */
const PLAY_HEADERS = {
  'User-Agent': COMMON_HEADERS['User-Agent'],
  'Referer': SITE_BASE + '/',
  'Origin': SITE_BASE,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiGet(path) {
  const res = await fetch(API_BASE + path, { headers: COMMON_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  const json = await res.json();
  if (json.code !== 1 && json.code !== 0) {
    throw new Error(`API error code ${json.code}: ${json.msg || 'unknown'}`);
  }
  return json.data;
}

/**
 * Map a TMDB ID → MovieBox internal ID.
 * mediaType: "movie" | "tv"
 */
async function resolveMovieBoxId(tmdbId, mediaType) {
  // MovieBox type flag: 1 = movie, 2 = tv
  const typeFlag = mediaType === 'movie' ? 1 : 2;
  const data = await apiGet(`/api/v1/tmdbDetail?tmdbId=${tmdbId}&type=${typeFlag}`);
  if (!data || !data.id) return null;
  return String(data.id);
}

/**
 * Fetch all available play-URL entries for a given MovieBox resource ID.
 * resourceId : MovieBox internal movie or episode ID
 * resourceType: 1 = movie, 2 = tv episode
 */
async function fetchPlayUrls(resourceId, resourceType) {
  const data = await apiGet(`/api/v1/play/url?id=${resourceId}&type=${resourceType}`);
  if (!data) return [];

  const list = data.list || data.urls || [];
  return list;
}

/** Convert raw MovieBox play-url entries into Nuvio stream objects */
function normaliseStreams(rawList, providerLabel) {
  const streams = [];

  for (const item of rawList) {
    // Skip entries without a usable URL
    const url = item.path || item.url || item.playUrl;
    if (!url) continue;

    const quality = item.definition || item.quality || 'Auto';
    const size    = item.size ? ` [${item.size}]` : '';

    streams.push({
      name:    'MovieBox',
      title:   `${providerLabel} · ${quality}${size}`,
      url,
      quality,
      headers: PLAY_HEADERS,
    });
  }

  return streams;
}

// ---------------------------------------------------------------------------
// Movie
// ---------------------------------------------------------------------------

async function getMovieStreams(movieBoxId) {
  // Grab movie detail to confirm it exists
  const detail = await apiGet(`/api/v1/movie/detail?id=${movieBoxId}`);
  if (!detail) return [];

  const label = detail.name || 'MovieBox';
  const rawUrls = await fetchPlayUrls(movieBoxId, 1);
  return normaliseStreams(rawUrls, label);
}

// ---------------------------------------------------------------------------
// TV
// ---------------------------------------------------------------------------

async function getTvStreams(movieBoxId, seasonNum, episodeNum) {
  // 1. Fetch season list
  const seasons = await apiGet(`/api/v1/tv/season?id=${movieBoxId}`);
  if (!seasons || !seasons.length) return [];

  // Find matching season (try seasonNum field, fall back to list index)
  const season = seasons.find(s =>
    s.seasonNum === seasonNum || s.number === seasonNum || s.season === seasonNum
  ) || seasons[seasonNum - 1];

  if (!season) {
    console.error(`[MovieBox] Season ${seasonNum} not found`);
    return [];
  }

  // 2. Fetch episode list for that season
  const episodeData = await apiGet(
    `/api/v1/tv/episode?seasonId=${season.id}&page=1&pageSize=200`
  );
  const episodes = episodeData?.list || episodeData || [];

  const episode = episodes.find(e =>
    e.episodeNum === episodeNum || e.number === episodeNum || e.episode === episodeNum
  ) || episodes[episodeNum - 1];

  if (!episode) {
    console.error(`[MovieBox] Episode ${episodeNum} not found in season ${seasonNum}`);
    return [];
  }

  // 3. Get play URLs for this episode
  const rawUrls = await fetchPlayUrls(episode.id, 2);
  const label   = episode.name || `S${seasonNum}E${episodeNum}`;
  return normaliseStreams(rawUrls, label);
}

// ---------------------------------------------------------------------------
// Entry point — required by Nuvio
// ---------------------------------------------------------------------------

/**
 * @param {string|number} tmdbId
 * @param {string}        mediaType  "movie" | "tv"
 * @param {number}        [seasonNum]   TV only
 * @param {number}        [episodeNum]  TV only
 * @returns {Promise<Array>}
 */
async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  try {
    console.log(`[MovieBox] Resolving ${mediaType} tmdbId=${tmdbId}`);

    const movieBoxId = await resolveMovieBoxId(tmdbId, mediaType);
    if (!movieBoxId) {
      console.error(`[MovieBox] No internal ID found for tmdbId=${tmdbId}`);
      return [];
    }

    if (mediaType === 'tv') {
      return await getTvStreams(movieBoxId, seasonNum, episodeNum);
    }

    return await getMovieStreams(movieBoxId);

  } catch (err) {
    console.error('[MovieBox] Fatal error:', err.message || err);
    return [];
  }
}

// Support both CommonJS (Nuvio/QuickJS) and ES module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
