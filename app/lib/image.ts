export type OutputFormat = "image/png" | "image/jpeg" | "image/webp" | "image/bmp" | "image/tiff";
export type PreparedImage = { blob: Blob; filename: string };

export function isHeicFile(file: File) {
  return /\.(heic|heif)$/i.test(file.name) || /image\/(heic|heif|heic-sequence|heif-sequence)/i.test(file.type);
}

export function isBmpFile(file: File) {
  return /\.bmp$/i.test(file.name) || /image\/(bmp|x-bmp|x-ms-bmp)/i.test(file.type);
}

export function isTiffFile(file: File) {
  return /\.(tif|tiff)$/i.test(file.name) || /image\/tiff/i.test(file.type);
}

export function isRawFile(file: File) {
  return /\.(3fr|arw|cr2|cr3|dcr|dng|erf|fff|gpr|iiq|k25|kdc|mef|mos|mrw|nef|nrw|orf|pef|raf|raw|rw2|rwl|sr2|srf|srw|x3f)$/i.test(file.name);
}

function isBrowserImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(apng|avif|gif|jpe?g|jfif|png|webp)$/i.test(file.name);
}

export function needsDecodedPreview(file: File) {
  return isHeicFile(file) || isBmpFile(file) || isTiffFile(file) || isRawFile(file);
}

export function inputFormatLabel(file: File) {
  if (isHeicFile(file)) return "HEIC";
  if (isBmpFile(file)) return "BMP";
  if (isTiffFile(file)) return "TIFF";
  if (isRawFile(file)) return "camera RAW";
  return "image";
}

function pixelsToBitmap(width: number, height: number, source: ArrayLike<number>, channels: number, maxValue = 255) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const scale = maxValue > 0 ? 255 / maxValue : 1;
  for (let pixel = 0; pixel < width * height; pixel++) {
    const sourceOffset = pixel * channels;
    const targetOffset = pixel * 4;
    if (channels === 1 || channels === 2) {
      const grey = Math.round(Number(source[sourceOffset]) * scale);
      rgba[targetOffset] = grey;
      rgba[targetOffset + 1] = grey;
      rgba[targetOffset + 2] = grey;
      rgba[targetOffset + 3] = channels === 2 ? Math.round(Number(source[sourceOffset + 1]) * scale) : 255;
    } else {
      rgba[targetOffset] = Math.round(Number(source[sourceOffset]) * scale);
      rgba[targetOffset + 1] = Math.round(Number(source[sourceOffset + 1]) * scale);
      rgba[targetOffset + 2] = Math.round(Number(source[sourceOffset + 2]) * scale);
      rgba[targetOffset + 3] = channels >= 4 ? Math.round(Number(source[sourceOffset + 3]) * scale) : 255;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  context.putImageData(new ImageData(rgba, width, height), 0, 0);
  return createImageBitmap(canvas);
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

  if (isBmpFile(file)) {
    try {
      const { decode } = await import("@nktkas/bmp");
      const decoded = decode(new Uint8Array(await file.arrayBuffer()));
      return await pixelsToBitmap(decoded.width, decoded.height, decoded.data, decoded.channels);
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : "";
      throw new Error(`This BMP image could not be decoded.${detail}`);
    }
  }

  if (isTiffFile(file)) {
    try {
      const { decode } = await import("tiff");
      const page = decode(await file.arrayBuffer(), { pages: [0] })[0];
      if (!page) throw new Error("No TIFF page");
      const channels = page.samplesPerPixel || page.components + (page.alpha ? 1 : 0);
      const maxValue = page.data instanceof Uint8Array ? 255 : page.data instanceof Uint16Array ? 65535 : 1;
      return await pixelsToBitmap(page.width, page.height, page.data, channels, maxValue);
    } catch {
      throw new Error("This TIFF image could not be decoded. Try an 8-bit or 16-bit RGB TIFF.");
    }
  }

  if (isRawFile(file)) {
    const { default: LibRaw } = await import("libraw-wasm");
    const decoder = new LibRaw();
    try {
      await decoder.open(new Uint8Array(await file.arrayBuffer()), {
        useCameraWb: true,
        useCameraMatrix: 1,
        outputColor: 1,
        outputBps: 8,
        userQual: 3,
      });
      const decoded = await decoder.imageData();
      if (!decoded) throw new Error("No decoded pixels");
      const maxValue = decoded.bits === 16 ? 65535 : 255;
      return await pixelsToBitmap(decoded.width, decoded.height, decoded.data, decoded.colors, maxValue);
    } catch {
      throw new Error("This camera RAW file could not be developed. Its camera or compression may be unsupported.");
    } finally {
      decoder.dispose();
    }
  }

  if (!isBrowserImageFile(file)) {
    throw new Error("Please choose a supported image or camera RAW file.");
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
      throw new Error("This image could not be read. Please use a supported image format.");
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

export async function encodeCanvas(canvas: HTMLCanvasElement, type: OutputFormat, quality = 0.9): Promise<Blob> {
  if (type !== "image/bmp" && type !== "image/tiff") return canvasToBlob(canvas, type, quality);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const rgba = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);

  if (type === "image/bmp") {
    const { encode } = await import("@nktkas/bmp");
    const bytes = encode({ width: canvas.width, height: canvas.height, channels: 4, data: rgba }, {
      bitsPerPixel: 32,
      compression: 6,
      headerType: "BITMAPV5HEADER",
    });
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return new Blob([buffer], { type });
  }

  const { default: UTIF } = await import("utif.ts");
  return new Blob([UTIF.encodeImage(rgba, canvas.width, canvas.height)], { type });
}

export function extensionFor(type: OutputFormat) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/tiff") return "tiff";
  return type.split("/")[1];
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function shareFile({ blob, filename }: PreparedImage) {
  return new File([blob], filename, { type: blob.type, lastModified: Date.now() });
}

export function canUseNativeFileShare(result: PreparedImage) {
  if (typeof window === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  const touchDevice = navigator.maxTouchPoints > 0 && window.matchMedia("(pointer: coarse)").matches;
  return touchDevice && navigator.canShare({ files: [shareFile(result)] });
}

export async function shareImage(result: PreparedImage) {
  const file = shareFile(result);
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function" || !navigator.canShare({ files: [file] })) {
    throw new Error("This browser cannot share the selected image format.");
  }
  await navigator.share({ files: [file], title: result.filename });
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
