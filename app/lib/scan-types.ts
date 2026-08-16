export type ScanPoint = { x: number; y: number };
export type ScanCorners = [ScanPoint, ScanPoint, ScanPoint, ScanPoint];
export type ScanMode = "color" | "grayscale" | "black-white";
export type ScanStatus = "detecting" | "ready" | "needs-review" | "failed";

export type ScanPage = {
  id: string;
  file: File;
  objectUrl: string;
  name: string;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  corners: ScanCorners;
  detectionConfidence: number;
  mode: ScanMode;
  brightness: number;
  contrast: number;
  threshold: number;
  status: ScanStatus;
  error?: string;
};

export type ProcessSettings = Pick<ScanPage, "corners" | "rotation" | "mode" | "brightness" | "contrast" | "threshold">;

export type DetectionResult = {
  corners: ScanCorners;
  confidence: number;
};

export type ProcessResult = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray<ArrayBuffer>;
};

export const DEFAULT_CORNERS: ScanCorners = [
  { x: 0.04, y: 0.04 },
  { x: 0.96, y: 0.04 },
  { x: 0.96, y: 0.96 },
  { x: 0.04, y: 0.96 },
];
