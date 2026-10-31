// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PhotoSelectionActions from "../src/components/PhotoSelectionActions";

afterEach(cleanup);
function show() {
  const onAlbum = vi.fn(); const onDelete = vi.fn();
  render(createElement(PhotoSelectionActions, { count:2,allSelected:false,albums:[{id:"album",name:"Graduation",description:"",visibility:"family",photo_count:0}],busy:false,message:"",canEdit:true,deletableCount:2,onSelectAll:vi.fn(),onAlbum,onMemory:vi.fn(),onEdit:vi.fn(),onDelete,onClose:vi.fn() }));
  return { onAlbum,onDelete };
}
it("keeps actions hidden until requested and dismisses on outside click", () => {
  show(); expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Selection actions"}));
  expect(screen.getByRole("menuitem",{name:"Add to album"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Dismiss selection actions"}));
  expect(screen.queryByRole("menu")).toBeNull();
});
it("chooses an album inside the menu and closes after selection", () => {
  const { onAlbum,onDelete } = show();
  fireEvent.click(screen.getByRole("button",{name:"Selection actions"}));
  fireEvent.click(screen.getByRole("menuitem",{name:"Add to album"}));
  fireEvent.click(screen.getByRole("menuitem",{name:"Graduation"}));
  expect(onAlbum).toHaveBeenCalledWith("album");
  expect(onDelete).not.toHaveBeenCalled(); expect(screen.queryByRole("menu")).toBeNull();
});
