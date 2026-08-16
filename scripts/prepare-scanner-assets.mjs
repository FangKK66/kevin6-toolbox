import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDirectory = resolve(projectRoot, "public/vendor");

await mkdir(vendorDirectory, { recursive: true });
await Promise.all([
  copyFile(resolve(projectRoot, "node_modules/@techstark/opencv-js/dist/opencv.js"), resolve(vendorDirectory, "opencv.js")),
  copyFile(resolve(projectRoot, "node_modules/@techstark/opencv-js/LICENSE"), resolve(vendorDirectory, "opencv.LICENSE.txt")),
  build({
    entryPoints: [resolve(projectRoot, "app/document-scanner/scanner.worker.ts")],
    outfile: resolve(vendorDirectory, "scanner.worker.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    minify: true,
    legalComments: "none",
  }),
]);
