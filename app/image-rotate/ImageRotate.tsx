"use client";

import { useEffect, useRef, useState } from "react";
import { FileDrop } from "../components/FileDrop";
import { ImageClaritySelector, qualityForClarity, type ImageClarity } from "../components/ImageClarity";
import { MobileSaveActions } from "../components/MobileSaveActions";
import { PrivacyNote } from "../components/ToolShell";
import { canUseNativeFileShare, canvasToBlob, downloadBlob, loadBitmap, replaceExtension, type OutputFormat, type PreparedImage } from "../lib/image";

export function ImageRotate() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [angle, setAngle] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [format, setFormat] = useState<OutputFormat>("image/png");
  const [clarity, setClarity] = useState<ImageClarity>("maximum");
  const [background, setBackground] = useState("#ffffff");
  const [status, setStatus] = useState("Waiting for an image");
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);

  useEffect(() => () => bitmap?.close(), [bitmap]);
  // The canvas renderer intentionally tracks every visual control listed here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (bitmap) render(canvasRef.current, bitmap, angle, flipX, flipY, false, background); }, [bitmap, angle, flipX, flipY, background, format]);

  async function choose(next: File) {
    bitmap?.close();
    const loaded = await loadBitmap(next);
    setFile(next); setBitmap(loaded); setAngle(0); setFlipX(false); setFlipY(false); setPrepared(null); setStatus(`${loaded.width} × ${loaded.height}`);
  }

  function render(canvas: HTMLCanvasElement | null, source: ImageBitmap, degrees: number, horizontal: boolean, vertical: boolean, full: boolean, fill: string) {
    if (!canvas) return;
    const radians = degrees * Math.PI / 180;
    const boundWidth = Math.abs(source.width * Math.cos(radians)) + Math.abs(source.height * Math.sin(radians));
    const boundHeight = Math.abs(source.width * Math.sin(radians)) + Math.abs(source.height * Math.cos(radians));
    const scale = full ? 1 : Math.min(720 / boundWidth, 520 / boundHeight, 1);
    canvas.width = Math.max(1, Math.round(boundWidth * scale)); canvas.height = Math.max(1, Math.round(boundHeight * scale));
    const context = canvas.getContext("2d"); if (!context) return;
    context.fillStyle = fill; context.clearRect(0, 0, canvas.width, canvas.height);
    if (format === "image/jpeg") context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2); context.rotate(radians); context.scale(horizontal ? -1 : 1, vertical ? -1 : 1);
    context.imageSmoothingQuality = "high"; context.drawImage(source, -source.width * scale / 2, -source.height * scale / 2, source.width * scale, source.height * scale);
  }

  async function exportImage() {
    if (!file || !bitmap) return;
    setPrepared(null);
    const canvas = document.createElement("canvas"); render(canvas, bitmap, angle, flipX, flipY, true, background);
    const blob = await canvasToBlob(canvas, format, qualityForClarity(clarity));
    const result = { blob, filename: replaceExtension(file.name, `-rotated-${Math.round(angle)}`, format) };
    if (canUseNativeFileShare(result)) { setPrepared(result); setStatus("Ready · tap Save or share"); }
    else { downloadBlob(blob, result.filename); setStatus("New image downloaded"); }
  }

  return <section className="tool-workspace">
    <aside className="control-panel"><div className="panel-title"><span>Transform</span><span>PIXEL OUTPUT</span></div><PrivacyNote />
      <div className="step"><span className="step-number">01</span><div><FileDrop onFile={choose} /></div></div>
      <div className="step"><span className="step-number">02</span><div>
        <div className="field"><label>Quick rotate</label><div className="button-row"><button className="button" onClick={() => setAngle(angle - 90)}>↶ 90°</button><button className="button" onClick={() => setAngle(angle + 90)}>↷ 90°</button><button className="button" onClick={() => setAngle(angle + 180)}>180°</button></div></div>
        <div className="field"><label>Custom angle · {angle}°</label><input type="range" min="-180" max="180" value={angle} onChange={(e) => setAngle(Number(e.target.value))} /></div>
        <div className="field"><label>Flip</label><div className="button-row"><button className={`button ${flipX ? "active" : ""}`} onClick={() => setFlipX(!flipX)}>Horizontal</button><button className={`button ${flipY ? "active" : ""}`} onClick={() => setFlipY(!flipY)}>Vertical</button><button className="button" onClick={() => { setAngle(0); setFlipX(false); setFlipY(false); }}>Reset</button></div></div>
      </div></div>
      <div className="step"><span className="step-number">03</span><div><div className="field"><label>Output</label><select value={format} onChange={(e) => setFormat(e.target.value as OutputFormat)}><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option></select></div>{format !== "image/png" && <ImageClaritySelector value={clarity} onChange={setClarity} />}{format === "image/jpeg" && <div className="field"><label>Background</label><input type="color" value={background} onChange={(e) => setBackground(e.target.value)} /></div>}<button className="button primary" disabled={!file} onClick={exportImage}>Create new image</button>{prepared && <MobileSaveActions result={prepared} onStatus={setStatus} />}</div></div>
    </aside>
    <div className="preview-panel"><div className="panel-title"><span>Live preview</span><span>{angle}°</span></div><div className="preview-stage">{bitmap ? <canvas ref={canvasRef} aria-label="Rotated image preview" /> : <div className="empty-state"><strong>Transform preview</strong><span>Choose an image to begin</span></div>}</div><div className="preview-meta"><span>{status}</span><span>Original file remains untouched</span></div></div>
  </section>;
}
