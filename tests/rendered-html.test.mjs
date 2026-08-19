import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = [
  ["/toolbox/", "Pick a tool."],
  ["/toolbox/image-converter/", "Image Converter"],
  ["/toolbox/image-rotate/", "Image Rotate"],
  ["/toolbox/image-overlay/", "Image Overlay"],
  ["/toolbox/lan-transfer/", "Pair Transfer"],
  ["/toolbox/group-transfer/", "Group Transfer"],
  ["/toolbox/document-scanner/", "Document Scanner"],
];

async function render(path) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

for (const [path, expected] of routes) {
  test(`server-renders ${path}`, async () => {
    const response = await render(path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    assert.match(await response.text(), new RegExp(expected, "i"));
  });
}

test("homepage links remain inside the /toolbox base path", async () => {
  const html = await (await render("/toolbox/")).text();
  for (const [path] of routes.slice(1)) assert.match(html, new RegExp(`href=["']${path}["']`));
});

test("redirects the bare toolbox path to its canonical URL", async () => {
  const response = await render("/toolbox");
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "http://localhost/toolbox/");
});

test("LAN transfer renders the four-emoji pairing flow", async () => {
  const html = await (await render("/toolbox/lan-transfer/")).text();
  assert.match(html, /Create an emoji room/i);
  assert.match(html, /Join room/i);
});

test("LAN transfer includes a staged connection diagnostic", async () => {
  const source = await readFile(new URL("../app/lan-transfer/LanTransfer.tsx", import.meta.url), "utf8");
  assert.match(source, /DIRECT_CONNECTION_TIMEOUT/);
  assert.match(source, /ICE_CONNECTION_FAILED/);
  assert.match(source, /Failed at:/);
  assert.match(source, /Public Wi-Fi client isolation/i);
});

test("LAN transfer uses free STUN discovery and renders transfer progress", async () => {
  const source = await readFile(new URL("../app/lan-transfer/LanTransfer.tsx", import.meta.url), "utf8");
  assert.match(source, /stun:stun\.cloudflare\.com:3478/);
  assert.match(source, /role="progressbar"/);
  assert.match(source, /file-received/);
  assert.match(source, /aria-valuenow/);
  assert.match(source, /onFiles=\{setFiles\}/);
  assert.match(source, /Sending \$\{fileIndex \+ 1\} of \$\{selectedFiles\.length\}/);
});

test("Group Transfer implements a four-device targeted mesh", async () => {
  const source = await readFile(new URL("../app/group-transfer/GroupTransfer.tsx", import.meta.url), "utf8");
  assert.match(source, /MAX_DEVICES = 4/);
  assert.match(source, /selectedRecipients/);
  assert.match(source, /stun:stun\.cloudflare\.com:3478/);
  assert.match(source, /file-received/);
  assert.match(source, /recipient-progress/);
  assert.match(source, /icecandidate/);
  assert.match(source, /connectionId/);
  assert.match(source, /entry\?\.timeout != null/);
  assert.match(source, /WAITING FOR OFFER|OFFER SENT/);
});

test("deployment config includes the SQLite pairing room", async () => {
  const config = JSON.parse(await readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"));
  assert.equal(config.assets?.binding, "ASSETS");
  assert.equal(config.assets?.not_found_handling, "none");
  assert.deepEqual(config.durable_objects?.bindings, [
    { name: "PAIR_ROOMS", class_name: "PairRoom" },
    { name: "GROUP_ROOMS", class_name: "GroupRoom" },
  ]);
  assert.deepEqual(config.migrations, [
    { tag: "v1", new_sqlite_classes: ["PairRoom"] },
    { tag: "v2", new_sqlite_classes: ["GroupRoom"] },
  ]);
});

test("document scanner keeps processing local and includes batch exports", async () => {
  const source = await readFile(new URL("../app/document-scanner/DocumentScanner.tsx", import.meta.url), "utf8");
  assert.match(source, /Processed locally in your browser|PrivacyNote/);
  assert.match(source, /All images · ZIP/);
  assert.match(source, /Create PDF/);
  assert.match(source, /multiple/);
  assert.match(source, /capture="environment"/);
  assert.match(source, /"\.avif"/);
  assert.match(source, /"\.gif"/);
  assert.match(source, /"\.dng"/);
  assert.match(source, /Camera RAW/);
  assert.match(source, /needsDecodedPreview/);
  assert.match(source, /decodedPreviewUrl/);
});

test("document scanner provides automatic and manual four-corner correction", async () => {
  const scanner = await readFile(new URL("../app/document-scanner/DocumentScanner.tsx", import.meta.url), "utf8");
  const worker = await readFile(new URL("../app/document-scanner/scanner.worker.ts", import.meta.url), "utf8");
  const editor = await readFile(new URL("../app/document-scanner/CornerEditor.tsx", import.meta.url), "utf8");
  assert.match(worker, /findContours/);
  assert.match(worker, /getPerspectiveTransform/);
  assert.match(worker, /adaptiveThreshold/);
  assert.match(editor, /corner-handle/);
  assert.match(editor, /corner-magnifier/);
  assert.match(editor, /MAGNIFIER_ZOOM/);
  assert.match(editor, /rotation/);
  assert.match(scanner, /cornersForDisplay/);
  assert.match(scanner, /cornersFromDisplay/);
  assert.match(editor, /ArrowLeft/);
  assert.match(scanner, /WORKER_TIMEOUT_MS/);
  assert.match(scanner, /role="progressbar"/);
  assert.match(scanner, /Processing PDF page/);
  assert.match(scanner, />Preview<\/button>/);
  assert.doesNotMatch(scanner, />Scan<\/button>/);
});

test("document scanner build emits its local OpenCV worker assets", async () => {
  const worker = await readFile(new URL("../dist/client/vendor/scanner.worker.js", import.meta.url), "utf8");
  const opencv = await readFile(new URL("../dist/client/vendor/opencv.js", import.meta.url));
  assert.match(worker, /importScripts\(["']\/toolbox\/vendor\/opencv\.js/);
  assert.ok(opencv.byteLength > 1_000_000, "expected the local OpenCV runtime asset");
});

test("all image quality controls use the shared three-option clarity selector", async () => {
  const selector = await readFile(new URL("../app/components/ImageClarity.tsx", import.meta.url), "utf8");
  assert.match(selector, /High/);
  assert.match(selector, /Mid/);
  assert.match(selector, /Low/);
  assert.match(selector, /useState<ImageClarity>|value: "maximum"/);
  for (const path of [
    "../app/image-converter/ImageConverter.tsx",
    "../app/image-rotate/ImageRotate.tsx",
    "../app/image-overlay/ImageOverlay.tsx",
    "../app/document-scanner/DocumentScanner.tsx",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /ImageClaritySelector/);
    assert.doesNotMatch(source, /<label>Quality/);
  }
});
