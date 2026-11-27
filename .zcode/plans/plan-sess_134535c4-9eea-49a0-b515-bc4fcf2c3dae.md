# Worker 按需渲染 /watch/* + 相邻 SEO 修复

## Context

SEO 审计（2026-11-11）结论：92,207 个 sitemap URL 仅 151 页收录，91,644 页「已发现-尚未编入索引」。根因：除 500 个静态预渲染页外，其余 91.7k 个 `/watch/*` 返回相同的 SPA 壳（通用 title、无 canonical、空 body），且零外链新站抓取预算极低。增量管线（`incremental/stage.mjs:23`）只预渲染「新发现」的电影，不动 91.7k 存量。

本方案把 `edge/watch-status.mjs` worker 升级为：无静态文件的 watch 页在边缘**按需服务端渲染**完整 HTML（唯一 title/description/canonical/OG/VideoObject JSON-LD + 静态正文 + 内链），配合边缘缓存。静态预渲染 500 页仍是最快路径，行为不变。

## 核心发现（复用点）

- `dist/data/feed-details-NNNN.json`（`scripts/generate-feed-details.mjs`）：64 桶 `id % 64`，~1MB/桶，每片含渲染所需全部字段（title/description/genreIds/cover/poster/trailer/duration/directors/cast/runtimeMinutes/createdAt…），仅覆盖 playable 非 adult 电影（92,301 部）
- `scripts/generate-watch-index.mjs`：已把 `edge/watch-status.mjs` 模板中的 `__MOVIE_INDEX_CONFIG__` 替换为 digest 配置生成 `dist/_worker.js` + `_routes.json`；`seo-data/movie-ids-NNNN.json`（64 桶纯 ID 数组 + SHA-256 校验）也由它生成
- `scripts/generate-movie-pages.mjs`：预渲染模板逻辑（title/meta/canonical/OG/JSON-LD 替换 `dist/index.html`）
- 双构建链都要挂钩：`package.json` build 链 + `incremental/build.mjs:25`（两者都调用 `generateWatchIndex`）
- 测试模式：`tests/movie-pages.test.mjs` 的 node:test + mkdtemp fixture + 正则断言

## 实施步骤

### 1. 抽取共享渲染模块 `src/movie-page-html.mjs`
从 `generate-movie-pages.mjs` 提取纯函数 `renderMoviePage({templateHtml, movie, genres, origin})` → html（worker 安全：无 Node API，`src/youtube-link.js` 已是纯函数）。`generate-movie-pages.mjs` 改为调用它（现有输出逐字节不变，现有测试保证）。新增 genre 内链（"More {Genre} trailers" → `/browse?…`，纯 genre 数据即可覆盖全部电影，similar-movies 数据只覆盖 3% 不采用）。

### 2. 生成轻量渲染分片（`generate-watch-index.mjs` 扩展）
- 从 feed-details 生成 `seo-data/render-NNNN.json`：**256 桶**（`id % 256`，~150-260KB/桶，JSON.parse 1-3ms，避开 worker CPU 限制），只保留渲染所需字段
- worker 配置从 `{digests}` 扩展为 `{digests, renderDigests(256), prerenderedIds(当前 dist/watch 的 500 个), genres, renderVersion(数据快照 hash)}`
- 保持现有 SHA-256 fails-closed 校验模式

### 3. worker SSR（`edge/watch-status.mjs`）
`/watch/:id` 新流程：ID 校验 → movie-ids 存在性校验（不变）→ ① id ∈ prerenderedIds：走静态资源（不变）；② 在 render 分片中：按需渲染（index.html 模板经 ASSETS 取一次并按 isolate 记忆化）→ 响应带 `cache-control: public, max-age=3600`，`ctx.waitUntil(caches.default.put(...))`，**缓存键含 renderVersion**（部署即换版本，天然失效）；③ 在目录但不在 feed（无 playable trailer 的少量 ID）：返回 SPA 壳并注入 `<meta name="robots" content="noindex">`（消除 soft-duplicate）。404/503 路径不变。需要给 fetch handler 加 `ctx` 参数。

### 4. 预渲染 /categories /playlists /about（新 `scripts/generate-static-pages.mjs`）
沿用 `generate-home-page.mjs` 的 index.html 替换模式：唯一 title/description/canonical + 静态链接内容（categories=genres 链接、playlists=curated playlists 链接）。挂入两条构建链。`/` 已由 home-prerender 覆盖，不动。

### 5. 视频 sitemap（`generate-sitemap.mjs`）
为全部 playable 电影加 `video:video` 扩展（title、thumbnail=`https://i.ytimg.com/vi/{trailer}/hqdefault.jpg`、embed URL、duration；uploadDate 仅 500 pilot 有 snippet，可选不加）。`maxUrls` 从 45000 降到 20000 保证单文件 <10MB。

### 6. Loading title 修复（`src/App.jsx:102`）
`video?.title` 未就绪时保留路由默认 title，不再设 `Loading… - TrailerTube`。

### 7. 测试（node:test，沿用现有模式）
- `src/movie-page-html.mjs` 单测（fixture 电影 → 断言 canonical/JSON-LD/genre 链接）
- generate-watch-index 新输出测试（render 分片桶数/字段/digest/prerenderedIds）
- worker handler 测试：mock `env.ASSETS`，覆盖三条路径（静态命中 / SSR 渲染 / noindex 壳）+ 404 + digest 失败 503
- 视频 sitemap 断言

### 8. 验证与部署
1. `npm test` 全绿
2. `npm run build`，检查 dist 产物（render 分片、_worker.js 配置、sitemap）
3. `npx wrangler pages dev` 本地冒烟：非预渲染 `/watch/5492` 返回唯一 title+canonical+JSON-LD；预渲染页不变；二次请求命中缓存
4. 部署走现有 `node incremental/run.mjs --publish`（preview → verifyDeployment → production，已内建验证）。**不直接 `wrangler pages deploy dist`**（会用旧数据覆盖线上增量管线数据，见既有约定）

## 明确不做（后续迭代）
- `/person/*` 页 SSR（不在 sitemap，量小）
- similar-movies 进渲染 HTML（数据只覆盖 3%）
- 外链建设、GA4 关键事件配置（运营侧）
