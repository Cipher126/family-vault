export interface PreparedPhoto {
  original: File;
  gallery: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
  hash: string;
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error(`${file.name}: unsupported file type.`);
  const image = await createImageBitmap(file, { imageOrientation: "from-image" });
  const width = image.width;
  const height = image.height;
  const gallery = await resize(image, 2200, 0.86);
  const thumbnail = await resize(image, 560, 0.78);
  image.close();
  // Web Crypto is unavailable on plain-HTTP LAN addresses in mobile browsers.
  // Hashing only powers duplicate detection, so uploads can safely continue
  // without it while local development is being viewed from another device.
  let hash = "";
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return { original: file, gallery, thumbnail, width, height, hash };
}

async function resize(image: ImageBitmap, maxEdge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Your browser cannot prepare this photo.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Photo conversion failed.")), "image/webp", quality));
}
