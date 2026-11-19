// Both photo and file reservations use this expression in their atomic INSERT.
// Unfinished reservations count against the same family quota until cleanup.
export const reservedStorageSql = `COALESCE((SELECT SUM(CASE WHEN status='ready' THEN original_bytes+gallery_bytes+thumbnail_bytes+small_bytes
  WHEN status='pending' THEN expected_original_bytes+expected_gallery_bytes+expected_thumbnail_bytes+expected_small_bytes ELSE 0 END) FROM photos),0)
  + COALESCE((SELECT SUM(size) FROM shared_files),0)`;
