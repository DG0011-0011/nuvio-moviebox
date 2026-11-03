// src/moviebox/index.js
var API_BASE = "https://h5-api.aoneroom.com";
var SITE_BASE = "https://themoviebox.xyz";
var COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Origin": SITE_BASE,
  "Referer": SITE_BASE + "/",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9"
};
var PLAY_HEADERS = {
  "User-Agent": COMMON_HEADERS["User-Agent"],
  "Referer": SITE_BASE + "/",
  "Origin": SITE_BASE
};
async function apiGet(path) {
  const res = await fetch(API_BASE + path, { headers: COMMON_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  const json = await res.json();
  if (json.code !== 1 && json.code !== 0) {
    throw new Error(`API error code ${json.code}: ${json.msg || "unknown"}`);
  }
  return json.data;
}
async function resolveMovieBoxId(tmdbId, mediaType) {
  const typeFlag = mediaType === "movie" ? 1 : 2;
  const data = await apiGet(`/api/v1/tmdbDetail?tmdbId=${tmdbId}&type=${typeFlag}`);
  if (!data || !data.id) return null;
  return String(data.id);
}
async function fetchPlayUrls(resourceId, resourceType) {
  const data = await apiGet(`/api/v1/play/url?id=${resourceId}&type=${resourceType}`);
  if (!data) return [];
  const list = data.list || data.urls || [];
  return list;
}
function normaliseStreams(rawList, providerLabel) {
  const streams = [];
  for (const item of rawList) {
    const url = item.path || item.url || item.playUrl;
    if (!url) continue;
    const quality = item.definition || item.quality || "Auto";
    const size = item.size ? ` [${item.size}]` : "";
    streams.push({
      name: "MovieBox",
      title: `${providerLabel} \xB7 ${quality}${size}`,
      url,
      quality,
      headers: PLAY_HEADERS
    });
  }
  return streams;
}
async function getMovieStreams(movieBoxId) {
  const detail = await apiGet(`/api/v1/movie/detail?id=${movieBoxId}`);
  if (!detail) return [];
  const label = detail.name || "MovieBox";
  const rawUrls = await fetchPlayUrls(movieBoxId, 1);
  return normaliseStreams(rawUrls, label);
}
async function getTvStreams(movieBoxId, seasonNum, episodeNum) {
  const seasons = await apiGet(`/api/v1/tv/season?id=${movieBoxId}`);
  if (!seasons || !seasons.length) return [];
  const season = seasons.find(
    (s) => s.seasonNum === seasonNum || s.number === seasonNum || s.season === seasonNum
  ) || seasons[seasonNum - 1];
  if (!season) {
    console.error(`[MovieBox] Season ${seasonNum} not found`);
    return [];
  }
  const episodeData = await apiGet(
    `/api/v1/tv/episode?seasonId=${season.id}&page=1&pageSize=200`
  );
  const episodes = episodeData?.list || episodeData || [];
  const episode = episodes.find(
    (e) => e.episodeNum === episodeNum || e.number === episodeNum || e.episode === episodeNum
  ) || episodes[episodeNum - 1];
  if (!episode) {
    console.error(`[MovieBox] Episode ${episodeNum} not found in season ${seasonNum}`);
    return [];
  }
  const rawUrls = await fetchPlayUrls(episode.id, 2);
  const label = episode.name || `S${seasonNum}E${episodeNum}`;
  return normaliseStreams(rawUrls, label);
}
async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  try {
    console.log(`[MovieBox] Resolving ${mediaType} tmdbId=${tmdbId}`);
    const movieBoxId = await resolveMovieBoxId(tmdbId, mediaType);
    if (!movieBoxId) {
      console.error(`[MovieBox] No internal ID found for tmdbId=${tmdbId}`);
      return [];
    }
    if (mediaType === "tv") {
      return await getTvStreams(movieBoxId, seasonNum, episodeNum);
    }
    return await getMovieStreams(movieBoxId);
  } catch (err) {
    console.error("[MovieBox] Fatal error:", err.message || err);
    return [];
  }
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
