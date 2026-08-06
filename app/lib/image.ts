export type OutputFormat = "image/png" | "image/jpeg" | "image/webp";

export function isHeicFile(file: File) {
  return /\.(heic|heif)$/i.test(file.name) || /image\/(heic|heif|heic-sequence|heif-sequence)/i.test(file.type);
}

export async function loadBitmap(file: File): Promise<ImageBitmap> {
  if (isHeicFile(file)) {
    try {
      const { heicTo } = await import("heic-to/csp");
      return await heicTo({ blob: file, type: "bitmap" });
    } catch {
      throw new Error("This HEIC image could not be decoded. It may use an unsupported codec.");
    }
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose a PNG, JPEG, WebP, HEIC or HEIF image.");
  }

  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return await createImageBitmap(image);
    } catch {
      throw new Error("This image could not be read. Please use PNG, JPEG, WebP, HEIC or HEIF.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: OutputFormat, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("This browser could not encode the selected format.")), type, quality);
  });
}

export function extensionFor(type: OutputFormat) {
  return type === "image/jpeg" ? "jpg" : type.split("/")[1];
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function replaceExtension(name: string, suffix: string, type: OutputFormat) {
  const base = name.replace(/\.[^/.]+$/, "");
  return `${base}${suffix}.${extensionFor(type)}`;
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function containSize(width: number, height: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
