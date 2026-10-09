import {
  Check,
  Clock3,
  FileText,
  Layers3,
  LoaderCircle,
  X,
} from "lucide-react";
import type { Status } from "../types";

export function Brand() {
  return (
    <span className="brand">
      <Layers3 size={30} strokeWidth={2} />
      <span>Papertrail</span>
    </span>
  );
}
export function StatusBadge({ status }: { status: Status }) {
  const Icon =
    status === "pending" ? Clock3 : status === "approved" ? Check : X;
  return (
    <span className={`status status-${status}`}>
      <Icon size={14} />
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}
export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {name
        .split(" ")
        .map((v) => v[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
export function FileIcon({ name }: { name: string }) {
  const word = name.toLowerCase().endsWith(".docx");
  return (
    <span className={`file-icon ${word ? "word" : ""}`}>
      <FileText size={28} />
      <b>{word ? "DOC" : "PDF"}</b>
    </span>
  );
}
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} />
      {label}
    </div>
  );
}
export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="error-notice" role="alert">
      {message}
    </div>
  );
}
export const formatBytes = (size: number) =>
  size >= 1_000_000
    ? `${(size / 1_000_000).toFixed(1)} MB`
    : `${Math.max(1, Math.round(size / 1000))} KB`;
export const formatDate = (date: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
