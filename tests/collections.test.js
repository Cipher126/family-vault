// @vitest-environment jsdom
import React from 'react';
import {MemoryRouter} from 'react-router-dom';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import Collections from '../src/components/Collections';
import {cachedRequest,peekRequestCache} from '../src/lib/api';
import {copyShareLink} from '../src/lib/sharing';
vi.mock('../src/lib/api',async original=>({...await original(),cachedRequest:vi.fn(),peekRequestCache:vi.fn()}));
vi.mock('../src/lib/sharing',async original=>({...await original(),copyShareLink:vi.fn()}));
beforeEach(()=>{
  vi.stubGlobal('React',React);vi.mocked(peekRequestCache).mockReturnValue(undefined);
  vi.mocked(cachedRequest).mockResolvedValue({collections:[{id:'saved-family-collection',title:'Old family outing',uploader:'Auntie',photo_count:5,visibility:'family',thumbnail_photo_id:null}],nextCursor:null});
  vi.mocked(copyShareLink).mockResolvedValue(undefined);
});
afterEach(()=>{cleanup();vi.resetAllMocks();vi.unstubAllGlobals();});
it('lets a member return later and share the same saved collection link again',async()=>{
  const show=()=>render(React.createElement(MemoryRouter,null,React.createElement(Collections)));
  const first=show();await screen.findByRole('heading',{name:'Old family outing'});
  expect(screen.getByRole('link',{name:'WhatsApp'}).getAttribute('href')).toContain(encodeURIComponent('/collections/saved-family-collection'));
  fireEvent.click(screen.getByRole('button',{name:'Copy link'}));await screen.findByRole('button',{name:'Link copied'});first.unmount();
  show();await screen.findByRole('heading',{name:'Old family outing'});fireEvent.click(screen.getByRole('button',{name:'Copy link'}));await screen.findByRole('button',{name:'Link copied'});
  expect(copyShareLink).toHaveBeenCalledTimes(2);expect(copyShareLink).toHaveBeenLastCalledWith('/collections/saved-family-collection');
});
