import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import type { DocType } from "./documents";

/** A photographed page, prepared for upload (2000 px, JPEG), kept on the phone until the upload succeeds. */
export interface Page {
  uri: string;
  width: number;
  height: number;
  bytes: number;
}

export interface CaptureBatch {
  id: string;
  batchNo: string;
  productName: string;
}

export interface CaptureStep {
  id: string;
  stepType: string;
  supplierName?: string | null;
}

export interface CaptureState {
  batch?: CaptureBatch;
  step?: CaptureStep;
  pages: Page[];
  docType?: DocType;
  /** The document the pages became, once uploaded: the form shows these pages for it. */
  documentId?: string;
}

interface CaptureContextValue extends CaptureState {
  chooseBatch: (batch: CaptureBatch) => void;
  chooseStep: (step: CaptureStep) => void;
  addPage: (page: Page) => void;
  replacePage: (index: number, page: Page) => void;
  removePage: (index: number) => void;
  swapPages: (a: number, b: number) => void;
  setDocType: (type: DocType | undefined) => void;
  uploaded: (documentId: string) => void;
  /** A new document from the start; also on sign-out ("yüklenmemiş sayfalar telefondan silinir"). */
  reset: () => void;
}

const EMPTY: CaptureState = { pages: [] };
const CaptureContext = createContext<CaptureContextValue | undefined>(undefined);

/** The document being photographed, across the steps of the flow (batch → step → camera → review → upload → form). */
export function CaptureProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CaptureState>(EMPTY);
  const value = useMemo<CaptureContextValue>(
    () => ({
      ...state,
      chooseBatch: (batch) => setState({ ...EMPTY, batch }),
      chooseStep: (step) => setState((s) => ({ ...s, step, pages: [], documentId: undefined })),
      addPage: (page) => setState((s) => ({ ...s, pages: [...s.pages, page] })),
      replacePage: (index, page) => setState((s) => ({ ...s, pages: s.pages.map((p, i) => (i === index ? page : p)) })),
      removePage: (index) => setState((s) => ({ ...s, pages: s.pages.filter((_, i) => i !== index) })),
      swapPages: (a, b) =>
        setState((s) => {
          const pages = [...s.pages];
          [pages[a], pages[b]] = [pages[b], pages[a]];
          return { ...s, pages };
        }),
      setDocType: (docType) => setState((s) => ({ ...s, docType })),
      uploaded: (documentId) => setState((s) => ({ ...s, documentId })),
      reset: () => setState(EMPTY),
    }),
    [state],
  );
  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}

export function useCapture(): CaptureContextValue {
  const value = useContext(CaptureContext);
  if (!value) throw new Error("useCapture outside CaptureProvider");
  return value;
}
