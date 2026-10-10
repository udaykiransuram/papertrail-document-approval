import { useEffect, useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import { api, ApiError, messageOf } from "../api";
import { ErrorNotice, FileIcon, formatBytes } from "../components/ui";
import type { Submission } from "../types";

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
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
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
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  function choose(next?: File) {
    if (!next) return;
    const failure = validateFile(next);
    setError(failure);
    setFile(failure ? null : next);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a document to submit.");
      return;
    }
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
      className="upload-dialog"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <div className="dialog-header">
        <div>
          <h2>Submit a document</h2>
          <p>Give your work a clear next step.</p>
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
      <form onSubmit={submit}>
        {error && <ErrorNotice message={error} />}
        {demo && (
          <div className="sample-picker">
            <strong>Start with a sample</strong>
            <p>Choose a document below, then submit it for review.</p>
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
        <p className="form-hint">
          {demo
            ? "After submitting, switch to Reviewer to open this document and make a decision."
            : "Your document will be sent to Morgan Reed for review."}
        </p>
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || !file || !title.trim()}
          >
            {loadingSample
              ? "Loading sample…"
              : busy
                ? "Uploading document…"
                : "Submit for review"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
