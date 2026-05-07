import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDocumentStats,
  useListDocuments,
  useDeleteDocument,
  useAnalyzeDocument,
  getListDocumentsQueryKey,
  getGetDocumentStatsQueryKey,
  getGetDocumentQueryKey,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatBytes, formatDate, formatConfidence } from "@/lib/format";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  processing: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  failed: "bg-red-100 text-red-800 border-red-200",
};

function ConfidenceMeter({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className="text-3xl font-bold text-foreground tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function UploadZone({ onUploadComplete }: { onUploadComplete: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const uploadFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".pdf") && file.type !== "application/pdf") {
      toast({ title: "Invalid file type", description: "Only PDF files are supported.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${BASE}/api/documents/upload`, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error ?? "Upload failed");
      }
      toast({ title: "Document uploaded", description: `${file.name} is ready for analysis.` });
      onUploadComplete();
    } catch (err: unknown) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [onUploadComplete, toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }, [uploadFile]);

  return (
    <label
      data-testid="upload-zone"
      className={`block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
        ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"}
        ${uploading ? "opacity-60 pointer-events-none" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input type="file" accept=".pdf,application/pdf" className="sr-only" onChange={onInputChange} data-testid="input-file" />
      <div className="flex flex-col items-center gap-2">
        <svg className="w-10 h-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <div>
          <p className="font-semibold text-foreground">{uploading ? "Uploading..." : "Drop a court judgment PDF here"}</p>
          <p className="text-sm text-muted-foreground mt-0.5">or click to browse — up to 50 MB</p>
        </div>
      </div>
    </label>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading } = useGetDocumentStats();
  const { data: documents, isLoading: docsLoading } = useListDocuments();
  const deleteDoc = useDeleteDocument();
  const analyzeDoc = useAnalyzeDocument();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDocumentStatsQueryKey() });
  }, [queryClient]);

  const handleDelete = useCallback((id: number, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    deleteDoc.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Document deleted" });
        invalidate();
      },
      onError: () => toast({ title: "Delete failed", variant: "destructive" }),
    });
  }, [deleteDoc, invalidate, toast]);

  const handleAnalyze = useCallback((id: number) => {
    analyzeDoc.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Analysis complete" });
        invalidate();
        queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(id) });
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Analysis failed. Please try again.";
        toast({ title: "Analysis failed", description: msg, variant: "destructive" });
      },
    });
  }, [analyzeDoc, invalidate, queryClient, toast]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground font-serif">Document Intelligence Hub</h2>
        <p className="text-muted-foreground text-sm mt-1">Upload court judgment PDFs for structured AI extraction</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statsLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card border border-card-border rounded-lg p-5 shadow-sm">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-8 w-10" />
            </div>
          ))
        ) : stats ? (
          <>
            <StatCard label="Total" value={stats.total} />
            <StatCard label="Pending" value={stats.pending} />
            <StatCard label="Processing" value={stats.processing} />
            <StatCard label="Completed" value={stats.completed} />
            <StatCard label="Failed" value={stats.failed} />
            <StatCard label="Avg Confidence" value={stats.avgConfidence !== null && stats.avgConfidence !== undefined ? `${Math.round(stats.avgConfidence * 100)}%` : "—"} />
          </>
        ) : null}
      </div>

      {/* Upload */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">Upload Document</h3>
        <UploadZone onUploadComplete={invalidate} />
      </div>

      {/* Documents Table */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">All Documents</h3>
        <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
          {docsLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-6 py-4 flex items-center gap-4">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-16 ml-auto" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : !documents || documents.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground">
              <p className="font-medium">No documents uploaded yet</p>
              <p className="text-sm mt-1">Upload a court judgment PDF to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left px-6 py-3 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Document</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wider text-xs hidden md:table-cell">Size</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wider text-xs hidden lg:table-cell">Pages</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wider text-xs hidden lg:table-cell">Confidence</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground uppercase tracking-wider text-xs hidden md:table-cell">Uploaded</th>
                    <th className="text-right px-6 py-3 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {documents.map((doc) => (
                    <tr
                      key={doc.id}
                      data-testid={`row-document-${doc.id}`}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <button
                          data-testid={`link-document-${doc.id}`}
                          onClick={() => setLocation(`/documents/${doc.id}`)}
                          className="font-medium text-primary hover:underline text-left max-w-[280px] truncate block"
                        >
                          {doc.fileName}
                        </button>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground hidden md:table-cell tabular-nums">
                        {formatBytes(doc.fileSize)}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground hidden lg:table-cell tabular-nums">
                        {doc.pageCount ?? "—"}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[doc.status] ?? "bg-muted text-muted-foreground"}`}>
                          {doc.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <ConfidenceMeter value={null} />
                      </td>
                      <td className="px-4 py-4 text-muted-foreground text-xs hidden md:table-cell">
                        {formatDate(doc.uploadedAt)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {(doc.status === "pending" || doc.status === "failed") && (
                            <Button
                              data-testid={`button-analyze-${doc.id}`}
                              size="sm"
                              variant="outline"
                              onClick={() => handleAnalyze(doc.id)}
                              disabled={analyzeDoc.isPending}
                              className="text-xs"
                            >
                              Analyze
                            </Button>
                          )}
                          {doc.status === "completed" && (
                            <Button
                              data-testid={`button-view-${doc.id}`}
                              size="sm"
                              onClick={() => setLocation(`/documents/${doc.id}`)}
                              className="text-xs"
                            >
                              View Results
                            </Button>
                          )}
                          {doc.status === "processing" && (
                            <span className="text-xs text-muted-foreground animate-pulse">Processing...</span>
                          )}
                          <Button
                            data-testid={`button-delete-${doc.id}`}
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(doc.id, doc.fileName)}
                            disabled={deleteDoc.isPending}
                            className="text-xs text-destructive hover:text-destructive border-destructive/30 hover:border-destructive"
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
