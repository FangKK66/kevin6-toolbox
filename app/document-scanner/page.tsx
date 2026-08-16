import type { Metadata } from "next";
import { ToolHeader, ToolShell } from "../components/ToolShell";
import { DocumentScanner } from "./DocumentScanner";

export const metadata: Metadata = {
  title: "Document Scanner",
  description: "Turn photos of receipts and documents into clean images or a multi-page PDF entirely in your browser.",
};

export default function Page() {
  return <ToolShell compact><ToolHeader index="06" title="Document Scanner" description="Fix corners, clean up pages and create images or a PDF without uploading your documents." /><DocumentScanner /></ToolShell>;
}

