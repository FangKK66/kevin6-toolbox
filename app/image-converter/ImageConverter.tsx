"use client";

import { useEffect, useState } from "react";
import { FileDrop } from "../components/FileDrop";
import { PrivacyNote } from "../components/ToolShell";
import { canvasToBlob, downloadBlob, formatBytes, loadBitmap, replaceExtension, type OutputFormat } from "../lib/image";

export function ImageConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [format, setFormat] = useState<OutputFormat>("image/webp");
  const [quality, setQuality] = useState(88);
  const [background, setBackground] = useState("#ffffff");
  const [status, setStatus] = useState("Waiting for an image");

  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); }, [sourceUrl]);

  async function selectFile(next: File) {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    const bitmap = await loadBitmap(next);
    setFile(next);
    setSourceUrl(URL.createObjectURL(next));
    setDimensions({ width: bitmap.width, height: bitmap.height });
    setWidth(bitmap.width);
    setHeight(bitmap.height);
    setStatus(`${next.name} · ${formatBytes(next.size)}`);
    bitmap.close();
  }

  function setSizedWidth(value: number) {
    setWidth(value);
    if (dimensions.width) setHeight(Math.max(1, Math.round(value * dimensions.height / dimensions.width)));
  }

  function setSizedHeight(value: number) {
    setHeight(value);
    if (dimensions.height) setWidth(Math.max(1, Math.round(value * dimensions.width / dimensions.height)));
  }

  async function convert() {
    if (!file) return;
    setStatus("Converting locally…");
    try {
      const bitmap = await loadBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, width || bitmap.width);
      canvas.height = Math.max(1, height || bitmap.height);
      const context = canvas.getContext("2d", { alpha: format !== "image/jpeg" });
      if (!context) throw new Error("Canvas is unavailable.");
      if (format === "image/jpeg") { context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height); }
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await canvasToBlob(canvas, format, quality / 100);
      downloadBlob(blob, replaceExtension(file.name, "-converted", format));
      setStatus(`Done · ${formatBytes(blob.size)} downloaded`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Conversion failed."); }
  }

  return (
    <section className="tool-workspace">
      <aside className="control-panel">
        <div className="panel-title"><span>Controls</span><span>01—03</span></div>
        <PrivacyNote />
        <div className="step"><span className="step-number">01</span><div><FileDrop onFile={selectFile} /></div></div>
        <div className="step"><span className="step-number">02</span><div>
          <div className="field"><label>Output format</label><select value={format} onChange={(event) => setFormat(event.target.value as OutputFormat)}><option value="image/webp">WebP</option><option value="image/jpeg">JPEG</option><option value="image/png">PNG</option></select></div>
          <div className="field-row"><div className="field"><label>Width</label><input type="number" min="1" value={width || ""} onChange={(e) => setSizedWidth(Number(e.target.value))} /></div><div className="field"><label>Height</label><input type="number" min="1" value={height || ""} onChange={(e) => setSizedHeight(Number(e.target.value))} /></div></div>
          {format !== "image/png" && <div className="field"><label>Quality · {quality}%</label><input type="range" min="10" max="100" value={quality} onChange={(e) => setQuality(Number(e.target.value))} /></div>}
          {format === "image/jpeg" && <div className="field"><label>Transparency background</label><input type="color" value={background} onChange={(e) => setBackground(e.target.value)} /></div>}
        </div></div>
        <div className="step"><span className="step-number">03</span><div><button className="button primary" disabled={!file} onClick={convert}>Convert & download</button></div></div>
      </aside>
      <div className="preview-panel">
        <div className="panel-title"><span>Preview</span><span>{dimensions.width ? `${dimensions.width} × ${dimensions.height}` : "NO FILE"}</span></div>
        <div className="preview-stage">{sourceUrl ? <img src={sourceUrl} alt="Selected file preview" /> : <div className="empty-state"><strong>Your image appears here</strong><span>PNG · JPEG · WebP · browser-supported formats</span></div>}</div>
        <div className="preview-meta"><span>{status}</span><span>Metadata is removed on export</span></div>
      </div>
    </section>
  );
}
