import { createRequire } from "node:module";
import { logger } from "./logger";

const _require = createRequire(import.meta.url);

type PdfParseResult = { text: string; numpages: number };
type PdfParseFn = (buf: Buffer, options?: Record<string, unknown>) => Promise<PdfParseResult>;

export async function extractTextFromPdf(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  // pdf-parse v1 exports a function directly via module.exports
  const pdfParse = _require("pdf-parse") as PdfParseFn;

  const result = await pdfParse(buffer);

  logger.info({ pageCount: result.numpages, textLength: result.text.length }, "PDF text extracted");

  return {
    text: result.text,
    pageCount: result.numpages,
  };
}
