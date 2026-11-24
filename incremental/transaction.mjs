// Adapters isolate filesystem and network writes. A cursor is durable only after
// the published deployment has been independently checked.
export async function runTransaction({cursor,today,fetchChanges,fetchUpdates,stage,audit,deploy,verify,commit,prepare=async()=>{}}) {
  for(const [name,fn] of Object.entries({fetchChanges,fetchUpdates,stage,audit,deploy,verify,commit}))if(typeof fn!=='function')throw new Error(`Missing ${name} adapter`);
  const changes=await fetchChanges({lastSuccessfulDate:cursor,today});
  if(!changes||changes.nextCursor!==today||!Array.isArray(changes.ids))throw new Error('Incomplete change batch');
  const updates=await fetchUpdates(changes.ids);
  if(!Array.isArray(updates)||updates.length!==changes.ids.length)throw new Error('Incomplete movie updates');
  const ids=new Set(changes.ids.map(String));for(const update of updates){const id=String(update?.id);if(!ids.delete(id))throw new Error('Unexpected or duplicate update');}if(ids.size)throw new Error('Missing movie update');
  const deferredIds=updates.filter(update=>update.deferred===true).map(update=>String(update.id));
  const artifact=await stage(updates,changes.pendingGaps||[]);if(!artifact)throw new Error('Missing staged snapshot');
  await audit(artifact);
  await prepare({cursor:changes.nextCursor,artifact,deferredIds,pendingGaps:changes.pendingGaps||[]});
  const deployment=await deploy(artifact);if(!deployment)throw new Error('Missing deployment receipt');
  await verify(deployment,artifact);
  await commit({cursor:changes.nextCursor,artifact,deployment,deferredIds,pendingGaps:changes.pendingGaps||[]});
  return {cursor:changes.nextCursor,changed:changes.ids.length,deferred:deferredIds.length,pendingGaps:(changes.pendingGaps||[]).length,deployment};
}
