import { ToolSelector } from "./components/ToolSelector";
import { ToolShell } from "./components/ToolShell";

export default function ToolboxHome() {
  return (
    <ToolShell catalog>
      <ToolSelector />
    </ToolShell>
  );
}
