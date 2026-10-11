import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { Loading } from "../../components/ui";
import type { PageSize } from "./sizing";

export default function DocxPreview({
  data,
  width,
  onSize,
  onReady,
  onError,
}: {
  data: ArrayBuffer;
  width: number;
  onSize: (size: PageSize) => void;
  onReady: (ready: boolean) => void;
  onError: (message: string) => void;
}) {
  const [markup, setMarkup] = useState("");
  const iframe = useRef<HTMLIFrameElement>(null);
  function resize() {
    const frame = iframe.current;
    const body = frame?.contentDocument?.body;
    if (body && frame) {
      const pages = Array.from(
        body.querySelectorAll<HTMLElement>("section.docx"),
      );
      const nativeWidth = Math.max(1, ...pages.map((page) => page.offsetWidth));
      const scale = width / nativeWidth;
      body.style.width = `${nativeWidth}px`;
      body.style.zoom = String(scale);
      const height = Math.max(
        1,
        ...pages.map((page) => page.offsetTop + page.offsetHeight),
      );
      frame.style.height = `${Math.ceil(height * scale + 24)}px`;
    }
  }
  useEffect(resize, [width]);
  useEffect(() => {
    let active = true;
    const container = document.createElement("div");
    const styles = document.createElement("div");
    renderAsync(data, container, styles, {
      inWrapper: false,
      useBase64URL: true,
      renderAltChunks: false,
      renderComments: false,
    })
      .then(() => {
        // Word's Symbol-font bullet is a private-use glyph absent on many devices.
        // Normalize only rules containing that bullet; preserve numbered lists and other fonts.
        const previewStyles = styles.innerHTML.replace(
          /[^{}]+\{[^{}]*\uF0B7[^{}]*\}/g,
          (rule) =>
            rule
              .replaceAll("\uF0B7", "•")
              .replace(
                /font-family:[^;]+;/g,
                "font-family: Arial, sans-serif;",
              ),
        );
        if (active)
          setMarkup(
            `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline';"><style>body{margin:0;background:#e9edf0;font-family:Arial}section.docx{background:white;margin:0 auto 20px!important;box-shadow:0 1px 5px #0001}a{pointer-events:none}</style>${previewStyles}</head><body>${container.innerHTML}</body></html>`,
          );
      })
      .catch(() => {
        if (active)
          onError(
            "This Word document could not be rendered. Please try another document.",
          );
      });
    return () => {
      active = false;
    };
  }, [data]);
  return markup ? (
    <iframe
      ref={iframe}
      className="docx-preview"
      title="Word document preview"
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
      srcDoc={markup}
      style={{ width: `${width}px` }}
      onLoad={() => {
        const firstPage =
          iframe.current?.contentDocument?.querySelector<HTMLElement>(
            "section.docx",
          );
        if (!firstPage) {
          onError(
            "This Word document could not be rendered. Please try another document.",
          );
          return;
        }
        onSize({
          width: firstPage.offsetWidth,
          height: firstPage.offsetHeight,
        });
        resize();
        onReady(true);
      }}
    />
  ) : (
    <Loading label="Rendering Word document…" />
  );
}
