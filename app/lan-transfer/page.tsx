import type { Metadata } from "next";
import { ToolHeader, ToolShell } from "../components/ToolShell";
import { LanTransfer } from "./LanTransfer";

export const metadata: Metadata = {
  title: "LAN Transfer",
  description: "Transfer text and files directly between two browsers over an encrypted peer connection.",
};

export default function Page() {
  return <ToolShell compact><ToolHeader index="04" title="LAN Transfer" description="Pair two nearby browsers with a one-time code, then send text or files directly over an encrypted connection." /><LanTransfer /></ToolShell>;
}
