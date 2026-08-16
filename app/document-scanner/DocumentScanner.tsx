"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { zipSync } from "fflate";
import { ImageClaritySelector, qualityForClarity, type ImageClarity } from "../components/ImageClarity";
import { MobileSaveActions } from "../components/MobileSaveActions";
import { PrivacyNote } from "../components/ToolShell";
import { canUseNativeFileShare, canvasToBlob, containSize, downloadBlob, formatBytes, loadBitmap, type PreparedImage } from "../lib/image";
import { DEFAULT_CORNERS, type DetectionResult, type ProcessResult, type ProcessSettings, type ScanCorners, type ScanMode, type ScanPage } from "../lib/scan-types";
import { CornerEditor } from "./CornerEditor";

type WorkerReply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };
type PdfPageSize = "auto" | "a4" | "letter";

const ACCEPTED_IMAGES = "image/png,image/jpeg,image/webp,image/heic,image/heif,image/bmp,image/tiff,.heic,.heif,.bmp,.tif,.tiff";
const MAX_PAGES = 30;
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const ANALYSIS_EDGE = 1500;
const EXPORT_EDGE = 3000;

function baseName(name: string) {
  return name.replace(/\.[^/.]+$/, "") || "scan";
}

function pageSettings(page: ScanPage): ProcessSettings {
  return { corners: page.corners, rotation: page.rotation, mode: page.mode, brightness: page.brightness, contrast: page.contrast, threshold: page.threshold };
}

async function bitmapToImageData(file: File, maxLongEdge: number) {
  const bitmap = await loadBitmap(file);
  try {
    const size = containSize(bitmap.width, bitmap.height, maxLongEdge, maxLongEdge);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas is unavailable in this browser.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    return { image: context.getImageData(0, 0, size.width, size.height), sourceWidth: bitmap.width, sourceHeight: bitmap.height };
  } finally {
    bitmap.close();
  }
}

async function resultToBlob(result: ProcessResult, type: "image/jpeg" | "image/png", quality: number) {
  const canvas = document.createElement("canvas");
  canvas.width = result.width;
  canvas.height = result.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable in this browser.");
  context.putImageData(new ImageData(result.pixels, result.width, result.height), 0, 0);
  return canvasToBlob(canvas, type, quality);
}

function ProcessedPreview({ result }: { result: ProcessResult | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    canvas.width = result.width;
    canvas.height = result.height;
    canvas.getContext("2d")?.putImageData(new ImageData(result.pixels, result.width, result.height), 0, 0);
  }, [result]);
  return result ? <canvas ref={canvasRef} aria-label="Processed scan preview" /> : null;
}

