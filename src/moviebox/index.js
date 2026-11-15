/**
 * MovieBox Provider for Nuvio
 * Uses the MovieBox mobile BFF (api3.aoneroom.com/wefeed-mobile-bff)
 * with HMAC-MD5 request signing — confirmed working November 2026.
 */

const CryptoJS = require('crypto-js');

// ── Constants ─────────────────────────────────────────────────────────────────
const API_BASE   = 'https://api3.aoneroom.com';
const TOKEN_URL  = 'https://apig.inmoviebox.com/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=4516404531735022304&page=1&perPage=1';
const PLAYER_BASE = 'https://moviebox.ph';
const TMDB_BASE  = 'https://api.themoviedb.org/3';
const TMDB_KEY   = '52f18e95f9b70f4b389e96e2283c1f5a';

const HOST_POOL = [
  'https://api6.aoneroom.com',
  'https://api5.aoneroom.com',
  'https://api4.aoneroom.com',
  'https://api3.aoneroom.com',
];

const PKG = {
  package_name: 'com.community.oneroom',
  version_name: '4.0.04.1112.03',
  version_code:  50041112,
};

const UA_APP    = `${PKG.package_name}/${PKG.version_code} (Linux; U; Android 15; en_US; Pixel 9; Build/AP3A.240905.015; Cronet/154.0.7582.0)`;
const UA_PLAYER = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36';

// ── HMAC signing keys (double base64 decoded) ─────────────────────────────────
const SECRET_KEY = CryptoJS.enc.Base64.parse(
  CryptoJS.enc.Base64.parse('NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==').toString(CryptoJS.enc.Utf8)
);
const SECRET_KEY_ALT = CryptoJS.enc.Base64.parse(
  CryptoJS.enc.Base64.parse('WHFuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ==').toString(CryptoJS.enc.Utf8)
);

// ── Session state ─────────────────────────────────────────────────────────────
let bearerToken = null;
let deviceId    = '';

function ensureDevice() {
  if (deviceId) return;
  const hex = '0123456789abcdef';
  for (let i = 0; i < 32; i++) deviceId += hex[Math.floor(Math.random() * 16)];
}

// ── Crypto helpers ────────────────────────────────────────────────────────────
function md5(input) {
  return CryptoJS.MD5(input).toString(CryptoJS.enc.Hex);
}

function xClientToken(ts) {
  const rev = String(ts).split('').reverse().join('');
  return `${ts},${md5(rev)}`;
}

function canonicalString(method, accept, ct, url, body, ts) {
  let path = '', query = '';
  try {
    const u     = new URL(url);
    path        = u.pathname;
    const keys  = Array.from(u.searchParams.keys()).sort();
    if (keys.length) {
      query = keys.map(k => u.searchParams.getAll(k).map(v => `${k}=${v}`).join('&')).join('&');
    }
  } catch (_) {
    path = url.replace(/https?:\/\/[^/]+/, '');
  }
  const canon = query ? `${path}?${query}` : path;
  let bodyHash = '', bodyLen = '';
  if (body) {
    const words  = CryptoJS.enc.Utf8.parse(body);
    bodyHash     = md5(words);
    bodyLen      = words.sigBytes.toString();
  }
  return `${method.toUpperCase()}\n${accept || ''}\n${ct || ''}\n${bodyLen}\n${ts}\n${bodyHash}\n${canon}`;
}

function xTrSignature(method, accept, ct, url, body, ts, useAlt = false) {
  const canon = canonicalString(method, accept, ct, url, body, ts);
  const key   = useAlt ? SECRET_KEY_ALT : SECRET_KEY;
  const sig   = CryptoJS.HmacMD5(canon, key).toString(CryptoJS.enc.Base64);
  return `${ts}|2|${sig}`;
}

