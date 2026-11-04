const DAY = 86_400_000;

// A missing or malformed timestamp must cause a refresh, never permanent caching.
function due(timestamp, now, intervalDays) {
  const time = Date.parse(timestamp || '');
  return !Number.isFinite(time) || time > now || now - time >= intervalDays * DAY;
}

/** Return independent work queues for ordinary and adult catalogs. */
export function planRefresh({ movies, records, videos, now = Date.now(), noTrailerDays = 7, trailerDays = 30, videoDays = 7 }) {
  if (!Number.isFinite(now) || [noTrailerDays, trailerDays, videoDays].some(n => !Number.isFinite(n) || n <= 0)) throw new Error('Invalid refresh interval');
  const result = { ordinary: [], adult: [], videoIds: [] };
  const ids = new Set(), videoIds = new Set();
  for (const movie of movies) {
    const id = String(movie.id);
    if (!/^\d+$/.test(id)) throw new Error('Invalid movie ID');
    if (ids.has(id)) throw new Error(`Duplicate movie ID: ${id}`);
    ids.add(id);
    const record = records.get(id);
    const age = record?.trailer ? trailerDays : noTrailerDays;
    if (!record || due(record.checkedAt, now, age)) result[movie.adult === true ? 'adult' : 'ordinary'].push(id);
    if (record?.trailer && due(videos.get(record.trailer)?.checkedAt, now, videoDays)) videoIds.add(record.trailer);
  }
  result.videoIds = [...videoIds];
  return result;
}

/** Inclusive UTC date windows, with overlap for interrupted runs and late changes. */
export function changeWindows({ lastSuccessfulDate, today, overlapDays = 2, maxDays = 14 }) {
  const parse = s => { const n = Date.parse(`${s}T00:00:00Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(n) || new Date(n).toISOString().slice(0,10) !== s) throw new Error('Invalid date'); return n; };
  if (!Number.isInteger(overlapDays) || overlapDays < 0 || !Number.isInteger(maxDays) || maxDays < 1) throw new Error('Invalid window');
  let start = parse(lastSuccessfulDate) - overlapDays * DAY; const end = parse(today);
  if (start > end) throw new Error('Last successful date is in the future');
  const windows = []; while (start <= end) { const until = Math.min(end, start + (maxDays - 1) * DAY); windows.push({ start: new Date(start).toISOString().slice(0,10), end: new Date(until).toISOString().slice(0,10) }); start = until + DAY; } return windows;
}
