"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SupportCaseViewer } from "@/components/support-case-viewer";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function SupportCaseLookup() {
  const searchParams = useSearchParams();
  const caseIdParam = searchParams.get("caseId");

  const [caseIdInput, setCaseIdInput] = useState("");
  const [activeCaseId, setActiveCaseId] = useState<string | null>(caseIdParam);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = caseIdInput.trim();
    if (!trimmed) return;
    setActiveCaseId(trimmed);
  }

  function handleReset() {
    setActiveCaseId(null);
    setCaseIdInput("");
  }

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back
          </Link>
          <span className="text-xl font-bold tracking-tight">
            Casper&apos;s Kitchen
          </span>
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            Support
          </span>
        </div>
      </header>

      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-2xl space-y-6">
          {!activeCaseId ? (
            <>
              <h1 className="text-lg font-semibold">
                View Active Support Case
              </h1>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="case-id">Support Case ID</Label>
                  <Input
                    id="case-id"
                    placeholder="Paste a support case ID…"
                    value={caseIdInput}
                    onChange={(e) => setCaseIdInput(e.target.value)}
                    autoFocus
                  />
                </div>
                <Button type="submit" disabled={!caseIdInput.trim()}>
                  View Case
                </Button>
              </form>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="text-lg font-semibold">Your Support Case</h1>
                <Button variant="outline" size="sm" onClick={handleReset}>
                  Look up another case
                </Button>
              </div>
              <SupportCaseViewer key={activeCaseId} caseId={activeCaseId} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
