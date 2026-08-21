"use client";

import { ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { ArrowUpRight } from "@phosphor-icons/react/ArrowUpRight";
import { ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { ArrowsLeftRight } from "@phosphor-icons/react/ArrowsLeftRight";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { Scan } from "@phosphor-icons/react/Scan";
import { Stack } from "@phosphor-icons/react/Stack";
import { UsersThree } from "@phosphor-icons/react/UsersThree";
import { useMemo, useState } from "react";

type ToolCategory = "image" | "transfer" | "document";
type ActiveCategory = "all" | ToolCategory;

const tools = [
  {
    number: "01",
    href: "/toolbox/image-converter/",
    title: "Image Converter",
    description: "Convert HEIC, BMP, TIFF, camera RAW and web images. Resize and adjust quality locally.",
    status: "READY",
    category: "image" as const,
    categoryLabel: "IMAGE",
    keywords: "convert format heic bmp tiff raw png jpeg webp resize quality",
    Icon: ArrowsClockwise,
  },
  {
    number: "02",
    href: "/toolbox/image-rotate/",
    title: "Image Rotate",
    description: "Rotate, flip and straighten an image, then export a clean new file.",
    status: "READY",
    category: "image" as const,
    categoryLabel: "IMAGE",
    keywords: "rotate turn flip mirror straighten image",
    Icon: ArrowClockwise,
  },
  {
    number: "03",
    href: "/toolbox/image-overlay/",
    title: "Image Overlay",
    description: "Blend two images with precise position, scale, rotation and opacity controls.",
    status: "READY",
    category: "image" as const,
    categoryLabel: "IMAGE",
    keywords: "overlay blend layer composite image opacity position scale",
    Icon: Stack,
  },
  {
    number: "04",
    href: "/toolbox/lan-transfer/",
    title: "Pair Transfer",
    description: "Send text and files directly between two browsers over a private connection.",
    status: "LAB",
    category: "transfer" as const,
    categoryLabel: "TRANSFER",
    keywords: "pair transfer send receive file text browser device private webrtc",
    Icon: ArrowsLeftRight,
  },
  {
    number: "05",
    href: "/toolbox/group-transfer/",
    title: "Group Transfer",
    description: "Connect up to four browsers and choose exactly who receives each file.",
    status: "LAB",
    category: "transfer" as const,
    categoryLabel: "TRANSFER",
    keywords: "group transfer send receive file browser devices recipients webrtc",
    Icon: UsersThree,
  },
  {
    number: "06",
    href: "/toolbox/document-scanner/",
    title: "Document Scanner",
    description: "Fix corners, clean every page and export images or one PDF.",
    status: "LAB",
    category: "document" as const,
    categoryLabel: "DOCUMENT",
    keywords: "document scan camera pdf perspective corners pages export",
    Icon: Scan,
  },
];

const categories: Array<{ id: ActiveCategory; label: string }> = [
  { id: "all", label: "ALL" },
  { id: "image", label: "IMAGE" },
  { id: "transfer", label: "TRANSFER" },
  { id: "document", label: "DOCUMENT" },
];

export function ToolSelector() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ActiveCategory>("all");

  const categoryCounts = useMemo(
    () => ({
      all: tools.length,
      image: tools.filter((tool) => tool.category === "image").length,
      transfer: tools.filter((tool) => tool.category === "transfer").length,
      document: tools.filter((tool) => tool.category === "document").length,
    }),
    [],
  );

  const visibleTools = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tools.filter((tool) => {
      const matchesCategory = category === "all" || tool.category === category;
      const searchableText = `${tool.title} ${tool.description} ${tool.keywords}`.toLowerCase();
      return matchesCategory && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });
  }, [category, query]);

  function resetFilters() {
    setQuery("");
    setCategory("all");
  }

  return (
    <div className="catalog-page">
      <section className="catalog-layout" aria-labelledby="catalog-title">
        <div className="catalog-intro">
          <p className="catalog-kicker">Choose by task</p>
          <h1 id="catalog-title">What do you<br />need to do?</h1>
          <span className="catalog-rule" aria-hidden="true" />
        </div>

        <div className="catalog-discovery">
          <form className="catalog-search" role="search" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="tool-search">Find a tool</label>
            <div className="catalog-search-row">
              <input
                id="tool-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by action, format or device..."
                autoComplete="off"
              />
              <button type="submit" aria-label="Search tools">
                <MagnifyingGlass size={29} weight="regular" aria-hidden="true" />
              </button>
            </div>
          </form>

          <div className="catalog-filter-row">
            <span className="catalog-filter-label">Filter</span>
            <div className="catalog-filters" aria-label="Filter tools by category">
              {categories.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={category === item.id ? "active" : ""}
                  aria-pressed={category === item.id}
                  aria-controls="tool-catalog"
                  onClick={() => setCategory(item.id)}
                >
                  {item.label} {String(categoryCounts[item.id]).padStart(2, "0")}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="tool-catalog" className="tool-catalog" aria-label="Available tools" aria-live="polite">
        {visibleTools.map((tool) => (
          <a className="catalog-card" data-category={tool.category} href={tool.href} key={tool.href}>
            <span className="catalog-card-accent" aria-hidden="true" />
            <div className="catalog-card-heading">
              <span className="catalog-card-icon" aria-hidden="true">
                <tool.Icon size={30} weight="regular" />
              </span>
              <div>
                <span className="catalog-card-meta">{tool.categoryLabel} / {tool.number}</span>
                <h2>{tool.title}</h2>
              </div>
              <span className="catalog-card-status">{tool.status}</span>
            </div>
            <p>{tool.description}</p>
            <div className="catalog-card-action">
              <span>Open tool</span>
              <ArrowUpRight size={25} weight="regular" aria-hidden="true" />
            </div>
          </a>
        ))}
      </section>

      {visibleTools.length === 0 && (
        <section className="catalog-empty" role="status">
          <strong>No matching tools.</strong>
          <p>Try a different action or return to the complete list.</p>
          <button type="button" onClick={resetFilters}>Reset filters</button>
        </section>
      )}

      <section className="catalog-bottomline" aria-label="Toolbox privacy summary">
        <span>Files stay in your browser</span>
        <span>{String(visibleTools.length).padStart(2, "0")} tools shown</span>
        <span>Pick / open / get it done</span>
      </section>
    </div>
  );
}
