// @vitest-environment jsdom
import React from 'react';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import Files from '../src/components/Files';
import {cachedRequest,request,post} from '../src/lib/api';
import {copyShareLink} from '../src/lib/sharing';
vi.mock('../src/lib/api',async original=>({...await original(),cachedRequest:vi.fn(),peekRequestCache:vi.fn(),request:vi.fn(),post:vi.fn()}));
vi.mock('../src/lib/sharing',async original=>({...await original(),copyShareLink:vi.fn()}));
const user={id:'a',role:'admin'},file={id:'shared-document-001',name:'Family reunion.pdf',size:12000,owner_id:'a',uploader:'Uncle',folder_id:null},folder={id:'protected-folder',name:'Documents',owner_id:'b',protected:true,locked:true};
const page=(files=[file],folder=null)=>({files,folder,total:files.length,nextCursor:null});
const show=(path='/files')=>render(React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(Routes,null,React.createElement(Route,{path:'/files',element:React.createElement(Files,{user})}),React.createElement(Route,{path:'/files/:fileId',element:React.createElement(Files,{user})}))));
beforeEach(()=>{vi.stubGlobal('React',React);vi.mocked(cachedRequest).mockImplementation(async path=>path==='/api/file-folders'?{folders:[folder],nextCursor:null}:page());vi.mocked(copyShareLink).mockResolvedValue();});
afterEach(()=>{cleanup();vi.resetAllMocks();vi.unstubAllGlobals();});
it('offers download, copy, WhatsApp, and confirmed deletion inside the compact action menu',async()=>{
  show();await screen.findByText(file.name);expect(screen.queryByText('Delete file')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:`Actions for ${file.name}`}));
  expect(screen.getByRole('link',{name:'Download'}).getAttribute('href')).toBe(`/api/files/${file.id}/download`);
  expect(screen.getByRole('link',{name:'Send on WhatsApp'}).getAttribute('href')).toContain(encodeURIComponent(`/files/${file.id}`));
  fireEvent.click(screen.getByRole('button',{name:'Copy link'}));await screen.findByText('Link copied');expect(copyShareLink).toHaveBeenCalledWith(`/files/${file.id}`);
  fireEvent.click(screen.getByRole('button',{name:'Delete file'}));expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Keep file'}));expect(request).not.toHaveBeenCalled();
});
it('unlocks a direct file link without exposing a download before success',async()=>{
  vi.mocked(request).mockResolvedValueOnce({file:null,folder}).mockResolvedValueOnce({file,folder:{...folder,locked:false}});
  vi.mocked(post).mockResolvedValue({ok:true});show(`/files/${file.id}`);
  await screen.findByRole('heading',{name:'Unlock Documents'});expect(screen.queryByRole('link',{name:'Download file'})).toBeNull();
  fireEvent.change(screen.getByLabelText('Folder password'),{target:{value:'FolderPassword1'}});
  fireEvent.click(screen.getByRole('button',{name:'Unlock folder'}));await screen.findByRole('link',{name:'Download file'});
  expect(post).toHaveBeenCalledWith('/api/file-folders/protected-folder/unlock',{password:'FolderPassword1'});
});
it('creates a password protected folder and uploads into the opened folder',async()=>{
  vi.mocked(request).mockResolvedValue({ok:true});show();await screen.findByText(file.name);
  fireEvent.click(screen.getByRole('button',{name:'New folder'}));fireEvent.change(screen.getByLabelText('Folder name'),{target:{value:'Travel'}});
  fireEvent.click(screen.getByLabelText('Password protect this folder'));fireEvent.change(screen.getByLabelText('Folder password'),{target:{value:'TravelPassword1'}});
  fireEvent.click(screen.getByRole('button',{name:'Create folder'}));await waitFor(()=>expect(request).toHaveBeenCalledWith('/api/file-folders',{method:'POST',body:JSON.stringify({name:'Travel',password:'TravelPassword1'})}));
  cleanup();vi.mocked(request).mockImplementation(async(path,init)=>init?.method ? {ok:true} : page([],{...folder,locked:false}));vi.mocked(post).mockResolvedValue({ready:false,uploadPath:'/api/files/new-document/content'});
  show('/files?folder=protected-folder');await screen.findByRole('heading',{name:'Documents'});fireEvent.click(screen.getByRole('button',{name:'Upload files'}));
  fireEvent.change(screen.getByLabelText('Choose files'),{target:{files:[new File(['hello'],'Notes.txt',{type:'text/plain'})]}});
  fireEvent.click(screen.getByRole('button',{name:'Upload 1 file'}));await screen.findByRole('heading',{name:'Files uploaded'});
  expect(post).toHaveBeenLastCalledWith('/api/files',expect.objectContaining({name:'Notes.txt',folderId:'protected-folder',size:5}));
  expect(request).toHaveBeenLastCalledWith('/api/files/new-document/content',expect.objectContaining({method:'PUT',body:expect.any(File)}));
});
