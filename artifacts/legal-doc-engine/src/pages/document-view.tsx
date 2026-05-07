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
import { useToast } from "@/hooks/use-toast";
import { formatBytes, formatDate, formatConfidence } from "@/lib/format";

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

function ConfidenceBar({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold tabular-nums w-12 text-right">{pct}%</span>
    </div>
  );
}

function FieldRow({ label, value, confidence }: { label: string; value: string | null | undefined; confidence: number | null | undefined }) {
  return (
    <div className="py-3 grid grid-cols-3 gap-4 border-b border-border last:border-0">
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground font-medium col-span-1">{value ?? <span className="text-muted-foreground italic">Not found</span>}</dd>
      <dd className="col-span-1">
        <ConfidenceBar value={confidence} />
      </dd>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-card-border rounded-lg shadow-sm">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="font-semibold text-foreground font-serif">{title}</h3>
      </div>
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}

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
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8 text-center">
        <p className="text-muted-foreground">Document not found.</p>
        <Button variant="outline" onClick={() => setLocation("/")} className="mt-4">Back to Dashboard</Button>
      </div>
    );
  }

  const analysis = doc.analysis as {
    caseNumber?: string | null;
    caseNumberConfidence?: number | null;
    caseName?: string | null;
    caseNameConfidence?: number | null;
    courtName?: string | null;
    courtNameConfidence?: number | null;
    judgmentDate?: string | null;
    judgmentDateConfidence?: number | null;
    judge?: string | null;
    judgeConfidence?: number | null;
    parties?: Array<{ role: string; name: string; confidence: number }>;
    directives?: Array<{ type: string; description: string; sourceText: string; confidence: number }>;
    highlights?: Array<{ label: string; text: string; confidence: number; category: string }>;
    summary?: string | null;
    overallConfidence?: number | null;
  } | null;

  const highlightsByCategory: Record<string, typeof analysis.highlights> = {};
  if (analysis?.highlights) {
    for (const h of analysis.highlights) {
      if (!highlightsByCategory[h.category]) highlightsByCategory[h.category] = [];
      highlightsByCategory[h.category]!.push(h);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Breadcrumb */}
      <button data-testid="link-back" onClick={() => setLocation("/")} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        All Documents
      </button>

      {/* Document Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-foreground font-serif break-all">{doc.fileName}</h2>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[doc.status] ?? "bg-muted"}`}>
              {doc.status}
            </span>
            <span className="text-sm text-muted-foreground">{formatBytes(doc.fileSize)}</span>
            {doc.pageCount !== null && <span className="text-sm text-muted-foreground">{doc.pageCount} pages</span>}
            <span className="text-sm text-muted-foreground">Uploaded {formatDate(doc.uploadedAt)}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {(doc.status === "pending" || doc.status === "failed" || doc.status === "completed") && (
            <Button
              data-testid="button-analyze"
              onClick={handleAnalyze}
              disabled={analyzeDoc.isPending}
              variant={doc.status === "completed" ? "outline" : "default"}
              size="sm"
            >
              {analyzeDoc.isPending ? "Analyzing..." : doc.status === "completed" ? "Re-analyze" : "Analyze"}
            </Button>
          )}
          <Button data-testid="button-delete" size="sm" variant="outline" onClick={handleDelete} disabled={deleteDoc.isPending} className="text-destructive border-destructive/30 hover:border-destructive">
            Delete
          </Button>
        </div>
      </div>

      {/* Overall Confidence */}
      {analysis?.overallConfidence !== undefined && analysis.overallConfidence !== null && (
        <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground font-serif">Overall Extraction Confidence</h3>
            <span className="text-2xl font-bold tabular-nums text-foreground">{Math.round(analysis.overallConfidence * 100)}%</span>
          </div>
          <ConfidenceBar value={analysis.overallConfidence} />
        </div>
      )}

      {/* Summary */}
      {analysis?.summary && (
        <SectionCard title="Executive Summary">
          <p className="text-sm text-foreground leading-relaxed">{analysis.summary}</p>
        </SectionCard>
      )}

      {/* Core Details */}
      {analysis && (
        <SectionCard title="Case Details">
          <dl>
            <FieldRow label="Case Number" value={analysis.caseNumber} confidence={analysis.caseNumberConfidence} />
            <FieldRow label="Case Name" value={analysis.caseName} confidence={analysis.caseNameConfidence} />
            <FieldRow label="Court" value={analysis.courtName} confidence={analysis.courtNameConfidence} />
            <FieldRow label="Judgment Date" value={analysis.judgmentDate} confidence={analysis.judgmentDateConfidence} />
            <FieldRow label="Presiding Judge" value={analysis.judge} confidence={analysis.judgeConfidence} />
          </dl>
        </SectionCard>
      )}

      {/* Parties */}
      {analysis?.parties && analysis.parties.length > 0 && (
        <SectionCard title={`Parties (${analysis.parties.length})`}>
          <div className="space-y-3">
            {analysis.parties.map((party, i) => (
              <div key={i} data-testid={`card-party-${i}`} className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-0">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{party.role}</span>
                  <p className="font-medium text-foreground mt-0.5">{party.name}</p>
                </div>
                <div className="w-40 flex-shrink-0">
                  <ConfidenceBar value={party.confidence} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Directives */}
      {analysis?.directives && analysis.directives.length > 0 && (
        <SectionCard title={`Court Directives & Orders (${analysis.directives.length})`}>
          <div className="space-y-4">
            {analysis.directives.map((directive, i) => (
              <div key={i} data-testid={`card-directive-${i}`} className="border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <span className="inline-block px-2 py-0.5 text-xs font-semibold uppercase tracking-wider bg-primary/10 text-primary rounded mb-1.5">
                      {directive.type}
                    </span>
                    <p className="text-sm font-medium text-foreground">{directive.description}</p>
                  </div>
                  <div className="w-36 flex-shrink-0">
                    <ConfidenceBar value={directive.confidence} />
                  </div>
                </div>
                {directive.sourceText && (
                  <blockquote className="border-l-2 border-primary/40 pl-3 mt-2">
                    <p className="text-xs text-muted-foreground italic leading-relaxed line-clamp-3">{directive.sourceText}</p>
                  </blockquote>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Highlighted Sections */}
      {Object.keys(highlightsByCategory).length > 0 && (
        <SectionCard title="Highlighted Sections">
          <div className="space-y-6">
            {Object.entries(highlightsByCategory).map(([category, sections]) => (
              <div key={category}>
                <h4 className={`inline-flex items-center px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider border mb-3 ${CATEGORY_COLORS[category] ?? "bg-muted text-muted-foreground border-border"}`}>
                  {category.replace(/_/g, " ")}
                </h4>
                <div className="space-y-3">
                  {sections?.map((section, i) => (
                    <div key={i} data-testid={`card-highlight-${i}`} className="bg-muted/40 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{section.label}</p>
                        <div className="w-32">
                          <ConfidenceBar value={section.confidence} />
                        </div>
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

      {/* Empty state when no analysis */}
      {!analysis && doc.status !== "processing" && (
        <div className="bg-card border border-card-border rounded-lg p-12 text-center shadow-sm">
          <p className="font-semibold text-foreground font-serif">No analysis available</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Run the AI extractor to extract structured information from this document.</p>
          <Button data-testid="button-analyze-empty" onClick={handleAnalyze} disabled={analyzeDoc.isPending}>
            {analyzeDoc.isPending ? "Analyzing..." : "Start Analysis"}
          </Button>
        </div>
      )}

      {doc.status === "processing" && (
        <div className="bg-card border border-card-border rounded-lg p-12 text-center shadow-sm">
          <div className="flex justify-center mb-4">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="font-semibold text-foreground">Analysis in progress...</p>
          <p className="text-sm text-muted-foreground mt-1">The AI is extracting structured information from this document. This may take a moment.</p>
        </div>
      )}
    </div>
  );
}
