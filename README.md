# MovieBox Provider for Nuvio

Scrapes direct HTTP streams from MovieBox (aoneroom.com) — no debrid, no P2P required.

Supports movies and TV shows with up to 4K resolution where available.

---

## Quick install (pre-built)

1. Open **Nuvio** → **Settings** → **Local Scrapers** (or **Providers**)
2. Tap **Add Repository URL** and paste the raw URL of your hosted `manifest.json`
3. Enable the **MovieBox** provider from the list

---

## Hosting on GitHub Pages (recommended — free)

1. Fork or push this repo to GitHub
2. Go to **Settings → Pages** → set source to `main` branch, `/ (root)` folder
3. GitHub will serve your files at `https://<username>.github.io/<repo>/`
4. Your manifest URL will be:
   ```
   https://<username>.github.io/<repo>/manifest.json
   ```
5. Paste that into Nuvio and you're done

> `providers/moviebox.js` is already pre-built and committed — no extra build step needed to use the hosted version.

---

## Local development

```bash
# Install build tools
npm install

# Build the provider from source
npm run build            # normal
npm run build:minify     # minified (smaller file)

# Run a quick smoke test (requires Node ≥ 18)
node test.js
```

### Project structure

```
nuvio-moviebox/
├── src/
│   └── moviebox/
│       └── index.js      ← edit this to modify the provider
├── providers/
│   └── moviebox.js       ← bundled output (committed so GitHub Pages can serve it)
├── manifest.json         ← repo manifest Nuvio reads
├── build.js              ← esbuild bundler
├── test.js               ← local smoke test
└── package.json
```

---

## How it works

1. Nuvio calls `getStreams(tmdbId, mediaType, season, episode)`
2. The provider POSTs the TMDB ID to the MovieBox `/api/v1/tmdbDetail` endpoint to get MovieBox's internal ID
3. For **movies**: fetches play URLs directly
4. For **TV**: resolves season → episode → play URLs
5. Returns an array of stream objects with `url`, `quality`, and playback `headers`

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "No internal ID found" | MovieBox doesn't have that title yet — try another source |
| Streams found but won't play | Try toggling an external player in Nuvio settings |
| API returns 403 | The aoneroom.com API blocked the request; wait and retry |
| All streams are `Auto` quality | MovieBox returned streams without a definition label — they still work |

---

## Disclaimer

This addon is a web scraper that accesses publicly reachable HTTP endpoints. No content is hosted here. You are solely responsible for ensuring your use complies with local laws and the terms of service of any site accessed.
