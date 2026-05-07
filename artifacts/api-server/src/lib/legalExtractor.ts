import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "./logger";

export interface ExtractedParty {
  role: string;
  name: string;
  confidence: number;
}

export interface ExtractedDirective {
  type: string;
  description: string;
  sourceText: string;
  confidence: number;
}

export interface HighlightedSection {
  label: string;
  text: string;
  confidence: number;
  category: string;
}

export interface LegalExtractionResult {
  caseNumber: string | null;
  caseNumberConfidence: number | null;
  caseName: string | null;
  caseNameConfidence: number | null;
  courtName: string | null;
  courtNameConfidence: number | null;
  judgmentDate: string | null;
  judgmentDateConfidence: number | null;
  judge: string | null;
  judgeConfidence: number | null;
  parties: ExtractedParty[];
  directives: ExtractedDirective[];
  highlights: HighlightedSection[];
  summary: string | null;
  overallConfidence: number | null;
}

const SYSTEM_PROMPT = `You are a specialized legal document analysis AI. Your task is to extract structured information from court judgment documents.

Extract the following information with high precision:
1. Case number/reference number
2. Case name (typically "Plaintiff v. Defendant")
3. Court name
4. Judgment date
5. Presiding judge(s)
6. All parties involved with their roles (Plaintiff, Defendant, Appellant, Respondent, Intervenor, etc.)
7. Key directives/orders issued by the court
8. Important highlighted sections (with categories like "holding", "reasoning", "procedural_history", "facts", "legal_standard", "remedy")
9. A brief executive summary

For each piece of extracted information, provide a confidence score between 0.0 and 1.0 based on how certain you are about the extraction.

Always respond with valid JSON in exactly this structure:
{
  "caseNumber": "string or null",
  "caseNumberConfidence": number between 0 and 1,
  "caseName": "string or null",
  "caseNameConfidence": number between 0 and 1,
  "courtName": "string or null",
  "courtNameConfidence": number between 0 and 1,
  "judgmentDate": "ISO date string or null",
  "judgmentDateConfidence": number between 0 and 1,
  "judge": "string or null",
  "judgeConfidence": number between 0 and 1,
  "parties": [
    { "role": "string", "name": "string", "confidence": number }
  ],
  "directives": [
    {
      "type": "string (e.g. ORDER, INJUNCTION, AWARD, DISMISSAL)",
      "description": "string describing the directive",
      "sourceText": "verbatim text from document",
      "confidence": number
    }
  ],
  "highlights": [
    {
      "label": "string",
      "text": "relevant excerpt from document",
      "confidence": number,
      "category": "holding|reasoning|procedural_history|facts|legal_standard|remedy"
    }
  ],
  "summary": "string - 2-4 sentence executive summary",
  "overallConfidence": number between 0 and 1
}`;

export async function extractLegalInformation(documentText: string): Promise<LegalExtractionResult> {
  // Allow up to ~300 pages worth of text (~250,000 chars). Claude's context window supports this.
  const MAX_CHARS = 250000;
  const truncatedText = documentText.length > MAX_CHARS
    ? documentText.slice(0, MAX_CHARS) + "\n\n[Document truncated — remaining pages not included]"
    : documentText;

  logger.info({ textLength: truncatedText.length }, "Sending document to Anthropic for analysis");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Please analyze the following court judgment document and extract the requested structured information:\n\n${truncatedText}`,
      },
    ],
  });

  const rawContent = message.content[0];
  if (rawContent.type !== "text") {
    throw new Error("Unexpected response type from Anthropic");
  }

  const jsonText = rawContent.text.trim();
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Anthropic response");
  }

  const result = JSON.parse(jsonMatch[0]) as LegalExtractionResult;
  logger.info({ overallConfidence: result.overallConfidence }, "Legal extraction complete");

  return result;
}
