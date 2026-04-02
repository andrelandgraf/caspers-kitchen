"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export interface SupportMessage {
  id: string;
  caseId: string;
  userId: string | null;
  adminId: string | null;
  content: string;
  createdAt: string;
}

interface SupportCaseViewerProps {
  caseId: string;
  initialMessages?: SupportMessage[];
}

export function SupportCaseViewer({
  caseId,
  initialMessages,
}: SupportCaseViewerProps) {
  const [messages, setMessages] = useState<SupportMessage[]>(
    initialMessages ?? [],
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = useCallback(
    (id: string) => {
      if (pollRef.current) clearInterval(pollRef.current);

      async function fetchMessages() {
        try {
          const res = await fetch(`/api/support/${id}/messages`);
          if (!res.ok) return;
          const msgs: SupportMessage[] = await res.json();
          setMessages(msgs);
        } catch {
          // ignore polling errors
        }
      }

      if (!initialMessages) {
        void fetchMessages();
      }

      pollRef.current = setInterval(fetchMessages, 5000);
    },
    [initialMessages],
  );

  useEffect(() => {
    startPolling(caseId);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [caseId, startPolling]);

  const userMessages = messages.filter((m) => m.adminId === null);
  const adminMessages = messages.filter((m) => m.adminId !== null);

  return (
    <div className="space-y-4">
      {userMessages.map((m) => (
        <div key={m.id} className="space-y-1">
          <p className="text-sm">{m.content}</p>
          <p className="text-xs text-muted-foreground">
            Customer &middot; {new Date(m.createdAt).toLocaleTimeString()}
          </p>
        </div>
      ))}

      {userMessages.length > 0 && <Separator />}

      {adminMessages.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Waiting for admin response&hellip;
        </div>
      ) : (
        adminMessages.map((m) => (
          <Card key={m.id} size="sm">
            <CardHeader>
              <CardTitle>Admin</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{m.content}</p>
            </CardContent>
            <CardFooter>
              <span className="text-xs text-muted-foreground">
                {new Date(m.createdAt).toLocaleTimeString()}
              </span>
            </CardFooter>
          </Card>
        ))
      )}
    </div>
  );
}
