"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { FileDrop } from "../components/FileDrop";
import { ImageClaritySelector, qualityForClarity, type ImageClarity } from "../components/ImageClarity";
import { MobileSaveActions } from "../components/MobileSaveActions";
import { PrivacyNote } from "../components/ToolShell";
import { canUseNativeFileShare, canvasToBlob, downloadBlob, loadBitmap, replaceExtension, type OutputFormat, type PreparedImage } from "../lib/image";

type Point = { x: number; y: number };

export function ImageOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointer: number; start: Point; origin: Point } | null>(null);
  const [baseFile, setBaseFile] = useState<File | null>(null);
  const [base, setBase] = useState<ImageBitmap | null>(null);
  const [layer, setLayer] = useState<ImageBitmap | null>(null);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [scale, setScale] = useState(50);
  const [rotation, setRotation] = useState(0);
  const [opacity, setOpacity] = useState(100);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [format, setFormat] = useState<OutputFormat>("image/png");
  const [clarity, setClarity] = useState<ImageClarity>("maximum");
  const [status, setStatus] = useState("Waiting for images");
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);

  useEffect(() => {
    if (!base) return;
    draw(canvasRef.current, false);
  // The canvas renderer intentionally tracks every visual control listed here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, layer, position, scale, rotation, opacity, flipX, flipY, format]);
  async function chooseBase(file: File) {
    const image = await loadBitmap(file);
    base?.close();
    setBaseFile(file);
    setBase(image);
    setPrepared(null);
    setStatus(`${image.width} × ${image.height} base image`);
    setPosition({ x: image.width / 2, y: image.height / 2 });
  }

  async function chooseLayer(file: File) {
    const image = await loadBitmap(file);
    layer?.close();
    setLayer(image);
    setPrepared(null);
    if (base) setPosition({ x: base.width / 2, y: base.height / 2 });
  }

  function draw(canvas: HTMLCanvasElement | null, full: boolean) {
    if (!canvas || !base) return;
    const previewScale = full ? 1 : Math.min(720 / base.width, 520 / base.height, 1);
    canvas.width = Math.max(1, Math.round(base.width * previewScale));
    canvas.height = Math.max(1, Math.round(base.height * previewScale));
    const context = canvas.getContext("2d");
    if (!context) return;
    if (format === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(base, 0, 0, canvas.width, canvas.height);
    if (!layer) return;
    const layerScale = (scale / 100) * previewScale;
    const width = layer.width * layerScale;
    const height = layer.height * layerScale;
    context.save();
    context.globalAlpha = opacity / 100;
    context.translate(position.x * previewScale, position.y * previewScale);
    context.rotate(rotation * Math.PI / 180);
    context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    context.drawImage(layer, -width / 2, -height / 2, width, height);
    context.restore();
  }

  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!base || !layer) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: position };
  }

  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || drag.pointer !== event.pointerId || !canvas || !base) return;
    const rect = canvas.getBoundingClientRect();
    setPosition({
      x: drag.origin.x + (event.clientX - drag.start.x) * base.width / rect.width,
      y: drag.origin.y + (event.clientY - drag.start.y) * base.height / rect.height,
    });
  }

  async function exportImage() {
    if (!base || !baseFile) return;
    setPrepared(null);
    const canvas = document.createElement("canvas");
    draw(canvas, true);
    const blob = await canvasToBlob(canvas, format, qualityForClarity(clarity));
    const result = { blob, filename: replaceExtension(baseFile.name, "-overlay", format) };
    if (canUseNativeFileShare(result)) { setPrepared(result); setStatus("Ready · tap Save or share"); }
    else { downloadBlob(blob, result.filename); setStatus("Composition downloaded"); }
  }

  const center = () => base && setPosition({ x: base.width / 2, y: base.height / 2 });
  return <section className="tool-workspace">
    <aside className="control-panel">
      <div className="panel-title"><span>Layers</span><span>2 MAX</span></div><PrivacyNote />
      <div className="step"><span className="step-number">01</span><div><span className="field-label">Base image</span><FileDrop onFile={chooseBase} /></div></div>
      <div className="step"><span className="step-number">02</span><div><span className="field-label">Overlay image</span><FileDrop onFile={chooseLayer} /></div></div>
      <div className="step"><span className="step-number">03</span><div>
        <div className="field"><label>Scale · {scale}%</label><input type="range" min="5" max="200" value={scale} onChange={(e) => setScale(Number(e.target.value))} /></div>
        <div className="field"><label>Rotation · {rotation}°</label><input type="range" min="-180" max="180" value={rotation} onChange={(e) => setRotation(Number(e.target.value))} /></div>
        <div className="field"><label>Opacity · {opacity}%</label><input type="range" min="0" max="100" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /></div>
        <div className="button-row"><button className="button" onClick={center}>Center</button><button className={`button ${flipX ? "active" : ""}`} onClick={() => setFlipX(!flipX)}>Flip X</button><button className={`button ${flipY ? "active" : ""}`} onClick={() => setFlipY(!flipY)}>Flip Y</button></div>
      </div></div>
      <div className="step"><span className="step-number">04</span><div>
        <div className="field"><label>Output</label><select value={format} onChange={(e) => setFormat(e.target.value as OutputFormat)}><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option></select></div>
        {format !== "image/png" && <ImageClaritySelector value={clarity} onChange={setClarity} />}
        <button className="button primary" disabled={!base || !layer} onClick={exportImage}>Export composition</button>
        {prepared && <MobileSaveActions result={prepared} onStatus={setStatus} />}
      </div></div>
    </aside>
    <div className="preview-panel"><div className="panel-title"><span>Composition</span><span>DRAG TO POSITION</span></div><div className="preview-stage">{base ? <div className="canvas-wrap"><canvas ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} aria-label="Image composition preview" /></div> : <div className="empty-state"><strong>Composition preview</strong><span>Choose a base image to begin</span></div>}</div><div className="preview-meta"><span>{status}</span><span>Export uses the base image resolution</span></div></div>
  </section>;
}
