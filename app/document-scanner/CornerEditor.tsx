"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { ScanCorners, ScanPage } from "../lib/scan-types";

const LABELS = ["Top left", "Top right", "Bottom right", "Bottom left"];
const MAGNIFIER_ZOOM = 3;

type MagnifierState = {
  point: { x: number; y: number };
  editorWidth: number;
  editorHeight: number;
  size: number;
  left: number;
  top: number;
};

export function CornerEditor({ src, name, width, height, rotation, corners, disabled, onChange }: {
  src: string;
  name: string;
  width: number;
  height: number;
  rotation: ScanPage["rotation"];
  corners: ScanCorners;
  disabled?: boolean;
  onChange: (corners: ScanCorners) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [magnifier, setMagnifier] = useState<MagnifierState | null>(null);
  const quarterTurn = rotation === 90 || rotation === 270;
  const displayWidth = quarterTurn ? height : width;
  const displayHeight = quarterTurn ? width : height;
  const displayRatio = displayWidth / displayHeight;

  function showMagnifier(point: { x: number; y: number }) {
    const bounds = editorRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const size = Math.min(116, Math.max(72, bounds.width * 0.3), bounds.width, bounds.height);
    const gap = 22;
    const pointX = point.x * bounds.width;
    const pointY = point.y * bounds.height;
    let left = pointX + gap;
    if (left + size > bounds.width) left = pointX - gap - size;
    left = Math.max(0, Math.min(bounds.width - size, left));
    const top = Math.max(0, Math.min(bounds.height - size, pointY - size / 2));
    setMagnifier({ point, editorWidth: bounds.width, editorHeight: bounds.height, size, left, top });
  }

  function move(index: number, x: number, y: number) {
    const next = corners.map((point) => ({ ...point })) as ScanCorners;
    next[index] = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    onChange(next);
  }

  function pointerMove(index: number, event: PointerEvent<HTMLButtonElement>) {
    if (!(event.currentTarget.hasPointerCapture(event.pointerId))) return;
    const bounds = editorRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const point = {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
    move(index, point.x, point.y);
    showMagnifier(point);
  }

  function keyMove(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    const amount = event.shiftKey ? 0.02 : 0.005;
    const point = corners[index];
    let next = point;
    if (event.key === "ArrowLeft") next = { x: point.x - amount, y: point.y };
    else if (event.key === "ArrowRight") next = { x: point.x + amount, y: point.y };
    else if (event.key === "ArrowUp") next = { x: point.x, y: point.y - amount };
    else if (event.key === "ArrowDown") next = { x: point.x, y: point.y + amount };
    else return;
    next = { x: Math.max(0, Math.min(1, next.x)), y: Math.max(0, Math.min(1, next.y)) };
    move(index, next.x, next.y);
    showMagnifier(next);
    event.preventDefault();
  }

  const editorStyle = {
    width: `min(100%, ${64 * displayRatio}vh)`,
    aspectRatio: `${displayWidth} / ${displayHeight}`,
  } satisfies CSSProperties;

  const sourceImageStyle = {
    width: quarterTurn ? `${width / height * 100}%` : "100%",
    height: quarterTurn ? `${height / width * 100}%` : "100%",
    maxWidth: "none",
    maxHeight: "none",
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
  } satisfies CSSProperties;

  const magnifiedPlaneStyle = magnifier ? {
    width: magnifier.editorWidth * MAGNIFIER_ZOOM,
    height: magnifier.editorHeight * MAGNIFIER_ZOOM,
    left: magnifier.size / 2 - magnifier.point.x * magnifier.editorWidth * MAGNIFIER_ZOOM,
    top: magnifier.size / 2 - magnifier.point.y * magnifier.editorHeight * MAGNIFIER_ZOOM,
  } satisfies CSSProperties : undefined;

  return (
    <div className="corner-editor" ref={editorRef} style={editorStyle}>
      {/* The original photo remains visible while the crop geometry is edited. */}
      <img className="corner-source-image" src={src} alt={`${name} crop preview`} draggable={false} style={sourceImageStyle} />
      <svg className="corner-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polygon points={corners.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")} />
        {corners.map((point, index) => index < 3 ? <line key={index} x1={point.x * 100} y1={point.y * 100} x2={corners[index + 1].x * 100} y2={corners[index + 1].y * 100} /> : null)}
      </svg>
      {corners.map((point, index) => (
        <button
          key={LABELS[index]}
          type="button"
          className="corner-handle"
          aria-label={`${LABELS[index]} crop corner. Use arrow keys to adjust.`}
          disabled={disabled}
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); showMagnifier(point); }}
          onPointerMove={(event) => pointerMove(index, event)}
          onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); setMagnifier(null); }}
          onPointerCancel={() => setMagnifier(null)}
          onLostPointerCapture={() => setMagnifier(null)}
          onBlur={() => setMagnifier(null)}
          onKeyDown={(event) => keyMove(index, event)}
        ><span>{index + 1}</span></button>
      ))}
      {magnifier && <div className="corner-magnifier" aria-hidden="true" style={{ width: magnifier.size, height: magnifier.size, left: magnifier.left, top: magnifier.top }}>
        <div className="corner-magnifier-plane" style={magnifiedPlaneStyle}><img className="corner-source-image" src={src} alt="" draggable={false} style={sourceImageStyle} /></div>
      </div>}
    </div>
  );
}
