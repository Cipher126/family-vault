// Keep the camera's calendar date: EXIF dates often have no timezone.
export function captureDate(metadata: Record<string, unknown> | undefined): string | null {
  for (const key of ["DateTimeOriginal", "CreateDate", "DateCreated"]) {
    const value = metadata?.[key];
    const text = value instanceof Date && Number.isFinite(value.getTime())
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
      : typeof value === "string" ? value.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3").slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) continue;
    const parsed = new Date(`${text}T12:00:00Z`);
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text) return text;
  }
  return null;
}

export async function readCaptureDate(file: Blob | ArrayBuffer): Promise<string | null> {
  try {
    const {default:exifr} = await import("exifr");
    return captureDate(await exifr.parse(file instanceof ArrayBuffer ? file : await file.arrayBuffer(), {
      pick: ["DateTimeOriginal", "CreateDate", "DateCreated"], reviveValues: false,
    }));
  } catch { return null; } // Missing/damaged metadata must not prevent an upload.
}
