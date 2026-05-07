import { Router, type IRouter } from "express";
import multer from "multer";
import { eq, sql } from "drizzle-orm";
import { db, documentsTable } from "@workspace/db";
import {
  ListDocumentsQueryParams,
  GetDocumentParams,
  DeleteDocumentParams,
  AnalyzeDocumentParams,
} from "@workspace/api-zod";
import { extractTextFromPdf } from "../../lib/extractText";
import { extractLegalInformation } from "../../lib/legalExtractor";
import { logger } from "../../lib/logger";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post("/documents/upload", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  if (req.file.mimetype !== "application/pdf") {
    res.status(400).json({ error: "Only PDF files are supported" });
    return;
  }

  let pageCount: number | null = null;
  let rawText: string | null = null;

  try {
    const extracted = await extractTextFromPdf(req.file.buffer);
    rawText = extracted.text;
    pageCount = extracted.pageCount;
  } catch (err) {
    req.log.warn({ err }, "Could not extract text from PDF, storing without text");
  }

  const [doc] = await db.insert(documentsTable).values({
    fileName: req.file.originalname,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
    rawText,
    pageCount,
    status: "pending",
  }).returning();

  req.log.info({ docId: doc.id }, "Document uploaded");
  res.status(201).json(toDocumentDto(doc));
});

router.get("/documents/stats", async (req, res): Promise<void> => {
  const all = await db.select().from(documentsTable);
  const total = all.length;
  const pending = all.filter((d) => d.status === "pending").length;
  const processing = all.filter((d) => d.status === "processing").length;
  const completed = all.filter((d) => d.status === "completed").length;
  const failed = all.filter((d) => d.status === "failed").length;
  const confidences = all.filter((d) => d.overallConfidence !== null).map((d) => d.overallConfidence!);
  const avgConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;

  res.json({ total, pending, processing, completed, failed, avgConfidence });
});

router.get("/documents", async (req, res): Promise<void> => {
  const parsed = ListDocumentsQueryParams.safeParse(req.query);
  const status = parsed.success ? parsed.data.status : undefined;

  const docs = await db.select().from(documentsTable).orderBy(sql`${documentsTable.uploadedAt} DESC`);
  const filtered = status ? docs.filter((d) => d.status === status) : docs;

  res.json(filtered.map(toDocumentDto));
});

router.get("/documents/:id", async (req, res): Promise<void> => {
  const params = GetDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, params.data.id));
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  res.json(toDocumentWithAnalysisDto(doc));
});

router.delete("/documents/:id", async (req, res): Promise<void> => {
  const params = DeleteDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [doc] = await db.delete(documentsTable).where(eq(documentsTable.id, params.data.id)).returning();
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/documents/:id/analyze", async (req, res): Promise<void> => {
  const params = AnalyzeDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, params.data.id));
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  if (!doc.rawText) {
    res.status(400).json({ error: "Document has no extractable text for analysis" });
    return;
  }

  await db.update(documentsTable).set({ status: "processing" }).where(eq(documentsTable.id, doc.id));

  try {
    req.log.info({ docId: doc.id }, "Starting legal extraction");
    const analysis = await extractLegalInformation(doc.rawText);

    const [updated] = await db.update(documentsTable).set({
      status: "completed",
      analysisJson: analysis as unknown as Record<string, unknown>,
      overallConfidence: analysis.overallConfidence ?? null,
      analyzedAt: new Date(),
    }).where(eq(documentsTable.id, doc.id)).returning();

    req.log.info({ docId: doc.id, confidence: analysis.overallConfidence }, "Legal extraction completed");
    res.json(toDocumentWithAnalysisDto(updated));
  } catch (err) {
    req.log.error({ err, docId: doc.id }, "Legal extraction failed");
    const [failed] = await db.update(documentsTable).set({ status: "failed" }).where(eq(documentsTable.id, doc.id)).returning();
    res.status(500).json({ error: "Analysis failed. Please try again." });
  }
});

function toDocumentDto(doc: typeof documentsTable.$inferSelect) {
  return {
    id: doc.id,
    fileName: doc.fileName,
    fileSize: doc.fileSize,
    status: doc.status,
    pageCount: doc.pageCount,
    uploadedAt: doc.uploadedAt?.toISOString() ?? null,
    analyzedAt: doc.analyzedAt?.toISOString() ?? null,
  };
}

function toDocumentWithAnalysisDto(doc: typeof documentsTable.$inferSelect) {
  return {
    ...toDocumentDto(doc),
    analysis: doc.analysisJson ?? null,
  };
}

export default router;
