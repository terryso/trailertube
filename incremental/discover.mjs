// Discover release-date boundary movies separately: a movie can enter the
// rolling window without itself being changed on that day.
export async function discoverReleases({from,to,request}) {
 const start=Date.parse(`${from}T00:00:00Z`),end=Date.parse(`${to}T00:00:00Z`);
 const valid=(s,n)=>/^\d{4}-\d\d-\d\d$/.test(s)&&Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===s;
 if(!valid(from,start)||!valid(to,end)||start>end||typeof request!=='function')throw new Error('Invalid discovery range');
 const ids=new Set();for(let day=start;day<=end;day+=86_400_000){const date=new Date(day).toISOString().slice(0,10),seen=new Set();let total=0;
  for(const sort of ['popularity.desc','popularity.asc','vote_count.desc']){let pages=1;
   for(let page=1;page<=pages;page++){const j=await request('/discover/movie',{'primary_release_date.gte':date,'primary_release_date.lte':date,include_adult:'true',include_video:'false',language:'en-US',sort_by:sort,page});
    if(!Array.isArray(j?.results)||!Number.isInteger(j.total_pages)||j.total_pages<0||j.total_pages>500||!Number.isInteger(j.total_results)||j.total_results<0||j.page!==page)throw new Error(`Invalid discovery response for ${date}`);
    total=Math.max(total,j.total_results);pages=Math.max(pages,j.total_pages);
    for(const row of j.results){if(!Number.isSafeInteger(row?.id)||row.id<1)throw new Error(`Invalid movie ID for ${date}`);seen.add(row.id);ids.add(row.id)}
   }
   if(seen.size>=total)break;
  }
  if(seen.size<total)throw new Error(`Incomplete discovery for ${date}: ${seen.size}/${total}`);
 }
 return [...ids];
}
