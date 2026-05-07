import { pgTable, text, serial, timestamp, integer, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull().default("application/pdf"),
  rawText: text("raw_text"),
  status: text("status").notNull().default("pending"),
  pageCount: integer("page_count"),
  analysisJson: jsonb("analysis_json"),
  overallConfidence: real("overall_confidence"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({
  id: true,
  uploadedAt: true,
  analyzedAt: true,
});

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;
