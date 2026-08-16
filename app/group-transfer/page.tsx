import type { Metadata } from "next";
import { ToolHeader, ToolShell } from "../components/ToolShell";
import { GroupTransfer } from "./GroupTransfer";

export const metadata: Metadata = {
  title: "Group Transfer",
  description: "Send text and files directly between three or four browsers in a temporary encrypted group room.",
};

export default function Page() {
  return <ToolShell compact><ToolHeader index="05" title="Group Transfer" description="Connect up to four browsers with six emojis or a QR code, choose recipients, then send text and files over encrypted peer connections." /><GroupTransfer /></ToolShell>;
}
