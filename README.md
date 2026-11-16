# TrailerTube

**<https://trailer.terryso.dev>** — free, ad-free movie trailer discovery. 92,000+ verified trailers rendered at the edge on Cloudflare, with `/llms.txt` and an open JSON API so AI agents can look up trailers too: <https://trailer.terryso.dev/api/v1/README.md>.

A static movie and trailer browser adapted from PolyvTube. Cloudflare Pages serves the built files; there is no runtime server or API secret in the deployed site. Movie records, genres and images are sourced from TMDB. Trailer playback uses YouTube's embedded player. Search, genre browsing, local likes, history, Watch later, playlists, theme switching and keyboard shortcuts run in the browser. The Playlists page generates genre selections from available trailers ranked by TMDB popularity; personal playlists remain in browser storage. The Play all on YouTube link opens up to 50 videos as a YouTube playlist.

The homepage is prerendered during both normal and staged incremental builds from the same catalog snapshot as the generated fast lists. The root route serves a dedicated static HTML document with movie and playlist links; the generic SPA shell stays separate so non-pilot URLs do not receive homepage content. React loads behind the static view and replaces it when the homepage data is ready, while a data-loading failure falls back to the normal interactive error state. The staged deployment verifier compares the root page's prerendered content against the built artifact and samples generated incremental details before promotion. A successful incremental deployment refreshes the homepage; a scheduler run that skips the build leaves it unchanged.

Each production build generates `robots.txt`, a sitemap index, and sitemap shards from the built ordinary trailer feed. They list the public landing pages, nonempty curated playlists, and ordinary movies with a trailer not known to be unavailable; adult titles, search/filter URLs, and browser-local collections are excluded. The sitemap origin is `https://trailer.terryso.dev`. Generation fails if the copied feed does not match its manifest. Submit `https://trailer.terryso.dev/sitemap.xml` in Search Console after deployment. Sitemap inclusion does not guarantee indexing.

The build also generates static HTML for the fixed pilot list in `seo/pilot-movie-ids.json`, using the same built snapshot. The fixed pilot contains an initial selection by TMDB popularity plus the movies shown on the homepage when this release was prepared. Pages are skipped if the trailer is no longer verified playable or the title is missing. Films without a synopsis are explicitly marked as such. They contain movie-specific title, description, canonical URL and visible fallback content; React replaces the fallback with the interactive app. A Pages preview verifies extensionless `/watch/<id>` routes before any production promotion. Other movie URLs continue to use the SPA shell.

Incremental snapshots also carry an `incrementalPrerenderIds` candidate list. New ordinary movies discovered after this feature is enabled are retained as candidates even if their trailer is not yet usable. Each build generates a static detail page once the movie has a title, description, valid YouTube ID and a verified embeddable trailer. Previously generated incremental pages are rebuilt from the new snapshot, and candidates are removed if they leave the ordinary catalog. Existing movies are not automatically backfilled; the fixed pilot continues independently. Candidate files grow over time, so deployment size and build duration should be monitored.

Pilot `VideoObject` markup uses YouTube Data API metadata captured on 2026-11-05 in `seo/pilot-video-metadata.json`: actual video title, publication timestamp and thumbnail. Markup is omitted when the current trailer ID has no matching verified public, embeddable video metadata. The film release date is never used as the video upload date. A Search Console live test detected a video on the sampled pilot page, though the page was not yet indexed.

Builds also generate a compact, integrity-checked ID index from the ordinary movie snapshot and a Cloudflare Pages Worker scoped to `/` and `/watch/*`. Direct GET and HEAD requests for an ID absent from that snapshot return 404; existing IDs continue to the site's static or React pages. Missing, malformed or mismatched index data returns 503 instead of incorrectly reporting a missing film. The index describes the published snapshot, which can be incomplete; it does not assert that a film is absent from TMDB. These routed requests invoke Pages Functions and are subject to the account's Workers usage limits. Adult routes are unchanged.

## Continuous playback

The ordinary movie player can continue through the currently loaded home, search, browse, saved collection or playlist items. The source queue is kept in session storage for this tab; opening a movie directly falls back to recent releases. Only items already loaded in a paginated list are included. The separate adult catalog is not added to ordinary playback queues.

Autoplay next is off by default and is stored in this browser. When enabled, an ended trailer starts a cancellable five-second countdown; the next movie is checked against the current catalog before advancing. Known unavailable entries are skipped, while lookup failures stop the queue. YouTube or the browser may block autoplay or prevent embedding; a user can retry, open YouTube or choose the next trailer. Opening or reloading a movie page attempts to play its trailer once the player is sufficiently visible. Browsers may block this attempt, in which case the viewer can start playback manually. The autoplay-next switch separately controls whether playback advances to another movie.

## Trailer version pilot and playback events

The homepage pilot can keep up to 10 distinct TMDB-listed Trailer or Teaser versions for a movie, only when YouTube verification reports the video as available and embeddable with a recorded check time. A version's name, language and official flag come from TMDB; availability can change after verification or by region. The legacy primary video remains the default, and choosing another version keeps the movie URL and next-movie queue. No matching version means the ordinary single-video interface remains unchanged.

A bounded local candidate snapshot for the homepage's first 48 feed films and first 10 popular films can be built with `scripts/stage-home-trailer-variants.mjs SOURCE_RUN NEW_STAGING_DIRECTORY` and the existing TMDB and YouTube credentials. This command only stages data and never deploys or updates the cursor. Only the selected ordinary films become tracked; later incremental runs refresh their versions when those movies are updated. Publishing a candidate requires baseline validation and the protected incremental promotion workflow, including the cursor and deferred queue.

When the existing Google Analytics client is available on the production hostname, ordinary-film playback emits allowlisted events: `trailer_play_started`, `trailer_play_completed`, `trailer_play_error`, `trailer_variant_switch`, `next_trailer_click`, `next_trailer_started`, and `autoplay_toggle`. Starts and completions come from actual YouTube state transitions, not page loads or clicks; no qualified-view duration is inferred. Events carry only applicable movie/video IDs and simple status values, never actor names, search text or adult titles. Local and preview hosts do not emit these custom events. If analytics is unavailable or blocked, playback continues normally.

## Movie details and people

Movie pages show the available synopsis, release date, genres and film runtime. Film runtime is stored as `runtimeMinutes` and must not be confused with `duration`, which is the trailer length in seconds. Director and leading-cast credits are shown only for valid TMDB credits; missing values are omitted. Incremental requests fetch TMDB credits for new movies and movies already marked for credit tracking; existing untracked movies do not trigger a credits backfill. Previously known metadata is preserved when credits are absent or malformed. Runtime can be refreshed when an existing movie is naturally updated.

Director and cast links open `/person/<tmdb-id>` pages with known films and role filters. The build generates a version-bound, 64-shard ordinary-catalog people index; a person page loads only its own shard. These filmographies reflect available stored credits, not a complete TMDB filmography. The separate adult catalog is not included in the people index.

For a bounded, local-only backfill of the first 48 homepage feed movies and the first 10 popular movies, use an existing immutable run snapshot and a **new** staging path:

```sh
TMDB_API_KEY=... node --max-old-space-size=4096 scripts/stage-home-details.mjs SOURCE_RUN NEW_STAGING_DIRECTORY
```

The staging command preserves the source snapshot and trailer states, writes a receipt, and never publishes or updates the cursor. A candidate can become stale while being prepared; production promotion requires the existing baseline guard, preview verification and a cursor update through the protected incremental promotion workflow. Never publish a candidate by copying it over the live catalog.

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
