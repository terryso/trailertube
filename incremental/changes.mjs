import {changeWindows} from './plan.mjs';

// Fetch every page before returning. A partial list must not advance a cursor.
export async function fetchChangedMovies({lastSuccessfulDate, today, request, overlapDays=2}) {
  if (typeof request !== 'function') throw new Error('request is required');
  const windows = changeWindows({lastSuccessfulDate, today, overlapDays, maxDays:14});
  const ids = new Set();
  async function split(window,reason) {
    const start=Date.parse(window.start+'T00:00:00Z'),end=Date.parse(window.end+'T00:00:00Z');
    if(start===end)throw new Error(reason);
    const middle=start+Math.floor((end-start)/86_400_000/2)*86_400_000;
    await collect({start:window.start,end:new Date(middle).toISOString().slice(0,10)});
    await collect({start:new Date(middle+86_400_000).toISOString().slice(0,10),end:window.end});
  }
  async function collect(window) {
    const first=await request('/movie/changes',{start_date:window.start,end_date:window.end,page:1});
    if (Number.isInteger(first?.total_pages) && first.total_pages>500) {
      await split(window,`TMDB change list exceeds pagination limit for ${window.start}`);
      return;
    }
    let pages=1, expected=0;const windowIds=new Set();
    for (let page=1;page<=pages;page++) {
      const data=page===1?first:await request('/movie/changes',{start_date:window.start,end_date:window.end,page});
      if (!Array.isArray(data?.results) || !Number.isInteger(data.total_pages) || data.total_pages<0 || data.total_pages>500 || !Number.isInteger(data.total_results) || data.total_results<0) throw new Error('Invalid or truncated TMDB change list');
      if (data.page!==page) throw new Error(`TMDB change list returned incorrect page for ${window.start}..${window.end}`);
      // Some TMDB edge responses serve stale totals on individual pages. Read
      // the largest reported page range and require its full distinct count.
      // Inconsistent snapshots that cannot meet it still fail closed.
      pages=Math.max(pages,data.total_pages);expected=Math.max(expected,data.total_results);
      for (const item of data.results) {
        if (!Number.isSafeInteger(item?.id) || item.id<=0) throw new Error('Invalid TMDB movie ID');
        ids.add(item.id);windowIds.add(item.id);
      }
    }
    if (windowIds.size<expected) await split(window,`TMDB change list omitted or repeated records for ${window.start}..${window.end}: expected ${expected}, received ${windowIds.size} distinct IDs`);
  }
  for (const window of windows) await collect(window);
  return {ids:[...ids], windows, nextCursor:today};
}
