export const categoryView = categories => categories;
export const categoryLabel = (id, fallback, categories) => categories.find(c=>c.id===String(id))?.name || fallback || '';
export const videoOwner = (video, categories) => video.uploader || categoryLabel(video.categoryId,video.category,categories) || 'Movie trailer';
export const categoryHref = id => id == null || String(id) === '' ? null : '/browse?category='+encodeURIComponent(String(id));
