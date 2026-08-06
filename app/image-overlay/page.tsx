import type { Metadata } from "next";
import { ToolHeader, ToolShell } from "../components/ToolShell";
import { ImageOverlay } from "./ImageOverlay";

export const metadata: Metadata = {
  title: "Image Overlay",
  description: "Layer, position and export two images locally in your browser.",
};

export default function Page() {
  return <ToolShell compact><ToolHeader index="03" title="Image Overlay" description="Place one image over another. Drag, scale, rotate, flip and blend it—without uploading either file." /><ImageOverlay /></ToolShell>;
}
