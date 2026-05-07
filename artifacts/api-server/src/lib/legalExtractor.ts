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

export interface LegalCitation {
  text: string;
  type: string;
  confidence: number;
}

export interface KeyDate {
  event: string;
  date: string;
  confidence: number;
}

export interface MonetaryAward {
  type: string;
  amount: string;
  recipient: string;
  payer: string;
  confidence: number;
}

export interface LegalIssue {
  issue: string;
  resolution: string;
  confidence: number;
}

export interface CaseOutcome {
  prevailingParty: string | null;
  outcomeType: string | null;
  summary: string | null;
  confidence: number;
}

export interface AppealInfo {
  canAppeal: boolean | null;
  deadline: string | null;
  court: string | null;
  notes: string | null;
  confidence: number;
}

export interface ActionItem {
  action: string;
  responsible: string;
  deadline: string | null;
  priority: string;
  confidence: number;
}

export interface ProceduralStep {
  event: string;
  date: string | null;
  court: string | null;
  confidence: number;
}

export interface LegalExtractionResult {
  caseNumber: string | null;
  caseNumberConfidence: number | null;
  caseName: string | null;
  caseNameConfidence: number | null;
  courtName: string | null;
  courtNameConfidence: number | null;
  jurisdiction: string | null;
  jurisdictionConfidence: number | null;
  judgmentDate: string | null;
  judgmentDateConfidence: number | null;
  judge: string | null;
  judgeConfidence: number | null;
  parties: ExtractedParty[];
  directives: ExtractedDirective[];
  highlights: HighlightedSection[];
  legalCitations: LegalCitation[];
  keyDates: KeyDate[];
  monetaryAwards: MonetaryAward[];
  legalIssues: LegalIssue[];
  proceduralHistory: ProceduralStep[];
  outcome: CaseOutcome | null;
  appealInfo: AppealInfo | null;
  actionItems: ActionItem[];
  summary: string | null;
  overallConfidence: number | null;
}

const SYSTEM_PROMPT = `You are a specialized legal document analysis AI. Extract comprehensive structured information from court judgment documents with maximum detail and precision.

Extract ALL of the following categories. Provide a confidence score (0.0–1.0) for every field.

Always respond with valid JSON matching this exact structure:
{
  "caseNumber": "string or null",
  "caseNumberConfidence": 0.0-1.0,
  "caseName": "string or null",
  "caseNameConfidence": 0.0-1.0,
  "courtName": "full court name or null",
  "courtNameConfidence": 0.0-1.0,
  "jurisdiction": "e.g. Federal, State - California, International, etc. or null",
  "jurisdictionConfidence": 0.0-1.0,
  "judgmentDate": "ISO date string or null",
  "judgmentDateConfidence": 0.0-1.0,
  "judge": "full name(s) of presiding judge(s) or null",
  "judgeConfidence": 0.0-1.0,

  "parties": [
    { "role": "Plaintiff|Defendant|Appellant|Respondent|Petitioner|Intervenor|etc.", "name": "full name", "confidence": 0.0-1.0 }
  ],

  "directives": [
    {
      "type": "ORDER|INJUNCTION|AWARD|DISMISSAL|REMAND|DECLARATION|STAY|WRIT|SENTENCE|other",
      "description": "clear description of the directive",
      "sourceText": "verbatim excerpt from the document (max 300 chars)",
      "confidence": 0.0-1.0
    }
  ],

  "highlights": [
    {
      "label": "short label",
      "text": "relevant excerpt from the document",
      "confidence": 0.0-1.0,
      "category": "holding|reasoning|procedural_history|facts|legal_standard|remedy"
    }
  ],

  "legalCitations": [
    {
      "text": "full citation text e.g. Brown v. Board of Education, 347 U.S. 483 (1954)",
      "type": "case_law|statute|regulation|constitutional|treaty|other",
      "confidence": 0.0-1.0
    }
  ],

  "keyDates": [
    {
      "event": "description of the event e.g. 'Complaint filed', 'Hearing held', 'Judgment issued', 'Appeal deadline'",
      "date": "ISO date string or descriptive string like '30 days from judgment'",
      "confidence": 0.0-1.0
    }
  ],

  "monetaryAwards": [
    {
      "type": "damages|costs|attorney_fees|fine|restitution|compensation|other",
      "amount": "exact amount with currency e.g. '$150,000' or '€50,000'",
      "recipient": "party receiving the payment",
      "payer": "party ordered to pay",
      "confidence": 0.0-1.0
    }
  ],

  "legalIssues": [
    {
      "issue": "the legal question or issue before the court",
      "resolution": "how the court resolved it",
      "confidence": 0.0-1.0
    }
  ],

  "proceduralHistory": [
    {
      "event": "what happened procedurally e.g. 'Case filed in District Court', 'Appeal to Circuit Court', 'Remanded for retrial'",
      "date": "ISO date or descriptive string or null",
      "court": "court name or null",
      "confidence": 0.0-1.0
    }
  ],

  "outcome": {
    "prevailingParty": "name of the winning party or 'Mixed' or null",
    "outcomeType": "Judgment for Plaintiff|Judgment for Defendant|Dismissed|Remanded|Settled|Affirmed|Reversed|Mixed|other",
    "summary": "1-2 sentence plain-English outcome summary",
    "confidence": 0.0-1.0
  },

  "appealInfo": {
    "canAppeal": true|false|null,
    "deadline": "deadline string or null",
    "court": "appellate court to appeal to or null",
    "notes": "any relevant notes about appeal rights or null",
    "confidence": 0.0-1.0
  },

  "actionItems": [
    {
      "action": "specific action that must be taken",
      "responsible": "which party or entity must take the action",
      "deadline": "deadline string or null",
      "priority": "high|medium|low",
      "confidence": 0.0-1.0
    }
  ],

  "summary": "3-5 sentence executive summary of the entire judgment",
  "overallConfidence": 0.0-1.0
}

Be thorough — extract as many citations, dates, issues, and action items as you can find. If information is genuinely absent from the document, use empty arrays or null values. Never fabricate information.`;

export async function extractLegalInformation(documentText: string): Promise<LegalExtractionResult> {
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
        content: `Analyze the following court judgment document and extract all requested information:\n\n${truncatedText}`,
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
