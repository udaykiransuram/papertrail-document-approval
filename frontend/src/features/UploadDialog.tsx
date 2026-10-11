import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Eye, UploadCloud, X } from "lucide-react";
import { api, ApiError, messageOf } from "../api";
import { ErrorNotice, FileIcon, formatBytes, Loading } from "../components/ui";
import type { Submission } from "../types";
const DocumentViewer = lazy(() => import("./viewer/DocumentViewer"));

export function validateFile(file: File) {
  if (!/\.(pdf|docx)$/i.test(file.name))
    return "Choose a PDF or Word (.docx) document.";
  if (!file.size) return "Choose a document that is not empty.";
  if (file.size > 4_000_000) return "Documents must be 4 MB or smaller.";
  return "";
}
export function UploadDialog({
  onClose,
  onCreated,
  demo = false,
}: {
  onClose: () => void;
  onCreated: (submission: Submission) => void;
  demo?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const formId = useId();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  async function useSample(kind: "pdf" | "docx") {
    setBusy(true);
    setLoadingSample(true);
    setError("");
    const filename =
      kind === "pdf" ? "project-proposal.pdf" : "project-brief.docx";
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}samples/${filename}`,
      );
      if (!response.ok)
        throw new Error("The sample could not be loaded. Please try again.");
      choose(new File([await response.blob()], filename));
      setTitle(
        (previous) =>
          previous || (kind === "pdf" ? "Project proposal" : "Project brief"),
      );
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
      setLoadingSample(false);
    }
  }
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);
  useEffect(() => {
    if (previewing) heading.current?.focus();
    else titleInput.current?.focus();
  }, [previewing]);
  function choose(next?: File) {
    if (!next) return;
    const failure = validateFile(next);
    setError(failure);
    setPreviewReady(false);
    setFile(failure ? null : next);
  }
  function preview(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !file || !title.trim()) return;
    setError("");
    setPreviewReady(false);
    setPreviewing(true);
  }
  async function submit() {
    if (busy || !file || !previewReady || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      onCreated(await api.create(title.trim(), file));
    } catch (e) {
      const fields =
        e instanceof ApiError
          ? Object.values(e.fields || {})
              .flat()
              .join(" ")
          : "";
      setError(fields || messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className={`upload-dialog${previewing ? " upload-preview-dialog" : ""}`}
      aria-labelledby={headingId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="dialog-header">
        <div>
          <span className="upload-step">
            Step {previewing ? "2" : "1"} of 2
          </span>
          <h2 id={headingId} ref={heading} tabIndex={-1}>
            {previewing ? "Preview your submission" : "Submit a document"}
          </h2>
          <p>
            {previewing
              ? "Check the document, then send it for review."
              : "Add the details. You’ll preview the file next."}
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Close upload"
          onClick={onClose}
          disabled={busy}
        >
          <X size={21} />
        </button>
      </div>
      {error && <ErrorNotice message={error} />}
      {previewing && file ? (
        <div className="upload-preview-body">
          <div className="upload-preview-title">
            <span>Document title</span>
            <strong>{title.trim()}</strong>
          </div>
          <Suspense fallback={<Loading label="Preparing preview…" />}>
            <DocumentViewer file={file} onReady={setPreviewReady} />
          </Suspense>
          <p className="form-hint">
            {file.name.toLowerCase().endsWith(".docx")
              ? "Word previews may differ from Microsoft Word’s exact layout."
              : "Scroll through the pages or zoom in to check the details."}
          </p>
        </div>
      ) : (
        <form id={formId} onSubmit={preview}>
          {demo && (
            <div className="sample-picker">
              <strong>Start with a sample</strong>
              <p>Choose a document below to preview before submitting.</p>
              <div>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void useSample("pdf")}
                >
                  Use sample PDF
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void useSample("docx")}
                >
                  Use sample Word
                </button>
              </div>
              {loadingSample && <span role="status">Loading sample…</span>}
            </div>
          )}
          <label htmlFor="document-title">Document title</label>
          <input
            ref={titleInput}
            id="document-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Q4 project proposal"
            required
            maxLength={200}
            disabled={busy}
          />
          <label htmlFor="document-file">Document</label>
          <label
            className={`dropzone ${file ? "has-file" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy) {
                if (e.dataTransfer.files.length > 1)
                  setError("Choose exactly one document.");
                else choose(e.dataTransfer.files[0]);
              }
            }}
          >
            <input
              id="document-file"
              type="file"
              accept=".pdf,.docx"
              disabled={busy}
              onChange={(e) => choose(e.target.files?.[0])}
            />
            {file ? (
              <>
                <FileIcon name={file.name} />
                <strong>{file.name}</strong>
                <span>{formatBytes(file.size)} · Click to replace</span>
              </>
            ) : (
              <>
                <UploadCloud size={30} />
                <strong>Click to upload or drag a file here</strong>
                <span>PDF or DOCX · Up to 4 MB</span>
              </>
            )}
          </label>
        </form>
      )}
      <div className="upload-footer">
        <p className="form-hint">
          {previewing
            ? "Nothing is submitted until you select Submit for review."
            : "Your file stays on this device until you submit it."}
        </p>
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              if (previewing) {
                setPreviewing(false);
                setError("");
              } else onClose();
            }}
          >
            {previewing && <ArrowLeft size={16} aria-hidden="true" />}
            {previewing ? "Back to details" : "Cancel"}
          </button>
          {previewing ? (
            <button
              className="button primary"
              disabled={busy || !previewReady}
              onClick={() => void submit()}
            >
              {busy ? "Uploading document…" : "Submit for review"}
            </button>
          ) : (
            <button
              form={formId}
              type="submit"
              className="button primary"
              disabled={busy || !file || !title.trim()}
            >
              <Eye size={17} aria-hidden="true" />
              {loadingSample ? "Loading sample…" : "Preview document"}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
