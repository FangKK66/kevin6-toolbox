"use client";

import { useRef, useState } from "react";

export function FileDrop({ onFile, label = "Choose an image", accept = "image/*" }: { onFile: (file: File) => void; label?: string; accept?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <label
      aria-label={label}
      className={`file-drop ${dragging ? "dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files); }}
    >
      <input ref={inputRef} type="file" accept={accept} onChange={(event) => pick(event.target.files)} />
      <span><strong>{label}</strong><small>Drop a file here or tap to browse</small></span>
    </label>
  );
}
