"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { ScanCorners } from "../lib/scan-types";

const LABELS = ["Top left", "Top right", "Bottom right", "Bottom left"];

export function CornerEditor({ src, name, corners, disabled, onChange }: {
  src: string;
  name: string;
  corners: ScanCorners;
  disabled?: boolean;
  onChange: (corners: ScanCorners) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  function move(index: number, x: number, y: number) {
    const next = corners.map((point) => ({ ...point })) as ScanCorners;
    next[index] = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    onChange(next);
  }

  function pointerMove(index: number, event: PointerEvent<HTMLButtonElement>) {
    if (!(event.currentTarget.hasPointerCapture(event.pointerId))) return;
    const bounds = editorRef.current?.getBoundingClientRect();
    if (!bounds) return;
    move(index, (event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
  }

  function keyMove(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    const amount = event.shiftKey ? 0.02 : 0.005;
    const point = corners[index];
    if (event.key === "ArrowLeft") move(index, point.x - amount, point.y);
    else if (event.key === "ArrowRight") move(index, point.x + amount, point.y);
    else if (event.key === "ArrowUp") move(index, point.x, point.y - amount);
    else if (event.key === "ArrowDown") move(index, point.x, point.y + amount);
    else return;
    event.preventDefault();
  }

  return (
    <div className="corner-editor" ref={editorRef}>
      {/* The original photo remains visible while the crop geometry is edited. */}
      <img src={src} alt={`${name} crop preview`} draggable={false} />
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
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerMove={(event) => pointerMove(index, event)}
          onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
          onKeyDown={(event) => keyMove(index, event)}
        ><span>{index + 1}</span></button>
      ))}
    </div>
  );
}
