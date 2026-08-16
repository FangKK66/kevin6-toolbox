import { ToolShell } from "./components/ToolShell";

const tools = [
  {
    number: "01",
    href: "/toolbox/image-converter/",
    title: "Image Converter",
    description: "Convert HEIC, BMP, TIFF, camera RAW and web images locally. Resize, tune quality and stay private.",
    status: "READY",
    tone: "acid",
  },
  {
    number: "02",
    href: "/toolbox/image-rotate/",
    title: "Image Rotate",
    description: "Rotate, flip and straighten an image, then export a completely new file.",
    status: "READY",
    tone: "paper",
  },
  {
    number: "03",
    href: "/toolbox/image-overlay/",
    title: "Image Overlay",
    description: "Place one image over another with position, scale, rotation and opacity controls.",
    status: "READY",
    tone: "orange",
  },
  {
    number: "04",
    href: "/toolbox/lan-transfer/",
    title: "Pair Transfer",
    description: "Send text and files directly between two browsers using a private encrypted connection.",
    status: "LAB",
    tone: "blue",
  },
  {
    number: "05",
    href: "/toolbox/group-transfer/",
    title: "Group Transfer",
    description: "Connect up to four browsers, choose recipients and transfer text or files directly.",
    status: "LAB",
    tone: "acid",
  },
  {
    number: "06",
    href: "/toolbox/document-scanner/",
    title: "Document Scanner",
    description: "Fix document corners, clean up every page and export images or a PDF without uploading your files.",
    status: "LAB",
    tone: "paper",
  },
];

export default function ToolboxHome() {
  return (
    <ToolShell>
      <section className="catalog-hero">
        <div>
          <p className="kicker"><span /> Local-first utility shelf</p>
          <h1>Pick a tool.<br /><em>Get it done.</em></h1>
        </div>
        <p className="hero-note">
          Six focused tools. No accounts, no uploads, no clutter. Your files stay private by default.
        </p>
      </section>

      <section className="tool-catalog" aria-label="Available tools">
        {tools.map((tool) => (
          <a className={`catalog-card ${tool.tone}`} href={tool.href} key={tool.href}>
            <div className="card-topline">
              <span>{tool.number}</span>
              <span>{tool.status}</span>
            </div>
            <div>
              <h2>{tool.title}</h2>
              <p>{tool.description}</p>
            </div>
            <span className="card-arrow" aria-hidden="true">↗</span>
          </a>
        ))}
      </section>

      <section className="privacy-strip">
        <strong>LOCAL BY DEFAULT</strong>
        <p>Image processing happens inside your browser. Nothing is uploaded to Kevin6.</p>
        <span>v1.0</span>
      </section>
    </ToolShell>
  );
}
