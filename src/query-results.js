const EMPTY_RESULTS=Object.freeze([]);

export function queryKey({account='',query='',category='',sort='',date='',duration='',availability=''}){
  return JSON.stringify([account,query,category,sort,date,duration,availability]);
}

/** Results must never be displayed under a different query's heading. */
export function currentResults(loadedKey,currentKey,videos){
  return loadedKey===currentKey?videos:EMPTY_RESULTS;
}
