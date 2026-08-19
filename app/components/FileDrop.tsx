"use client";

import { useRef, useState } from "react";

type FileDropProps = {
  onFile?: (file: File) => void;
  onFiles?: (files: File[]) => void;
  label?: string;
  accept?: string;
  multiple?: boolean;
};

export function FileDrop({ onFile, onFiles, label = "Choose an image", accept = "image/*", multiple = false }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");

  function pick(files: FileList | null) {
    if (!files?.length) return;
    const picked = multiple ? Array.from(files) : [files[0]];
    setSelectedLabel(picked.length === 1 ? picked[0].name : `${picked.length} files selected`);
    onFiles?.(picked);
    onFile?.(picked[0]);
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
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} onChange={(event) => { pick(event.target.files); event.currentTarget.value = ""; }} />
      <span>
        <strong>{label}</strong>
        <small>{multiple ? "Drop files here or tap to browse" : "Drop a file here or tap to browse"}</small>
        {selectedLabel && <small className="selected-file" title={selectedLabel}>Selected: {selectedLabel}</small>}
      </span>
    </label>
  );
}