export function DocumentScanner() {
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"crop" | "scan">("crop");
  const [processedPreview, setProcessedPreview] = useState<ProcessResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("Choose photos to begin");
  const [busy, setBusy] = useState(false);
  const [outputFormat, setOutputFormat] = useState<"image/jpeg" | "image/png">("image/jpeg");
  const [clarity, setClarity] = useState<ImageClarity>("maximum");
  const [pdfPageSize, setPdfPageSize] = useState<PdfPageSize>("auto");
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const cacheRef = useRef(new Map<string, ImageData>());
  const pagesRef = useRef<ScanPage[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingRef = useRef(new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>());
  const previewSequenceRef = useRef(0);
  const cancelRef = useRef(false);

  const activePage = useMemo(() => pages.find((page) => page.id === activeId) ?? pages[0] ?? null, [activeId, pages]);
  const activeIndex = activePage ? pages.findIndex((page) => page.id === activePage.id) : -1;

  useEffect(() => { pagesRef.current = pages; }, [pages]);

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker("/toolbox/vendor/scanner.worker.js");
    worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      const pending = pendingRef.current.get(data.id);
      if (!pending) return;
      pendingRef.current.delete(data.id);
      if (data.ok) pending.resolve(data.result);
      else pending.reject(new Error(data.error));
    };
    worker.onerror = () => {
      for (const pending of pendingRef.current.values()) pending.reject(new Error("The local scanner engine stopped. Reload the page and try again."));
      pendingRef.current.clear();
      worker.terminate();
      workerRef.current = null;
    };
    workerRef.current = worker;
    return worker;
  }, []);

  const workerCall = useCallback(<T,>(message: Record<string, unknown>): Promise<T> => {
    const id = ++requestIdRef.current;
    return new Promise<T>((resolve, reject) => {
      pendingRef.current.set(id, { resolve: (value) => resolve(value as T), reject });
      ensureWorker().postMessage({ ...message, id });
    });
  }, [ensureWorker]);

  useEffect(() => () => {
    for (const page of pagesRef.current) URL.revokeObjectURL(page.objectUrl);
    cacheRef.current.clear();
    workerRef.current?.terminate();
    pendingRef.current.clear();
  }, []);

  const detectPage = useCallback(async (pageId: string, image: ImageData) => {
    try {
      const detected = await workerCall<DetectionResult>({ operation: "detect", image });
      setPages((current) => current.map((page) => page.id === pageId ? {
        ...page,
        corners: detected.corners,
        detectionConfidence: detected.confidence,
        status: detected.confidence >= 0.34 ? "ready" : "needs-review",
      } : page));
      return detected;
    } catch (error) {
      setPages((current) => current.map((page) => page.id === pageId ? { ...page, status: "failed", error: error instanceof Error ? error.message : "Corner detection failed." } : page));
      throw error;
    }
  }, [workerCall]);

  async function addFiles(fileList: FileList | File[]) {
    const available = MAX_PAGES - pagesRef.current.length;
    const candidates = Array.from(fileList).slice(0, available);
    if (!available) { setStatus(`A scan can contain up to ${MAX_PAGES} pages.`); return; }
    if (!candidates.length) return;
    setPrepared(null);
    setStatus(`Reading ${candidates.length} ${candidates.length === 1 ? "photo" : "photos"} locally…`);

    let added = 0;
    for (const file of candidates) {
      if (file.size > MAX_FILE_BYTES) { setStatus(`${file.name} is larger than 30 MB and was skipped.`); continue; }
      const id = crypto.randomUUID();
      const objectUrl = URL.createObjectURL(file);
      try {
        const { image, sourceWidth, sourceHeight } = await bitmapToImageData(file, ANALYSIS_EDGE);
        if (sourceWidth * sourceHeight > 40_000_000) setStatus(`${file.name} is very large; export will be resized for stability.`);
        cacheRef.current.set(id, image);
        const page: ScanPage = {
          id, file, objectUrl, name: file.name, width: sourceWidth, height: sourceHeight,
          rotation: 0, corners: DEFAULT_CORNERS.map((point) => ({ ...point })) as ScanCorners,
          detectionConfidence: 0, mode: "color", brightness: 0, contrast: 108, threshold: 50, status: "detecting",
        };
        setPages((current) => [...current, page]);
        if (!activeId && added === 0) setActiveId(id);
        added++;
        setStatus(`Finding edges · ${added}/${candidates.length}`);
        await detectPage(id, image).catch(() => undefined);
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        setStatus(error instanceof Error ? `${file.name}: ${error.message}` : `${file.name} could not be read.`);
      }
    }
    setStatus(added ? `${added} ${added === 1 ? "page" : "pages"} ready · check the corners` : "No photos were added");
  }

  useEffect(() => {
    if (!activePage || previewMode !== "scan") return;
    const image = cacheRef.current.get(activePage.id);
    if (!image) return;
    const sequence = ++previewSequenceRef.current;
    setPreviewing(true);
    const timer = window.setTimeout(async () => {
      try {
        const raw = await workerCall<{ width: number; height: number; pixels: ArrayBuffer }>({ operation: "process", image, settings: pageSettings(activePage), maxLongEdge: 1400 });
        if (sequence !== previewSequenceRef.current) return;
        setProcessedPreview({ width: raw.width, height: raw.height, pixels: new Uint8ClampedArray(raw.pixels) });
      } catch (error) {
        if (sequence === previewSequenceRef.current) setStatus(error instanceof Error ? error.message : "Preview could not be generated.");
      } finally {
        if (sequence === previewSequenceRef.current) setPreviewing(false);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [activePage, previewMode, workerCall]);

  function updateActive(changes: Partial<ScanPage>) {
    if (!activePage) return;
    setPrepared(null);
    setPages((current) => current.map((page) => page.id === activePage.id ? { ...page, ...changes } : page));
  }

  async function autoDetect() {
    if (!activePage) return;
    const image = cacheRef.current.get(activePage.id);
    if (!image) return;
    updateActive({ status: "detecting" });
    setStatus("Finding the document edges…");
    const result = await detectPage(activePage.id, image).catch(() => null);
    setStatus(result?.confidence ? "Corners detected · adjust them if needed" : "Edges were unclear · adjust the corners manually");
  }

  function deletePage(page: ScanPage) {
    URL.revokeObjectURL(page.objectUrl);
    cacheRef.current.delete(page.id);
    const index = pages.findIndex((item) => item.id === page.id);
    const remaining = pages.filter((item) => item.id !== page.id);
    setPages(remaining);
    if (activeId === page.id) setActiveId(remaining[Math.min(index, remaining.length - 1)]?.id ?? null);
    setPrepared(null);
    setStatus(remaining.length ? `${remaining.length} pages in this scan` : "Choose photos to begin");
  }

  function movePage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= pages.length) return;
    const next = [...pages];
    [next[index], next[target]] = [next[target], next[index]];
    setPages(next);
    setPrepared(null);
  }

  function applyLookToAll() {
    if (!activePage) return;
    setPages((current) => current.map((page) => ({ ...page, mode: activePage.mode, brightness: activePage.brightness, contrast: activePage.contrast, threshold: activePage.threshold })));
    setPrepared(null);
    setStatus("Scan look applied to every page");
  }

  async function processForExport(page: ScanPage) {
    const { image } = await bitmapToImageData(page.file, EXPORT_EDGE);
    const raw = await workerCall<{ width: number; height: number; pixels: ArrayBuffer }>({ operation: "process", image, settings: pageSettings(page), maxLongEdge: EXPORT_EDGE });
    return { width: raw.width, height: raw.height, pixels: new Uint8ClampedArray(raw.pixels) } satisfies ProcessResult;
  }

  async function exportCurrent() {
    if (!activePage || busy) return;
    setBusy(true); setPrepared(null); setStatus("Creating full-resolution scan…");
    try {
      const result = await processForExport(activePage);
      const blob = await resultToBlob(result, outputFormat, qualityForClarity(clarity));
      const filename = `${baseName(activePage.name)}-scanned.${outputFormat === "image/png" ? "png" : "jpg"}`;
      const preparedResult = { blob, filename };
      if (canUseNativeFileShare(preparedResult)) { setPrepared(preparedResult); setStatus(`Ready · ${formatBytes(blob.size)}`); }
      else { downloadBlob(blob, filename); setStatus(`Image downloaded · ${formatBytes(blob.size)}`); }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The image could not be exported.");
    } finally { setBusy(false); }
  }

  async function exportZip() {
    if (!pages.length || busy) return;
    setBusy(true); setPrepared(null); cancelRef.current = false;
    try {
      const entries: Record<string, Uint8Array> = {};
      for (let index = 0; index < pages.length; index++) {
        if (cancelRef.current) throw new Error("Export cancelled.");
        setStatus(`Creating image ${index + 1} of ${pages.length}…`);
        const result = await processForExport(pages[index]);
        const type = outputFormat;
        const blob = await resultToBlob(result, type, qualityForClarity(clarity));
        const extension = type === "image/png" ? "png" : "jpg";
        entries[`page-${String(index + 1).padStart(3, "0")}-${baseName(pages[index].name)}.${extension}`] = new Uint8Array(await blob.arrayBuffer());
      }
      setStatus("Packaging images…");
      const bytes = zipSync(entries, { level: 0 });
      const buffer = new Uint8Array(bytes).buffer;
      const blob = new Blob([buffer], { type: "application/zip" });
      downloadBlob(blob, "scanned-images.zip");
      setStatus(`ZIP downloaded · ${formatBytes(blob.size)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The ZIP could not be created.");
    } finally { setBusy(false); cancelRef.current = false; }
  }

  async function exportPdf() {
    if (!pages.length || busy) return;
    setBusy(true); setPrepared(null); cancelRef.current = false;
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      pdf.setTitle("Scanned document");
      pdf.setCreator("Kevin6 Document Scanner");
      for (let index = 0; index < pages.length; index++) {
        if (cancelRef.current) throw new Error("Export cancelled.");
        setStatus(`Creating PDF page ${index + 1} of ${pages.length}…`);
        const result = await processForExport(pages[index]);
        const blob = await resultToBlob(result, "image/jpeg", qualityForClarity(clarity));
        const embedded = await pdf.embedJpg(await blob.arrayBuffer());
        let pageWidth: number;
        let pageHeight: number;
        let margin = 0;
        if (pdfPageSize === "a4") { pageWidth = 595.28; pageHeight = 841.89; margin = 24; }
        else if (pdfPageSize === "letter") { pageWidth = 612; pageHeight = 792; margin = 24; }
        else if (result.width >= result.height) { pageWidth = 792; pageHeight = pageWidth * result.height / result.width; }
        else { pageWidth = 612; pageHeight = pageWidth * result.height / result.width; }
        const page = pdf.addPage([pageWidth, pageHeight]);
        const scale = Math.min((pageWidth - margin * 2) / result.width, (pageHeight - margin * 2) / result.height);
        const drawnWidth = result.width * scale;
        const drawnHeight = result.height * scale;
        page.drawImage(embedded, { x: (pageWidth - drawnWidth) / 2, y: (pageHeight - drawnHeight) / 2, width: drawnWidth, height: drawnHeight });
      }
      setStatus("Finishing PDF…");
      const saved = await pdf.save({ useObjectStreams: true });
      const blob = new Blob([new Uint8Array(saved).buffer], { type: "application/pdf" });
      downloadBlob(blob, "scanned-document.pdf");
      setStatus(`PDF downloaded · ${pages.length} pages · ${formatBytes(blob.size)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The PDF could not be created.");
    } finally { setBusy(false); cancelRef.current = false; }
  }

  function fileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void addFiles(event.target.files);
    event.target.value = "";
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setDragging(false);
    if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files);
  }

  return (
    <section className="scanner-workspace">
      <aside className="control-panel scanner-controls">
        <div className="panel-title"><span>Scan controls</span><span>{pages.length}/{MAX_PAGES} PAGES</span></div>
        <PrivacyNote />

        <div className="step"><span className="step-number">01</span><div>
          <div className={`scanner-drop ${dragging ? "dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={drop}>
            <strong>Add receipts or documents</strong>
            <small>Drop several photos here, or choose an option</small>
            <div className="scanner-pick-actions">
              <label className="button">Choose photos<input type="file" multiple accept={ACCEPTED_IMAGES} onChange={fileInput} /></label>
              <label className="button">Take a photo<input type="file" accept="image/*" capture="environment" onChange={fileInput} /></label>
            </div>
          </div>
        </div></div>

        <div className="step"><span className="step-number">02</span><div>
          <div className="field"><label>Page correction</label><div className="button-row">
            <button className="button" disabled={!activePage || busy} onClick={autoDetect}>Auto detect</button>
            <button className="button" disabled={!activePage || busy} onClick={() => updateActive({ corners: DEFAULT_CORNERS.map((point) => ({ ...point })) as ScanCorners, status: "needs-review" })}>Use full image</button>
            <button className="button" disabled={!activePage || busy} onClick={() => updateActive({ rotation: (((activePage?.rotation ?? 0) + 90) % 360) as ScanPage["rotation"] })}>Rotate 90°</button>
          </div></div>
          <div className="field"><label>Scan look</label><div className="scan-mode-tabs">
            {(["color", "grayscale", "black-white"] as ScanMode[]).map((mode) => <button key={mode} className={`button ${activePage?.mode === mode ? "active" : ""}`} disabled={!activePage || busy} onClick={() => updateActive({ mode })}>{mode === "black-white" ? "B&W" : mode[0].toUpperCase() + mode.slice(1)}</button>)}
          </div></div>
          <div className="field"><label>Brightness · {activePage?.brightness ?? 0}</label><input type="range" min="-50" max="50" value={activePage?.brightness ?? 0} disabled={!activePage || busy} onChange={(event) => updateActive({ brightness: Number(event.target.value) })} /></div>
          <div className="field"><label>Contrast · {activePage?.contrast ?? 100}%</label><input type="range" min="60" max="150" value={activePage?.contrast ?? 100} disabled={!activePage || busy} onChange={(event) => updateActive({ contrast: Number(event.target.value) })} /></div>
          {activePage?.mode === "black-white" && <div className="field"><label>B&W threshold · {activePage.threshold}</label><input type="range" min="0" max="100" value={activePage.threshold} disabled={busy} onChange={(event) => updateActive({ threshold: Number(event.target.value) })} /></div>}
          <button className="button" disabled={!activePage || pages.length < 2 || busy} onClick={applyLookToAll}>Apply look to all pages</button>
        </div></div>

        <div className="step"><span className="step-number">03</span><div>
          <div className="field-row">
            <div className="field"><label>Image format</label><select value={outputFormat} disabled={busy} onChange={(event) => setOutputFormat(event.target.value as typeof outputFormat)}><option value="image/jpeg">JPEG</option><option value="image/png">PNG</option></select></div>
            {outputFormat === "image/jpeg" && <ImageClaritySelector value={clarity} onChange={setClarity} disabled={busy} />}
          </div>
          <div className="field"><label>PDF page size</label><select value={pdfPageSize} disabled={busy} onChange={(event) => setPdfPageSize(event.target.value as PdfPageSize)}><option value="auto">Auto · match document</option><option value="a4">A4</option><option value="letter">Letter</option></select></div>
          <button className="button primary" disabled={!activePage || busy} onClick={exportCurrent}>{busy ? "Processing…" : "Download current image"}</button>
          <div className="button-row scanner-export-row"><button className="button" disabled={!pages.length || busy} onClick={exportZip}>All images · ZIP</button><button className="button" disabled={!pages.length || busy} onClick={exportPdf}>Create PDF</button></div>
          {busy && <button className="button scanner-cancel" onClick={() => { cancelRef.current = true; setStatus("Cancelling after this page…"); }}>Cancel export</button>}
          {prepared && <MobileSaveActions result={prepared} onStatus={setStatus} />}
        </div></div>
      </aside>

      <div className="scanner-main">
        <div className="preview-panel scanner-preview">
          <div className="panel-title"><span>{previewMode === "crop" ? "Adjust corners" : "Scan preview"}</span><span>{activePage ? `${activeIndex + 1}/${pages.length}` : "WAITING"}</span></div>
          <div className="scanner-view-tabs" role="tablist" aria-label="Preview mode"><button role="tab" aria-selected={previewMode === "crop"} className={`button ${previewMode === "crop" ? "active" : ""}`} onClick={() => setPreviewMode("crop")}>Crop</button><button role="tab" aria-selected={previewMode === "scan"} className={`button ${previewMode === "scan" ? "active" : ""}`} onClick={() => setPreviewMode("scan")} disabled={!activePage}>Scan</button></div>
          <div className="preview-stage scanner-stage">
            {!activePage ? <div className="empty-state"><strong>Document preview</strong><span>Add one or more photos to begin</span></div> : previewMode === "crop" ?
              <CornerEditor src={activePage.objectUrl} name={activePage.name} corners={activePage.corners} disabled={busy} onChange={(corners) => updateActive({ corners, status: "ready" })} /> :
              previewing ? <div className="empty-state"><strong>Processing locally…</strong><span>The first preview may take a moment</span></div> : <ProcessedPreview result={processedPreview} />}
          </div>
          <div className="preview-meta"><span>{status}</span><span>{activePage ? `${activePage.width} × ${activePage.height}` : "Original files remain untouched"}</span></div>
        </div>

        {pages.length > 0 && <section className="page-strip" aria-label="Document pages">
          <div className="panel-title"><span>Pages</span><span>USE ARROWS TO REORDER</span></div>
          <div className="page-strip-list">
            {pages.map((page, index) => <article className={`scan-page-card ${page.id === activePage?.id ? "active" : ""}`} key={page.id}>
              <button className="page-thumb" onClick={() => setActiveId(page.id)} aria-label={`Edit page ${index + 1}: ${page.name}`}>
                <img src={page.objectUrl} alt="" />
                <span>{String(index + 1).padStart(2, "0")}</span>
                <i className={page.status}>{page.status === "detecting" ? "DETECTING" : page.status === "ready" ? "READY" : page.status === "failed" ? "ERROR" : "CHECK"}</i>
              </button>
              <div className="page-card-actions"><button disabled={index === 0 || busy} onClick={() => movePage(index, -1)} aria-label={`Move page ${index + 1} left`}>←</button><button disabled={index === pages.length - 1 || busy} onClick={() => movePage(index, 1)} aria-label={`Move page ${index + 1} right`}>→</button><button disabled={busy} onClick={() => deletePage(page)} aria-label={`Delete page ${index + 1}`}>×</button></div>
            </article>)}
          </div>
        </section>}
      </div>
    </section>
  );
}
