export function safeReturnTo(value:string|null):string {
  if(!value || !value.startsWith('/') || value.startsWith('//') || /[\\\s\u0000-\u001f]/.test(value))return '/';
  const url=new URL(value,'https://family.invalid');
  if(url.origin!=='https://family.invalid' || /^\/(login|register|recover|setup)(\/|$)/.test(url.pathname))return '/';
  return url.pathname+url.search+url.hash;
}
export function shareLink(path:string):string {return new URL(path,window.location.origin).href;}
export function whatsappLink(path:string,title:string):string {
  return `https://wa.me/?text=${encodeURIComponent(`${title}\n${shareLink(path)}\nSign in to Family Vault to view.`)}`;
}
export async function copyShareLink(path:string):Promise<void> {
  const link=shareLink(path);
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(link);return;}
  const field=document.createElement('textarea');field.value=link;field.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;font-size:16px;opacity:0';
  document.body.append(field);field.focus();field.select();field.setSelectionRange(0,link.length);
  try{if(!document.execCommand('copy'))throw new Error('Unable to copy. Open this collection and copy its address.');}finally{field.remove();}
}
export function newBatchId():string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
