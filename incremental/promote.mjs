// Promote an already audited rehearsal without re-fetching its entire change
// batch. Each check is required and may reject; a cursor never moves early.
export async function promoteCandidate({audit,baseline,guard,verifyPreview,recordIntent,deployMain,verifyMain,verifyAlias,commit}) {
 for(const [name,fn] of Object.entries({audit,baseline,guard,verifyPreview,recordIntent,deployMain,verifyMain,verifyAlias,commit}))if(typeof fn!=='function')throw new Error(`Missing ${name} adapter`);
 await audit();await baseline();await verifyPreview();await guard();await baseline();
 await recordIntent();const deployment=await deployMain();if(!deployment?.url)throw new Error('Missing production receipt');
 await verifyMain(deployment);await verifyAlias();await commit(deployment);return deployment;
}
