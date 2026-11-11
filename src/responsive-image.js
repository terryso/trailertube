// TMDB serves fixed image widths; cards and rails render far smaller than the
// w500/w780 URLs stored in the catalog, so rewrite the width segment into a
// srcset and let the browser pick by sizes. Non-TMDB URLs (YouTube thumbs)
// return '' and keep the plain src.
const pattern=/^(https:\/\/image\.tmdb\.org\/t\/p\/)w\d+(\/[A-Za-z0-9_-]+\.(?:jpg|png|webp))$/;
function srcSet(url,widths){
 if(typeof url!=='string')return '';
 const match=pattern.exec(url);
 if(!match)return '';
 return [...new Set(widths)].map(width=>`${match[1]}w${width}${match[2]} ${width}w`).join(', ');
}
// Thumbnails never render wider than ~380px, so w780 already covers DPR2.
export const imageSrcSet=url=>srcSet(url,[185,342,500,780]);
// Phones at high DPR scale 100vw past w780 and would otherwise jump to a
// much heavier w1280 master, so the hero list stops at w780.
export const heroSrcSet=url=>srcSet(url,[500,780]);
export const posterSizes='(max-width:800px) 145px, 205px';
export const genreTileSizes='(max-width:800px) 150px, 200px';
export const wideCardSizes='(max-width:800px) calc(100vw - 32px), 380px';
export const heroSizes='(max-width:800px) 100vw, calc(100vw - 240px)';
