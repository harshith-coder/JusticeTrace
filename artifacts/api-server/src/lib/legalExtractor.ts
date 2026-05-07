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

const SYSTEM_PROMPT = `You are a specialized legal document analysis AI. Extract structured information from court judgment documents with precision.

IMPORTANT: Your entire response must be valid, complete JSON. Do not truncate arrays mid-way. If you must limit output to stay within token limits, include fewer items per array but always close all brackets and braces properly.

Array limits (strictly enforced to keep response size manageable):
- parties: max 12 most important
- directives: max 8 most important
- highlights: max 6 most representative
- legalCitations: max 12 most significant
- keyDates: max 10 most important
- monetaryAwards: max 8
- legalIssues: max 6 most important
- proceduralHistory: max 8 steps
- actionItems: max 8 most important

Always respond with valid, complete JSON matching this exact structure:
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
      "description": "clear description of the directive (max 120 chars)",
      "sourceText": "verbatim excerpt (max 150 chars)",
      "confidence": 0.0-1.0
    }
  ],

  "highlights": [
    {
      "label": "short label (max 60 chars)",
      "text": "relevant excerpt (max 200 chars)",
      "confidence": 0.0-1.0,
      "category": "holding|reasoning|procedural_history|facts|legal_standard|remedy"
    }
  ],

  "legalCitations": [
    {
      "text": "citation e.g. Brown v. Board of Education, 347 U.S. 483 (1954)",
      "type": "case_law|statute|regulation|constitutional|treaty|other",
      "confidence": 0.0-1.0
    }
  ],

  "keyDates": [
    {
      "event": "event description (max 80 chars)",
      "date": "ISO date or descriptive string",
      "confidence": 0.0-1.0
    }
  ],

  "monetaryAwards": [
    {
      "type": "damages|costs|attorney_fees|fine|restitution|compensation|other",
      "amount": "exact amount with currency",
      "recipient": "party receiving payment",
      "payer": "party ordered to pay",
      "confidence": 0.0-1.0
    }
  ],

  "legalIssues": [
    {
      "issue": "legal question (max 120 chars)",
      "resolution": "how court resolved it (max 150 chars)",
      "confidence": 0.0-1.0
    }
  ],

  "proceduralHistory": [
    {
      "event": "procedural event (max 100 chars)",
      "date": "ISO date or descriptive string or null",
      "court": "court name or null",
      "confidence": 0.0-1.0
    }
  ],

  "outcome": {
    "prevailingParty": "name of winning party or 'Mixed' or null",
    "outcomeType": "Judgment for Plaintiff|Judgment for Defendant|Dismissed|Remanded|Settled|Affirmed|Reversed|Mixed|other",
    "summary": "1-2 sentence plain-English outcome summary",
    "confidence": 0.0-1.0
  },

  "appealInfo": {
    "canAppeal": true|false|null,
    "deadline": "deadline string or null",
    "court": "appellate court or null",
    "notes": "brief notes about appeal rights or null",
    "confidence": 0.0-1.0
  },

  "actionItems": [
    {
      "action": "specific action required (max 120 chars)",
      "responsible": "party or entity responsible",
      "deadline": "deadline or null",
      "priority": "high|medium|low",
      "confidence": 0.0-1.0
    }
  ],

  "summary": "3-5 sentence executive summary of the entire judgment",
  "overallConfidence": 0.0-1.0
}

If information is absent from the document, use empty arrays or null. Never fabricate information. Prioritize completeness of JSON structure over exhaustiveness of arrays.`;

/**
 * Attempts to repair a truncated JSON string by trimming the last incomplete
 * value and closing all unclosed arrays and objects.
 */
function repairTruncatedJson(raw: string): string {
  // Walk back from the end to find the last clean comma or opening bracket
  // so we don't include a partially-written value.
  let s = raw;

  // Remove trailing partial token (anything after the last complete value)
  // A complete value ends with: }, ], ", a digit, true, false, null
  const lastClean = s.search(/[}\]"0-9](,|\s*$)/);
  if (lastClean !== -1) {
    // Trim everything after the last clearly-closed value/element
    // Find the last position that ends a complete JSON value
    const goodEnd = s.lastIndexOf(",");
    if (goodEnd > 0) {
      s = s.slice(0, goodEnd);
    }
  }

  // Count unclosed brackets and braces
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }

  // Close all unclosed structures in reverse order
  for (let i = stack.length - 1; i >= 0; i--) {
    s += stack[i] === "{" ? "}" : "]";
  }

  return s;
}

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
  const jsonMatch = jsonText.match(/\{[\s\S]*/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Anthropic response");
  }

  let rawJson = jsonMatch[0];

  // Attempt 1: parse as-is
  let result: LegalExtractionResult;
  try {
    result = JSON.parse(rawJson) as LegalExtractionResult;
  } catch {
    // Attempt 2: repair truncated JSON by closing all unclosed brackets/braces
    logger.warn({ rawLength: rawJson.length, stopReason: message.stop_reason }, "JSON truncated — attempting repair");
    rawJson = repairTruncatedJson(rawJson);
    result = JSON.parse(rawJson) as LegalExtractionResult;
  }

  // Normalise arrays so the UI never receives undefined
  result.parties ??= [];
  result.directives ??= [];
  result.highlights ??= [];
  result.legalCitations ??= [];
  result.keyDates ??= [];
  result.monetaryAwards ??= [];
  result.legalIssues ??= [];
  result.proceduralHistory ??= [];
  result.actionItems ??= [];

  logger.info({ overallConfidence: result.overallConfidence }, "Legal extraction complete");

  return result;
}
