import { ToolShell } from "./components/ToolShell";

const tools = [
  {
    number: "01",
    href: "/toolbox/image-converter/",
    title: "Image Converter",
    description: "Convert PNG, JPEG and WebP locally. Resize, tune quality and keep your files private.",
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
    title: "LAN Transfer",
    description: "Send text and files directly between two browsers using an encrypted peer connection.",
    status: "LAB",
    tone: "blue",
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
          Four focused tools. No accounts, no uploads, no clutter. Your files stay on your device.
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
