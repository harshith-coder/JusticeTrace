import { createRequire } from "node:module";
import { logger } from "./logger";

const _require = createRequire(import.meta.url);

export async function extractTextFromPdf(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  try {
    // pdf-parse is CJS-only; require it at runtime to avoid ESM/CJS mismatch.
    // Some versions export the function as .default, others as the module itself.
    const pdfParseModule = _require("pdf-parse");
    const pdfParse = (typeof pdfParseModule === "function" ? pdfParseModule : pdfParseModule.default) as (
      buf: Buffer
    ) => Promise<{ text: string; numpages: number }>;

    const result = await pdfParse(buffer);
    return {
      text: result.text,
      pageCount: result.numpages,
    };
  } catch (err) {
    logger.error({ err }, "Failed to extract text from PDF");
    throw new Error("Failed to extract text from PDF");
  }
}
