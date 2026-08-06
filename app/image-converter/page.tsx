import type { Metadata } from "next";
import { ToolHeader, ToolShell } from "../components/ToolShell";
import { ImageConverter } from "./ImageConverter";

export const metadata: Metadata = { title: "Image Converter", description: "Convert and resize PNG, JPEG and WebP images locally in your browser." };

export default function Page() {
  return <ToolShell compact><ToolHeader index="01" title="Image Converter" description="Convert, resize and tune image quality without uploading a single pixel." /><ImageConverter /></ToolShell>;
}
