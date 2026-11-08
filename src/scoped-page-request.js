/** Apply a pagination response only while it still belongs to the active query. */
export async function scopedPageRequest({load,isCurrent,onResult,onError,onFinish}) {
  try {
    const result=await load();
    if(isCurrent()) onResult(result);
  } catch(error) {
    if(isCurrent()) onError(error);
  } finally {
    if(isCurrent()) onFinish();
  }
}

/** A failed page must wait for an explicit retry instead of looping on scroll. */
export function canAutoLoadPage({hasButton,loading,error,page,pages}) {
  return Boolean(hasButton && !loading && !error && page < pages);
}
