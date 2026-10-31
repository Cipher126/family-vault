export function photoAccessPredicate(photo="p",id="?",role="?"):string {
  return `(${photo}.owner_id=${id} OR ${role}='admin' OR NOT EXISTS (SELECT 1 FROM album_photos access_ap JOIN albums access_a ON access_a.id=access_ap.album_id WHERE access_ap.photo_id=${photo}.id AND access_a.owner_id=${photo}.owner_id) OR EXISTS (SELECT 1 FROM album_photos access_ap JOIN albums access_a ON access_a.id=access_ap.album_id WHERE access_ap.photo_id=${photo}.id AND access_a.visibility='family'))`;
}
