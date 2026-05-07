import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDocument,
  useAnalyzeDocument,
  useDeleteDocument,
  getGetDocumentQueryKey,
  getListDocumentsQueryKey,
  getGetDocumentStatsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatBytes, formatDate } from "@/lib/format";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  processing: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  failed: "bg-red-100 text-red-800 border-red-200",
};

const CATEGORY_COLORS: Record<string, string> = {
  holding: "bg-primary/10 border-primary/30 text-primary",
  reasoning: "bg-blue-50 border-blue-200 text-blue-800",
  procedural_history: "bg-purple-50 border-purple-200 text-purple-800",
  facts: "bg-amber-50 border-amber-200 text-amber-800",
  legal_standard: "bg-emerald-50 border-emerald-200 text-emerald-800",
  remedy: "bg-rose-50 border-rose-200 text-rose-800",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const CITATION_TYPE_COLORS: Record<string, string> = {
  case_law: "bg-blue-100 text-blue-800 border-blue-200",
  statute: "bg-purple-100 text-purple-800 border-purple-200",
  regulation: "bg-amber-100 text-amber-800 border-amber-200",
  constitutional: "bg-red-100 text-red-800 border-red-200",
  treaty: "bg-emerald-100 text-emerald-800 border-emerald-200",
  other: "bg-muted text-muted-foreground border-border",
};

function ConfidenceBar({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

function SectionCard({ title, count, icon, children, className }: {
  title: string; count?: number; icon?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-card border border-card-border rounded-lg shadow-sm ${className ?? ""}`}>
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon && <span className="text-base">{icon}</span>}
          <h3 className="font-semibold text-foreground text-sm">{title}</h3>
        </div>
        {count !== undefined && (
          <span className="text-xs font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{count}</span>
        )}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function FieldRow({ label, value, confidence }: { label: string; value: string | null | undefined; confidence: number | null | undefined }) {
  return (
    <div className="py-2.5 grid grid-cols-3 gap-3 border-b border-border/60 last:border-0 items-center">
      <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-foreground font-medium col-span-1">{value ?? <span className="text-muted-foreground italic text-xs">Not found</span>}</dd>
      <dd className="col-span-1"><ConfidenceBar value={confidence} /></dd>
    </div>
  );
}

type Analysis = {
  caseNumber?: string | null; caseNumberConfidence?: number | null;
  caseName?: string | null; caseNameConfidence?: number | null;
  courtName?: string | null; courtNameConfidence?: number | null;
  jurisdiction?: string | null; jurisdictionConfidence?: number | null;
  judgmentDate?: string | null; judgmentDateConfidence?: number | null;
  judge?: string | null; judgeConfidence?: number | null;
  parties?: Array<{ role: string; name: string; confidence: number }>;
  directives?: Array<{ type: string; description: string; sourceText: string; confidence: number }>;
  highlights?: Array<{ label: string; text: string; confidence: number; category: string }>;
  legalCitations?: Array<{ text: string; type: string; confidence: number }>;
  keyDates?: Array<{ event: string; date: string; confidence: number }>;
  monetaryAwards?: Array<{ type: string; amount: string; recipient: string; payer: string; confidence: number }>;
  legalIssues?: Array<{ issue: string; resolution: string; confidence: number }>;
  proceduralHistory?: Array<{ event: string; date: string | null; court: string | null; confidence: number }>;
  outcome?: { prevailingParty: string | null; outcomeType: string | null; summary: string | null; confidence: number } | null;
  appealInfo?: { canAppeal: boolean | null; deadline: string | null; court: string | null; notes: string | null; confidence: number } | null;
  actionItems?: Array<{ action: string; responsible: string; deadline: string | null; priority: string; confidence: number }>;
  summary?: string | null;
  overallConfidence?: number | null;
};

export default function DocumentView() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const docId = parseInt(params.id ?? "0", 10);

  const { data: doc, isLoading } = useGetDocument(docId, {
    query: { enabled: !!docId, queryKey: getGetDocumentQueryKey(docId) },
  });

  const analyzeDoc = useAnalyzeDocument();
  const deleteDoc = useDeleteDocument();

  const handleAnalyze = () => {
    analyzeDoc.mutate({ id: docId }, {
      onSuccess: () => {
        toast({ title: "Analysis complete" });
        queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(docId) });
        queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDocumentStatsQueryKey() });
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Analysis failed. Please try again.";
        toast({ title: "Analysis failed", description: msg, variant: "destructive" });
      },
    });
  };

  const handleDelete = () => {
    if (!doc || !confirm(`Delete "${doc.fileName}"? This cannot be undone.`)) return;
    deleteDoc.mutate({ id: docId }, {
      onSuccess: () => {
        toast({ title: "Document deleted" });
        queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDocumentStatsQueryKey() });
        setLocation("/");
      },
      onError: () => toast({ title: "Delete failed", variant: "destructive" }),
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-5">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-40" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 text-center">
        <p className="text-muted-foreground">Document not found.</p>
        <Button variant="outline" onClick={() => setLocation("/")} className="mt-4">Back to Dashboard</Button>
      </div>
    );
  }

  const analysis = doc.analysis as Analysis | null;
  const highlightsByCategory: Record<string, Analysis["highlights"]> = {};
  if (analysis?.highlights) {
    for (const h of analysis.highlights) {
      if (!highlightsByCategory[h.category]) highlightsByCategory[h.category] = [];
      highlightsByCategory[h.category]!.push(h);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-5">
      {/* Breadcrumb */}
      <button data-testid="link-back" onClick={() => setLocation("/")} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        All Documents
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground font-serif break-all">{doc.fileName}</h2>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[doc.status] ?? "bg-muted"}`}>{doc.status}</span>
            <span className="text-sm text-muted-foreground">{formatBytes(doc.fileSize)}</span>
            {doc.pageCount !== null && <span className="text-sm text-muted-foreground">{doc.pageCount} pages</span>}
            <span className="text-sm text-muted-foreground">Uploaded {formatDate(doc.uploadedAt)}</span>
            {doc.analyzedAt && <span className="text-sm text-muted-foreground">Analyzed {formatDate(doc.analyzedAt)}</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {(doc.status === "pending" || doc.status === "failed" || doc.status === "completed") && (
            <Button data-testid="button-analyze" onClick={handleAnalyze} disabled={analyzeDoc.isPending}
              variant={doc.status === "completed" ? "outline" : "default"} size="sm">
              {analyzeDoc.isPending ? "Analyzing..." : doc.status === "completed" ? "Re-analyze" : "Analyze"}
            </Button>
          )}
          <Button data-testid="button-delete" size="sm" variant="outline" onClick={handleDelete}
            disabled={deleteDoc.isPending} className="text-destructive border-destructive/30 hover:border-destructive">
            Delete
          </Button>
        </div>
      </div>

      {/* Processing state */}
      {doc.status === "processing" && (
        <div className="bg-card border border-card-border rounded-lg p-8 text-center shadow-sm">
          <div className="flex justify-center mb-3">
            <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="font-semibold text-foreground">Analysis in progress...</p>
          <p className="text-sm text-muted-foreground mt-1">Claude is reading your document and extracting structured data.</p>
        </div>
      )}

      {/* No analysis yet */}
      {!analysis && doc.status !== "processing" && (
        <div className="bg-card border border-card-border rounded-lg p-12 text-center shadow-sm">
          <p className="font-semibold text-foreground font-serif text-lg">No analysis yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-5">Run the AI extractor to pull structured intelligence from this document.</p>
          <Button data-testid="button-analyze-empty" onClick={handleAnalyze} disabled={analyzeDoc.isPending}>
            {analyzeDoc.isPending ? "Analyzing..." : "Start Analysis"}
          </Button>
        </div>
      )}

      {analysis && (
        <>
          {/* Overall Confidence + Outcome — top row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Overall confidence */}
            <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Overall Extraction Confidence</p>
              <div className="flex items-end gap-3 mb-3">
                <span className="text-4xl font-bold tabular-nums text-foreground">
                  {analysis.overallConfidence !== null && analysis.overallConfidence !== undefined
                    ? `${Math.round(analysis.overallConfidence * 100)}%` : "—"}
                </span>
              </div>
              <ConfidenceBar value={analysis.overallConfidence} />
            </div>

            {/* Outcome */}
            {analysis.outcome && (
              <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Case Outcome</p>
                <div className="space-y-1.5">
                  {analysis.outcome.prevailingParty && (
                    <p className="font-bold text-foreground text-lg">{analysis.outcome.prevailingParty} prevailed</p>
                  )}
                  {analysis.outcome.outcomeType && (
                    <span className="inline-block px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 rounded">
                      {analysis.outcome.outcomeType}
                    </span>
                  )}
                  {analysis.outcome.summary && (
                    <p className="text-sm text-muted-foreground mt-1">{analysis.outcome.summary}</p>
                  )}
                </div>
                <div className="mt-3"><ConfidenceBar value={analysis.outcome.confidence} /></div>
              </div>
            )}
          </div>

          {/* Executive Summary */}
          {analysis.summary && (
            <SectionCard title="Executive Summary" icon="📋">
              <p className="text-sm text-foreground leading-relaxed">{analysis.summary}</p>
            </SectionCard>
          )}

          {/* Core Details */}
          <SectionCard title="Case Details" icon="⚖️">
            <dl>
              <FieldRow label="Case Number" value={analysis.caseNumber} confidence={analysis.caseNumberConfidence} />
              <FieldRow label="Case Name" value={analysis.caseName} confidence={analysis.caseNameConfidence} />
              <FieldRow label="Court" value={analysis.courtName} confidence={analysis.courtNameConfidence} />
              <FieldRow label="Jurisdiction" value={analysis.jurisdiction} confidence={analysis.jurisdictionConfidence} />
              <FieldRow label="Judgment Date" value={analysis.judgmentDate} confidence={analysis.judgmentDateConfidence} />
              <FieldRow label="Presiding Judge" value={analysis.judge} confidence={analysis.judgeConfidence} />
            </dl>
          </SectionCard>

          {/* 2-col grid for Parties + Action Items */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Parties */}
            {analysis.parties && analysis.parties.length > 0 && (
              <SectionCard title="Parties" icon="👥" count={analysis.parties.length}>
                <div className="space-y-2.5">
                  {analysis.parties.map((party, i) => (
                    <div key={i} data-testid={`card-party-${i}`} className="flex items-center justify-between gap-3 py-2 border-b border-border/60 last:border-0">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{party.role}</p>
                        <p className="font-medium text-sm text-foreground truncate">{party.name}</p>
                      </div>
                      <div className="w-28 flex-shrink-0"><ConfidenceBar value={party.confidence} /></div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Action Items */}
            {analysis.actionItems && analysis.actionItems.length > 0 && (
              <SectionCard title="Action Items" icon="✅" count={analysis.actionItems.length}>
                <div className="space-y-2.5">
                  {analysis.actionItems.map((item, i) => (
                    <div key={i} data-testid={`card-action-${i}`} className="py-2 border-b border-border/60 last:border-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-medium text-foreground flex-1">{item.action}</p>
                        <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${PRIORITY_COLORS[item.priority] ?? "bg-muted text-muted-foreground"}`}>
                          {item.priority}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>By: <span className="font-medium text-foreground">{item.responsible}</span></span>
                        {item.deadline && <span>Due: <span className="font-medium text-foreground">{item.deadline}</span></span>}
                      </div>
                      <div className="mt-1.5"><ConfidenceBar value={item.confidence} /></div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>

          {/* Legal Issues */}
          {analysis.legalIssues && analysis.legalIssues.length > 0 && (
            <SectionCard title="Legal Issues & Resolutions" icon="⚡" count={analysis.legalIssues.length}>
              <div className="space-y-3">
                {analysis.legalIssues.map((issue, i) => (
                  <div key={i} data-testid={`card-issue-${i}`} className="border border-border rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Issue</p>
                        <p className="text-sm font-medium text-foreground">{issue.issue}</p>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-1">Resolution</p>
                        <p className="text-sm text-foreground">{issue.resolution}</p>
                      </div>
                      <div className="w-28 flex-shrink-0 pt-1"><ConfidenceBar value={issue.confidence} /></div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Directives */}
          {analysis.directives && analysis.directives.length > 0 && (
            <SectionCard title="Court Directives & Orders" icon="🔨" count={analysis.directives.length}>
              <div className="space-y-3">
                {analysis.directives.map((directive, i) => (
                  <div key={i} data-testid={`card-directive-${i}`} className="border border-border rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <span className="inline-block px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-primary/10 text-primary rounded mb-1.5">
                          {directive.type}
                        </span>
                        <p className="text-sm font-medium text-foreground">{directive.description}</p>
                      </div>
                      <div className="w-28 flex-shrink-0"><ConfidenceBar value={directive.confidence} /></div>
                    </div>
                    {directive.sourceText && (
                      <blockquote className="border-l-2 border-primary/40 pl-3 mt-2">
                        <p className="text-xs text-muted-foreground italic leading-relaxed">{directive.sourceText}</p>
                      </blockquote>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Monetary Awards */}
          {analysis.monetaryAwards && analysis.monetaryAwards.length > 0 && (
            <SectionCard title="Monetary Awards & Orders" icon="💰" count={analysis.monetaryAwards.length}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                      <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                      <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recipient</th>
                      <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payer</th>
                      <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {analysis.monetaryAwards.map((award, i) => (
                      <tr key={i} data-testid={`row-award-${i}`}>
                        <td className="py-2.5 pr-3">
                          <span className="inline-block px-1.5 py-0.5 text-xs font-semibold bg-muted rounded capitalize">{award.type.replace(/_/g, " ")}</span>
                        </td>
                        <td className="py-2.5 pr-3 font-bold text-foreground">{award.amount}</td>
                        <td className="py-2.5 pr-3 text-foreground">{award.recipient}</td>
                        <td className="py-2.5 pr-3 text-foreground">{award.payer}</td>
                        <td className="py-2.5 w-24"><ConfidenceBar value={award.confidence} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* Key Dates Timeline */}
          {analysis.keyDates && analysis.keyDates.length > 0 && (
            <SectionCard title="Key Dates Timeline" icon="📅" count={analysis.keyDates.length}>
              <div className="relative">
                <div className="absolute left-2.5 top-0 bottom-0 w-px bg-border" />
                <div className="space-y-3 pl-8">
                  {analysis.keyDates.map((kd, i) => (
                    <div key={i} data-testid={`card-date-${i}`} className="relative">
                      <div className="absolute -left-5.5 top-1.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background" />
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-foreground">{kd.event}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{kd.date}</p>
                        </div>
                        <div className="w-24 flex-shrink-0 pt-0.5"><ConfidenceBar value={kd.confidence} /></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          )}

          {/* Procedural History */}
          {analysis.proceduralHistory && analysis.proceduralHistory.length > 0 && (
            <SectionCard title="Procedural History" icon="📜" count={analysis.proceduralHistory.length}>
              <div className="space-y-2.5">
                {analysis.proceduralHistory.map((step, i) => (
                  <div key={i} data-testid={`card-procedure-${i}`} className="flex items-start gap-4 py-2 border-b border-border/60 last:border-0">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground mt-0.5">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{step.event}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        {step.date && <span className="font-mono">{step.date}</span>}
                        {step.court && <span>{step.court}</span>}
                      </div>
                    </div>
                    <div className="w-24 flex-shrink-0"><ConfidenceBar value={step.confidence} /></div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Legal Citations */}
          {analysis.legalCitations && analysis.legalCitations.length > 0 && (
            <SectionCard title="Legal Citations" icon="📚" count={analysis.legalCitations.length}>
              <div className="space-y-2">
                {analysis.legalCitations.map((citation, i) => (
                  <div key={i} data-testid={`card-citation-${i}`} className="flex items-start justify-between gap-3 py-2 border-b border-border/60 last:border-0">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border mt-0.5 ${CITATION_TYPE_COLORS[citation.type] ?? CITATION_TYPE_COLORS.other}`}>
                        {citation.type.replace(/_/g, " ")}
                      </span>
                      <p className="text-sm text-foreground font-mono leading-relaxed">{citation.text}</p>
                    </div>
                    <div className="w-24 flex-shrink-0 pt-0.5"><ConfidenceBar value={citation.confidence} /></div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Appeal Information */}
          {analysis.appealInfo && (
            <SectionCard title="Appeal Information" icon="🏛️">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Can Appeal?</p>
                  <p className="text-sm font-bold text-foreground">
                    {analysis.appealInfo.canAppeal === true ? "Yes" : analysis.appealInfo.canAppeal === false ? "No" : "Unknown"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Deadline</p>
                  <p className="text-sm font-medium text-foreground">{analysis.appealInfo.deadline ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Appellate Court</p>
                  <p className="text-sm font-medium text-foreground">{analysis.appealInfo.court ?? "—"}</p>
                </div>
                {analysis.appealInfo.notes && (
                  <div className="md:col-span-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm text-foreground">{analysis.appealInfo.notes}</p>
                  </div>
                )}
                <div className="md:col-span-3"><ConfidenceBar value={analysis.appealInfo.confidence} /></div>
              </div>
            </SectionCard>
          )}

          {/* Highlighted Sections */}
          {Object.keys(highlightsByCategory).length > 0 && (
            <SectionCard title="Highlighted Sections" icon="🔍">
              <div className="space-y-5">
                {Object.entries(highlightsByCategory).map(([category, sections]) => (
                  <div key={category}>
                    <span className={`inline-flex items-center px-3 py-1 rounded text-xs font-bold uppercase tracking-wider border mb-3 ${CATEGORY_COLORS[category] ?? "bg-muted text-muted-foreground border-border"}`}>
                      {category.replace(/_/g, " ")}
                    </span>
                    <div className="space-y-2.5">
                      {sections?.map((section, i) => (
                        <div key={i} data-testid={`card-highlight-${i}`} className="bg-muted/40 rounded-lg p-4">
                          <div className="flex items-center justify-between gap-4 mb-1.5">
                            <p className="text-xs font-semibold text-muted-foreground">{section.label}</p>
                            <div className="w-24"><ConfidenceBar value={section.confidence} /></div>
                          </div>
                          <p className="text-sm text-foreground leading-relaxed">{section.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