function xClientInfo() {
  return JSON.stringify({
    ...PKG,
    os: 'android', os_version: '14', device_id: deviceId,
    install_store: 'official', gaid: '1b2212c1-dadf-43c3-a0c8-bd6ce48ae22d',
    brand: 'google', model: 'Pixel 9', system_language: 'en',
    net: 'NETWORK_WIFI', region: 'NG', timezone: 'Africa/Lagos', sp_code: '',
  });
}

// ── Core signed HTTP request ──────────────────────────────────────────────────
async function mbRequest(method, url, body = null, extraHeaders = {}, skipAuth = false) {
  ensureDevice();
  const ts  = Date.now();
  const ct  = body ? 'application/json; charset=utf-8' : 'application/json';
  const acc = 'application/json';

  const headers = {
    'Accept':          acc,
    'Content-Type':    ct,
    'x-client-token':  xClientToken(ts),
    'x-tr-signature':  xTrSignature(method, acc, ct, url, body, ts),
    'x-client-info':   xClientInfo(),
    'x-client-status': '0',
    'User-Agent':      UA_APP,
    ...extraHeaders,
  };
  if (!skipAuth && bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;

  const opts = { method, headers };
  if (body) opts.body = body;

  // Try fallback hosts in pool
  const origHost = (() => { try { return new URL(url).host; } catch (_) { return ''; } })();
  const apiHosts = new Set(HOST_POOL.map(h => new URL(h).host));
  const hosts    = apiHosts.has(origHost)
    ? [origHost, ...HOST_POOL.map(h => new URL(h).host).filter(h => h !== origHost)]
    : [origHost];

  for (const host of hosts.slice(0, 3)) {
    try {
      const reqUrl = new URL(url);
      reqUrl.host  = host;
      const res    = await fetch(reqUrl.toString(), opts);

      // Capture any new token from x-user header
      const xUser = res.headers && res.headers.get('x-user');
      if (xUser) {
        try {
          const t = JSON.parse(xUser)?.token;
          if (t) bearerToken = t;
        } catch (_) {}
      }

      if (!res.ok && (res.status === 403 || res.status >= 500)) continue;

      const text = await res.text();
      try { return { data: JSON.parse(text), headers: res.headers }; }
      catch (_) { return { data: text, headers: res.headers }; }
    } catch (err) {
      console.error(`[MovieBox] Host ${host} failed:`, err.message);
    }
  }
  return null;
}

// ── Token management ──────────────────────────────────────────────────────────
function isTokenValid(token) {
  if (!token) return false;
  try {
    const parts  = token.split('.');
    let b64      = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json   = CryptoJS.enc.Base64.parse(b64).toString(CryptoJS.enc.Utf8);
    const { exp } = JSON.parse(json);
    return exp > Date.now() / 1000 + 3600;
  } catch (_) { return false; }
}

async function getToken() {
  if (isTokenValid(bearerToken)) return bearerToken;
  console.log('[MovieBox] Fetching fresh token...');
  await mbRequest('GET', TOKEN_URL, null, {}, true); // token auto-captured from x-user
  return bearerToken || '';
}

// ── TMDB helpers ──────────────────────────────────────────────────────────────
async function fetchTmdbDetails(tmdbId, mediaType) {
  try {
    const res  = await fetch(`${TMDB_BASE}/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`);
    const data = await res.json();
    return {
      title:         mediaType === 'movie' ? (data.title || data.original_title) : (data.name || data.original_name),
      originalTitle: data.original_title || data.original_name || '',
      year:          (data.release_date || data.first_air_date || '').slice(0, 4),
    };
  } catch (e) {
    console.error('[MovieBox] TMDB error:', e.message);
    return null;
  }
}

// ── Search ────────────────────────────────────────────────────────────────────
async function searchMovieBox(keyword) {
  const url  = `${API_BASE}/wefeed-mobile-bff/subject-api/search/v2`;
  const body = JSON.stringify({ page: 1, perPage: 20, keyword, restrictKid: 1 });
  const res  = await mbRequest('POST', url, body);
  if (!res?.data?.data?.results) return [];
  let subjects = [];
  res.data.data.results.forEach(g => { if (g.subjects) subjects = subjects.concat(g.subjects); });
  return subjects;
}

function normalizeTitle(s) {
  return String(s || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(dub|dubbed|hd|4k|hindi|tamil|telugu|dual\s*audio)\b/gi, ' ')
    .toLowerCase()
    .replace(/:/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findBestMatch(subjects, title, year, mediaType) {
  const needle     = normalizeTitle(title);
  const targetType = mediaType === 'movie' ? 1 : 2;
  let best = null, bestScore = 0;

  for (const s of subjects) {
    if (s.subjectType !== targetType) continue;
    const normName = normalizeTitle(s.title || '');
    const subYear  = String(s.year || (s.releaseDate || '').slice(0, 4));
    let score = 0;
    if (normName === needle)                                        score += 50;
    else if (normName.includes(needle) || needle.includes(normName)) score += 15;
    if (year && subYear && year === subYear)                        score += 35;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return bestScore >= 40 ? best : null;
}

// ── Stream extraction ─────────────────────────────────────────────────────────
function getFormatType(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('.mpd'))  return 'DASH';
  if (u.includes('.m3u8')) return 'HLS';
  if (u.includes('.mp4'))  return 'MP4';
  if (u.includes('.mkv'))  return 'MKV';
  return 'VIDEO';
}

function extractStreamsFromPlayData(pd) {
  const seen    = new Set();
  const results = [];

  const addStream = (url, quality, format, signCookie, language) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    results.push({ url, quality, format: format || getFormatType(url), signCookie: signCookie || null, language: language || 'Original' });
  };

  // Primary streams array
  for (const s of (pd.streams || [])) {
    const url = s.url || s.playUrl || s.resourceLink || s.streamUrl || '';
    const q   = s.resolutions || s.resolution || s.quality || 'Auto';
    addStream(url, q, s.format, s.signCookie, s.languageName || s.lanName);
  }

  // DASH streams
  const dash = pd.netDash || pd.data?.netDash || [];
  for (const d of (Array.isArray(dash) ? dash : [dash])) {
    if (!d) continue;
    const url = typeof d === 'string' ? d : d.url || d.playUrl || '';
    addStream(url, d.resolution || 'Auto', 'DASH', d.signCookie, d.languageName);
  }

  // HLS streams
  const hls = pd.netHls || pd.data?.netHls || [];
  for (const h of (Array.isArray(hls) ? hls : [hls])) {
    if (!h) continue;
    const url = typeof h === 'string' ? h : h.url || h.playUrl || '';
    addStream(url, h.resolution || 'Auto', 'HLS', h.signCookie, h.languageName);
  }

  // resourceDetectors fallback
  for (const det of (pd.resourceDetectors || [])) {
    for (const video of (det.resolutionList || [])) {
      if (!video.resourceLink) continue;
      const q = video.resolution ? `${video.resolution}p` : (video.title?.match(/\d{3,4}p/i)?.[0] || 'Auto');
      addStream(video.resourceLink, q, getFormatType(video.resourceLink), null, null);
    }
  }

  return results;
}

// ── Main stream fetcher ───────────────────────────────────────────────────────
async function getStreamLinks(subjectId, season, episode, title, mediaType) {
  // Get subject detail to find dubs and player domain
  const detailRes  = await mbRequest('GET', `${API_BASE}/wefeed-mobile-bff/subject-api/get?subjectId=${subjectId}`);
  const subjectData = detailRes?.data?.data || {};

  // Determine player base from subject data or fall back
  let playerBase = PLAYER_BASE;
  for (const val of [subjectData.detailDomain, subjectData.webDomain, subjectData.shareUrl]) {
    if (!val) continue;
    try {
      const parsed = new URL(val.startsWith('http') ? val : `https://${val}`);
      if (!parsed.hostname.endsWith('aoneroom.com')) { playerBase = parsed.origin; break; }
    } catch (_) {}
  }

  const referer    = `${playerBase}/`;
  const detailPath = subjectData.detailPath || '';

  // Build dub list (original first)
  const dubList = [];
  let originalLang = 'Original';
  for (const dub of (subjectData.dubs || [])) {
    if (String(dub.subjectId) === String(subjectId)) { originalLang = dub.lanName || 'Original'; }
    else dubList.push({ id: String(dub.subjectId), lang: dub.lanName || 'Unknown' });
  }
  dubList.unshift({ id: String(subjectId), lang: originalLang });

  const playbackHeaders = {
    'Origin':                playerBase,
    'Referer':               referer,
    'User-Agent':            UA_PLAYER,
    'x-request-lang':        'en',
    'x-vip-restrict':        '0',
    'x-no-high-risk-restrict': '0',
  };

  const allStreams = [];
  const se = mediaType === 'tv' ? season  : 0;
  const ep = mediaType === 'tv' ? episode : 0;

  for (const { id, lang } of dubList) {
    try {
      const params = new URLSearchParams({ subjectId: id, se, ep, streamSignType: '1' });
      if (detailPath) params.set('detailPath', detailPath);
      params.set('supportCodecs[hevc]', '1');
      params.set('supportCodecs[h264]', '1');

      const playRes = await mbRequest('GET', `${API_BASE}/wefeed-mobile-bff/subject-api/play-info?${params}`, null, playbackHeaders);
      if (!playRes?.data?.data) continue;

      const streams = extractStreamsFromPlayData(playRes.data.data);

      for (const s of streams) {
        const q     = typeof s.quality === 'string' && s.quality.match(/\d+/) ? s.quality.replace(/[^0-9p]/gi,'').concat('p').replace(/pp$/,'p') : s.quality || 'Auto';
        const label = `MovieBox · ${q} (${lang}) [${s.format}]`;
        const hdr   = { ...playbackHeaders };
        if (s.signCookie) hdr['Cookie'] = s.signCookie;

        allStreams.push({
          name:    'MovieBox',
          title:   label,
          url:     s.url,
          quality: q,
          headers: hdr,
          provider: 'moviebox',
        });
      }
    } catch (err) {
      console.error(`[MovieBox] Stream fetch error for id=${id}:`, err.message);
    }
  }

  // Sort best quality first
  const rank = { '2160p': 2160, '4k': 2160, '1440p': 1440, '1080p': 1080, '720p': 720, '480p': 480, '360p': 360, '240p': 240, 'auto': 1 };
  allStreams.sort((a, b) => (rank[b.quality?.toLowerCase()] || 0) - (rank[a.quality?.toLowerCase()] || 0));
  return allStreams;
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function getStreams(tmdbId, mediaType, seasonNum = 1, episodeNum = 1) {
  try {
    console.log(`[MovieBox] ${mediaType} tmdbId=${tmdbId} S${seasonNum}E${episodeNum}`);

    await getToken();
    if (!bearerToken) { console.error('[MovieBox] Could not get token'); return []; }

    const details = await fetchTmdbDetails(tmdbId, mediaType);
    if (!details) return [];
    console.log(`[MovieBox] Looking for "${details.title}" (${details.year})`);

    // Search with title, fall back to original title
    let subjects = await searchMovieBox(details.title);
    let match    = findBestMatch(subjects, details.title, details.year, mediaType);

    if (!match && details.originalTitle && details.originalTitle !== details.title) {
      subjects = await searchMovieBox(details.originalTitle);
      match    = findBestMatch(subjects, details.originalTitle, details.year, mediaType);
    }

    if (!match) { console.log(`[MovieBox] No match found for: ${details.title}`); return []; }
    console.log(`[MovieBox] Matched: "${match.title}" subjectId=${match.subjectId}`);

    return await getStreamLinks(match.subjectId, seasonNum, episodeNum, details.title, mediaType);
  } catch (err) {
    console.error('[MovieBox] Fatal:', err.message);
    return [];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
