const compact=new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1});
export function formatViews(value){
 if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<0))return '';
 if(typeof value!=='number'&&!(typeof value==='string'&&/^\d+$/.test(value)))return '';
 try{return `${compact.format(BigInt(value))} views`}catch{return ''}
}
