/// <reference lib="webworker" />

import type { DetectionResult, ProcessResult, ProcessSettings, ScanCorners, ScanPoint } from "../lib/scan-types";

type Cv = typeof import("@techstark/opencv-js");

type DetectRequest = { id: number; operation: "detect"; image: ImageData };
type ProcessRequest = { id: number; operation: "process"; image: ImageData; settings: ProcessSettings; maxLongEdge: number };
type WorkerRequest = DetectRequest | ProcessRequest;

let cvPromise: Promise<Cv> | null = null;

async function getCv(): Promise<Cv> {
  if (!cvPromise) {
    importScripts("/toolbox/vendor/opencv.js");
    cvPromise = Promise.resolve((self as unknown as { cv?: Cv | Promise<Cv> }).cv).then(async (module) => {
      if (!module) throw new Error("OpenCV could not be loaded.");
      const candidate = await Promise.resolve(module);
      if (candidate.Mat) return candidate;
      await new Promise<void>((resolve) => { (candidate as Cv & { onRuntimeInitialized?: () => void }).onRuntimeInitialized = resolve; });
      return candidate;
    });
  }
  return cvPromise;
}

function distance(a: ScanPoint, b: ScanPoint, width: number, height: number) {
  return Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
}

function orderCorners(points: ScanPoint[]): ScanCorners {
  const center = points.reduce((value, point) => ({ x: value.x + point.x / points.length, y: value.y + point.y / points.length }), { x: 0, y: 0 });
  const ordered = [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
  const start = ordered.reduce((best, point, index) => point.x + point.y < ordered[best].x + ordered[best].y ? index : best, 0);
  const rotated = [...ordered.slice(start), ...ordered.slice(0, start)] as ScanCorners;
  if (rotated[1].x < rotated[3].x) return [rotated[0], rotated[3], rotated[2], rotated[1]];
  return rotated;
}

function detectDocument(cv: Cv, image: ImageData): DetectionResult {
  const source = cv.matFromImageData(image);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const closed = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  let best: { corners: ScanCorners; score: number } | null = null;

  try {
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(blurred, edges, 45, 135);
    cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel);
    cv.findContours(closed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const imageArea = image.width * image.height;
    for (let index = 0; index < contours.size(); index++) {
      const contour = contours.get(index);
      const approximation = new cv.Mat();
      try {
        const area = Math.abs(cv.contourArea(contour));
        if (area < imageArea * 0.08) continue;
        const perimeter = cv.arcLength(contour, true);
        cv.approxPolyDP(contour, approximation, perimeter * 0.025, true);
        if (approximation.rows !== 4 || !cv.isContourConvex(approximation)) continue;

        const values = approximation.data32S;
        const points: ScanPoint[] = [];
        for (let point = 0; point < 4; point++) points.push({ x: values[point * 2] / image.width, y: values[point * 2 + 1] / image.height });
        const corners = orderCorners(points);
        const edgesLength = [
          distance(corners[0], corners[1], image.width, image.height),
          distance(corners[1], corners[2], image.width, image.height),
          distance(corners[2], corners[3], image.width, image.height),
          distance(corners[3], corners[0], image.width, image.height),
        ];
        const oppositeBalance = Math.min(edgesLength[0], edgesLength[2]) / Math.max(edgesLength[0], edgesLength[2])
          * Math.min(edgesLength[1], edgesLength[3]) / Math.max(edgesLength[1], edgesLength[3]);
        const areaRatio = Math.min(1, area / imageArea);
        const centerX = corners.reduce((sum, point) => sum + point.x, 0) / 4;
        const centerY = corners.reduce((sum, point) => sum + point.y, 0) / 4;
        const centered = 1 - Math.min(1, Math.hypot(centerX - 0.5, centerY - 0.5));
        const score = areaRatio * 0.72 + oppositeBalance * 0.2 + centered * 0.08;
        if (!best || score > best.score) best = { corners, score };
      } finally {
        approximation.delete();
        contour.delete();
      }
    }
  } finally {
    source.delete(); gray.delete(); blurred.delete(); edges.delete(); closed.delete(); contours.delete(); hierarchy.delete(); kernel.delete();
  }

  if (!best || best.score < 0.24) {
    return { corners: [{ x: 0.04, y: 0.04 }, { x: 0.96, y: 0.04 }, { x: 0.96, y: 0.96 }, { x: 0.04, y: 0.96 }], confidence: 0 };
  }
  return { corners: best.corners, confidence: Math.min(0.99, best.score) };
}

function processDocument(cv: Cv, image: ImageData, settings: ProcessSettings, maxLongEdge: number): ProcessResult {
  const source = cv.matFromImageData(image);
  const { corners } = settings;
  const measuredWidth = Math.max(distance(corners[0], corners[1], image.width, image.height), distance(corners[3], corners[2], image.width, image.height));
  const measuredHeight = Math.max(distance(corners[0], corners[3], image.width, image.height), distance(corners[1], corners[2], image.width, image.height));
  const outputScale = Math.min(1, maxLongEdge / Math.max(measuredWidth, measuredHeight));
  const width = Math.max(32, Math.round(measuredWidth * outputScale));
  const height = Math.max(32, Math.round(measuredHeight * outputScale));
  const sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flatMap((point) => [point.x * image.width, point.y * image.height]));
  const targetPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width - 1, 0, width - 1, height - 1, 0, height - 1]);
  const transform = cv.getPerspectiveTransform(sourcePoints, targetPoints);
  const warped = new cv.Mat();
  let rotated = new cv.Mat();
  const output = new cv.Mat();

  try {
    cv.warpPerspective(source, warped, transform, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
    if (settings.rotation === 90) cv.rotate(warped, rotated, cv.ROTATE_90_CLOCKWISE);
    else if (settings.rotation === 180) cv.rotate(warped, rotated, cv.ROTATE_180);
    else if (settings.rotation === 270) cv.rotate(warped, rotated, cv.ROTATE_90_COUNTERCLOCKWISE);
    else { rotated.delete(); rotated = warped.clone(); }

    const alpha = Math.max(0.5, Math.min(1.5, settings.contrast / 100));
    const beta = Math.max(-80, Math.min(80, settings.brightness));
    if (settings.mode === "color") {
      rotated.convertTo(output, -1, alpha, beta);
    } else {
      const gray = new cv.Mat();
      const adjusted = new cv.Mat();
      try {
        cv.cvtColor(rotated, gray, cv.COLOR_RGBA2GRAY);
        gray.convertTo(adjusted, -1, alpha, beta);
        if (settings.mode === "black-white") {
          const binary = new cv.Mat();
          try {
            const c = Math.round(14 - settings.threshold / 5);
            cv.adaptiveThreshold(adjusted, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, c);
            cv.cvtColor(binary, output, cv.COLOR_GRAY2RGBA);
          } finally { binary.delete(); }
        } else {
          cv.cvtColor(adjusted, output, cv.COLOR_GRAY2RGBA);
        }
      } finally { gray.delete(); adjusted.delete(); }
    }

    const pixels = new Uint8ClampedArray(output.data.length);
    pixels.set(output.data);
    return { width: output.cols, height: output.rows, pixels };
  } finally {
    source.delete(); sourcePoints.delete(); targetPoints.delete(); transform.delete(); warped.delete(); rotated.delete(); output.delete();
  }
}

const worker = self as unknown as DedicatedWorkerGlobalScope;
worker.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    const cv = await getCv();
    if (data.operation === "detect") {
      const result = detectDocument(cv, data.image);
      worker.postMessage({ id: data.id, ok: true, result });
    } else {
      const result = processDocument(cv, data.image, data.settings, data.maxLongEdge);
      worker.postMessage({ id: data.id, ok: true, result: { ...result, pixels: result.pixels.buffer } }, [result.pixels.buffer]);
    }
  } catch (error) {
    worker.postMessage({ id: data.id, ok: false, error: error instanceof Error ? error.message : "Image processing failed." });
  }
};

export {};
