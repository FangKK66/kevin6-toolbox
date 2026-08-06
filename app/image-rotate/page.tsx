import type { Metadata } from "next";
import { ToolHeader, ToolShell } from "../components/ToolShell";
import { ImageRotate } from "./ImageRotate";

export const metadata: Metadata = { title: "Image Rotate", description: "Rotate, flip and export a new image locally in your browser." };
export default function Page() { return <ToolShell compact><ToolHeader index="02" title="Image Rotate" description="Fix orientation, flip a frame or use any angle—then export a fresh image file." /><ImageRotate /></ToolShell>; }
