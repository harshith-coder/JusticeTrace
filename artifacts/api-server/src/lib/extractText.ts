import { createRequire } from "node:module";
import { logger } from "./logger";

const require = createRequire(import.meta.url);

export async function extractTextFromPdf(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  try {
    // pdf-parse is CJS-only; require it at runtime to avoid ESM/CJS mismatch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
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
