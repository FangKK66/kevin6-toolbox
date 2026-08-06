"use client";

import { downloadBlob, shareImage, type PreparedImage } from "../lib/image";

type MobileSaveActionsProps = {
  result: PreparedImage;
  onStatus: (message: string) => void;
};

export function MobileSaveActions({ result, onStatus }: MobileSaveActionsProps) {
  async function openShareSheet() {
    onStatus("Choose Save Image, Photos or a gallery app…");
    try {
      await shareImage(result);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        onStatus("Ready to save or share");
        return;
      }
      onStatus(error instanceof Error ? error.message : "The share menu could not be opened.");
    }
  }

  return (
    <div className="mobile-save-actions">
      <button className="button primary" onClick={openShareSheet}>Save or share</button>
      <button className="button" onClick={() => downloadBlob(result.blob, result.filename)}>Download instead</button>
      <p className="field-label">iPhone: choose Save Image. Android: choose Photos or your gallery app.</p>
    </div>
  );
}
