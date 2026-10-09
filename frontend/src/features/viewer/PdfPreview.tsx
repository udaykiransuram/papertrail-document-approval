import { useMemo, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loading } from "../../components/ui";
import type { PageSize } from "./sizing";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export default function PdfPreview({
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
  const [pages, setPages] = useState(0);
  // PDF.js transfers the buffer into its worker. Own a copy, stable across zoom changes.
  const file = useMemo(() => ({ data: new Uint8Array(data.slice(0)) }), [data]);
  return (
    <Document
      file={file}
      loading={<Loading label="Rendering PDF…" />}
      onLoadSuccess={async (pdf) => {
        setPages(pdf.numPages);
        try {
          const firstPage = await pdf.getPage(1);
          const { width, height } = firstPage.getViewport({ scale: 96 / 72 });
          onSize({ width, height });
        } catch {
          onError(
            "This PDF could not be rendered. Please try another document.",
          );
        }
      }}
      onLoadError={() =>
        onError("This PDF could not be rendered. Please try another document.")
      }
      onPassword={() => onError("Password-protected PDFs are not supported.")}
    >
      <div className="pdf-pages">
        {Array.from({ length: pages }, (_, i) => (
          <div className="pdf-page" key={i}>
            <Page
              pageNumber={i + 1}
              width={width}
              renderAnnotationLayer={false}
              onRenderSuccess={() => {
                if (i === 0) onReady(true);
              }}
              onRenderError={() =>
                onError("A page could not be displayed. Please try again.")
              }
              loading={<Loading label={`Rendering page ${i + 1}…`} />}
            />
            <span className="page-caption">
              Page {i + 1} of {pages}
            </span>
          </div>
        ))}
      </div>
    </Document>
  );
}
