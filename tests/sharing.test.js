import {expect,it,vi,afterEach} from 'vitest';
import {safeReturnTo,shareLink,whatsappLink} from '../src/lib/sharing';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('returns sign-in visitors to their exact collection and rejects external redirects',()=>{
  expect(safeReturnTo('/collections/park-123')).toBe('/collections/park-123');
  expect(safeReturnTo('/photos/p-123')).toBe('/photos/p-123');
  for(const path of ['https://evil.test','//evil.test','/\\evil.test','/login?next=/photos/p',null])expect(safeReturnTo(path)).toBe('/');
});
it('encodes WhatsApp collection and individual image links without changing access',()=>{
  vi.stubGlobal('window',{location:{origin:'https://vault.test'}});
  expect(shareLink('/photos/p-1')).toBe('https://vault.test/photos/p-1');
  const url=new URL(whatsappLink('/collections/park-123','Park & family'));
  expect(url.origin).toBe('https://wa.me');expect(url.searchParams.get('text')).toContain('https://vault.test/collections/park-123');
  expect(url.searchParams.get('text')).toContain('Park & family');expect(url.searchParams.get('text')).toContain('Sign in');
});
it('keeps preview photo detail/tag responses compatible with the viewer',async()=>{
  vi.stubEnv('VITE_UI_PREVIEW','1');
  const {request,clearRequestCache}=await import('../src/lib/api');clearRequestCache();
  const [tagged,detail,library]=await Promise.all([request('/api/photos/memory-1/people'),request('/api/photos/memory-1'),request('/api/photos?limit=100')]);
  expect(Array.isArray(tagged.people)).toBe(true);expect(detail.photo.id).toBe('memory-1');expect(library.total).toBe(library.photos.length);
  clearRequestCache();
});
