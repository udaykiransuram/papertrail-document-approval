import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ChevronDown, Minus, Plus, RotateCw } from "lucide-react";
import { documentScale, type PageSize, type SizingMode } from "./sizing";
import { api, ApiError } from "../../api";
import {
  ErrorNotice,
  FileIcon,
  formatBytes,
  Loading,
} from "../../components/ui";
import type { Submission } from "../../types";
const PdfPreview = lazy(() => import("./PdfPreview"));
const DocxPreview = lazy(() => import("./DocxPreview"));

export default function DocumentViewer({
  item,
  file,
  onReady,
}: {
  onReady: (ready: boolean) => void;
} & ({ item: Submission; file?: never } | { file: File; item?: never })) {
  const filename = file ? file.name : item.original_filename;
  const size = file ? file.size : item.size;
  const isPdf = file
    ? /\.pdf$/i.test(file.name)
    : item.content_type === "application/pdf";
  const fileUrl = item?.file_url;
  const [data, setData] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(100);
  const [mode, setMode] = useState<SizingMode>(file ? "page" : "auto");
  const [pageSize, setPageSize] = useState<PageSize>({
    width: 816,
    height: 1056,
  });
  const [attempt, setAttempt] = useState(0);
  const canvas = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<PageSize>({
    width: 680,
    height: 700,
  });
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setAvailable({
        width: Math.max(1, Math.floor(entry.contentRect.width)),
        height: Math.max(1, Math.floor(entry.contentRect.height)),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = documentScale(mode, pageSize, available, zoom);
  const percentage = Math.round(scale * 100);
  const documentWidth = Math.floor(pageSize.width * scale);
  function changeZoom(delta: number) {
    setZoom(Math.max(10, Math.min(300, percentage + delta)));
    setMode("custom");
  }
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    onReady(false);
    (async () => {
      try {
        const bytes = file
          ? await file.arrayBuffer()
          : await api.document(fileUrl!, controller.signal);
        if (!controller.signal.aborted) setData(bytes);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof ApiError
              ? "The document could not be loaded. Please try again."
              : e instanceof Error
                ? e.message
                : "The preview could not be loaded.",
          );
      }
    })();
    return () => controller.abort();
  }, [fileUrl, file, attempt, onReady]);
  function failure(message: string) {
    setError(message);
    onReady(false);
  }
  return (
    <section className="viewer-panel" aria-label="Document viewer">
      <div className="viewer-toolbar">
        <div className="viewer-filename">
          <FileIcon name={filename} />
          <span>
            <strong>{filename}</strong>
            <small>
              {isPdf ? "PDF" : "DOCX"} · {formatBytes(size)}
            </small>
          </span>
        </div>
        <div className="viewer-sizing">
          <span className="select-wrap sizing-select">
            <select
              aria-label="Document size"
              value={mode}
              onChange={(event) => {
                setMode(event.target.value as SizingMode);
                canvas.current?.scrollTo({ top: 0, left: 0 });
              }}
            >
              <option value="auto">Automatic</option>
              <option value="page">Fit page</option>
              <option value="width">Fit width</option>
              <option value="actual">Actual size</option>
              {mode === "custom" && <option value="custom">Custom zoom</option>}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </span>
          <div className="zoom-controls" aria-label="Document zoom">
            <button
              className="icon-button"
              aria-label="Zoom out"
              disabled={percentage <= 10}
              onClick={() => changeZoom(-10)}
            >
              <Minus size={17} />
            </button>
            <span aria-live="polite">{percentage}%</span>
            <button
              className="icon-button"
              aria-label="Zoom in"
              disabled={percentage >= 300}
              onClick={() => changeZoom(10)}
            >
              <Plus size={17} />
            </button>
          </div>
        </div>
      </div>
      <div className="document-canvas" ref={canvas}>
        {error ? (
          <div className="preview-error">
            <ErrorNotice message={error} />
            <button
              className="button secondary"
              onClick={() => setAttempt((v) => v + 1)}
            >
              <RotateCw size={16} />
              Retry preview
            </button>
          </div>
        ) : !data ? (
          <Loading
            label={
              file ? "Loading document preview…" : "Loading private document…"
            }
          />
        ) : (
          <Suspense fallback={<Loading label="Rendering document…" />}>
            {isPdf ? (
              <PdfPreview
                data={data}
                width={documentWidth}
                onSize={setPageSize}
                onReady={onReady}
                onError={failure}
              />
            ) : (
              <DocxPreview
                data={data}
                width={documentWidth}
                onSize={setPageSize}
                onReady={onReady}
                onError={failure}
              />
            )}
          </Suspense>
        )}
      </div>
    </section>
  );
}
