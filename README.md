# TrailerTube

A static movie and trailer browser adapted from PolyvTube. Cloudflare Pages serves the built files; there is no runtime server or API secret in the deployed site. Movie records, genres and images are sourced from TMDB. Trailer playback uses YouTube's embedded player. Search, genre browsing, local likes, history, Watch later, playlists, theme switching and keyboard shortcuts run in the browser. The Playlists page generates genre selections from available trailers ranked by TMDB popularity; personal playlists remain in browser storage. The Play all on YouTube link opens up to 50 videos as a YouTube playlist.

Each production build generates `robots.txt`, a sitemap index, and sitemap shards from the built ordinary trailer feed. They list the public landing pages, nonempty curated playlists, and ordinary movies with a trailer not known to be unavailable; adult titles, search/filter URLs, and browser-local collections are excluded. The sitemap origin is `https://trailer.terryso.dev`. Generation fails if the copied feed does not match its manifest. Submit `https://trailer.terryso.dev/sitemap.xml` in Search Console after deployment. Sitemap inclusion does not guarantee indexing.

## Catalog scope and status

The collector queries TMDB movies by primary release date over a rolling ten-year window. It records catalog completeness separately from the number of records with a trailer. The default feed shows identified trailers that are not known to be unavailable. Titles without a TMDB genre appear under Uncategorized, and a YouTube thumbnail is used when movie artwork is unavailable and a trailer ID exists. Choose “All movies” in Filters to include films without an identified trailer or still awaiting a trailer check. YouTube controls availability, embed permissions and regional access; a saved video ID is not proof of permanent playback. When a selected trailer is unavailable or embedding is disabled, the collector checks other TMDB-listed YouTube trailers and chooses a verified embeddable alternative if one is available. If no usable Trailer is available, a TMDB-listed Teaser can be used and is labelled as a Teaser. Movies without a known qualifying release date, works absent from TMDB, and trailers not indexed by TMDB are not guaranteed to be covered. Trailer lookup includes the original language and 40 widely used languages; a missing result does not prove that no trailer exists in another language.

The collector breaks discovery into individual dates, deduplicates movie IDs, compares the result count with TMDB's reported total and retries with alternate sorts when the counts disagree. Any remaining count discrepancies are written to `.cache/audit.json`, and the website remains marked incomplete. Matching counts are a useful check, not proof that the upstream database contains every film or that each result is available everywhere.

YouTube Data API v3 can enrich linked trailers with duration, view counts and public or unlisted embed status. View counts belong to the linked trailer and reflect the collection time; they are not live movie-wide totals. Duration filters and Longs include only trailers with a known length and no known embed restriction; titles with unknown lengths are excluded from those filters. Availability can change and remains subject to the viewer’s location.

## Local development

Node.js 22 or newer is recommended.

```sh
npm install
npm run dev
npm test
npm run build
```

The static catalog is in `public/data/`. Generated catalog snapshots in `public/data/` and `public/adult-data/` are not stored in Git; a fresh checkout needs a valid snapshot restored or collected before building and serving the full site. `catalog.json` can contain an inline initial catalog or an indexed manifest with a small featured feed and precomputed category counts. Home and category pages load only the manifest; direct movie links load the matching movie and trailer-state shards when needed. Trailer search and filters load a separate, smaller trailer index. Unfiltered All movies browsing loads only the relevant ordered card and trailer-state shards; full-catalog search and advanced filters may load the complete movie catalog. Shard requests use bounded concurrency and retries for transient upstream failures. The bundle does not require the TMDB API key at runtime.

## Collect and refresh

Supply a TMDB API key through the environment. Optionally set `YOUTUBE_API_KEY` or `YOUTUBE_OAUTH_TOKEN_FILE` (a Google authorized-user JSON file) to check YouTube video durations and embed status during collection. Credentials stay local. It must never be committed or copied to `public/` or `dist/`.

```sh
TMDB_API_KEY='your-key' npm run collect
```

The process may take hours. `.cache/day-*.json` and `.cache/trailers.jsonl` record progress for resumption. YouTube status and duration cache entries are refreshed or discarded after 27 days when collection runs; a deployed snapshot does not refresh itself. Run collection and redeploy regularly to keep the published snapshot current. Use `COLLECT_START` and `COLLECT_END` as ISO dates to run a bounded range. The default end date is the current date in Asia/Shanghai, and the default start is ten years before it; `COLLECT_TIMEZONE` can change the time zone. For hosts requiring a network proxy, configure the Node.js proxy environment for the installed Node version. Respect upstream rate limits and TMDB licensing and attribution requirements.

The collector splits stable movie metadata and changing trailer state into separate sets of 64 ID-indexed shards, then writes the manifest only after all shards are written. This avoids re-uploading every movie record for each trailer batch. Run `npm run build` after an import to copy new files into `dist/`. Deployment to Cloudflare Pages is available through `wrangler pages deploy dist --project-name trailertube --branch main` after configuring Wrangler authentication. `scripts/audit-snapshot.mjs` verifies movie IDs, state and browse shard consistency, feed membership, category counts and ordering. `scripts/collect-and-deploy.mjs` runs collection, snapshot audits, tests, build and deployment sequentially; set `COLLECT_DEPLOY_CHECKPOINTS=1` to publish the discovered catalog and subsequent 10,000-record trailer batches as explicitly incomplete snapshots. The domain requires a Pages custom-domain association and an appropriate DNS record.

This product uses the TMDB API but is not endorsed or certified by TMDB.

## Adult-marked titles

Titles marked adult by TMDB are collected into a separate catalog. The entry is disabled by default; each visitor can enable “Show adult titles” in Settings to browse it. Saved adult videos are hidden from likes, history and personal playlists when the setting is disabled. This is a display preference, not access control: the separate static data files remain publicly reachable by URL.

The adult discovery and trailer jobs keep separate caches. Their immutable snapshots are validated for the explicit adult flag and synchronized into `public/adult-data` by the main collector before a deployment. The two catalogs can be at different stages of collection.
