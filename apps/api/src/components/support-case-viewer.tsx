"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Send,
  Clock,
  CheckCircle2,
  MessageCircle,
  Copy,
  Check,
} from "lucide-react";

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

function useElapsedSeconds(since: Date | null): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!since) {
      setElapsed(0);
      return;
    }
    setElapsed(Math.floor((Date.now() - since.getTime()) / 1000));
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - since.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [since]);

  return elapsed;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatResponseTime(
  userMsg: SupportMessage,
  adminMsg: SupportMessage,
): string {
  const diffMs =
    new Date(adminMsg.createdAt).getTime() -
    new Date(userMsg.createdAt).getTime();
  const totalSeconds = Math.max(0, Math.round(diffMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds} seconds`;
  const m = Math.floor(totalSeconds / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function SupportCaseViewer({
  caseId,
  initialMessages,
}: SupportCaseViewerProps) {
  const [messages, setMessages] = useState<SupportMessage[]>(
    initialMessages ?? [],
  );
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const lastUserMessage = [...messages]
    .filter((m) => m.adminId === null)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
  const firstAdminAfterLastUser = lastUserMessage
    ? messages.find(
        (m) =>
          m.adminId !== null &&
          new Date(m.createdAt).getTime() >
            new Date(lastUserMessage.createdAt).getTime(),
      )
    : null;

  const isWaiting =
    lastUserMessage !== undefined && firstAdminAfterLastUser === null;
  const waitingSince = isWaiting ? new Date(lastUserMessage.createdAt) : null;
  const elapsedSeconds = useElapsedSeconds(waitingSince);

  const fetchMessages = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/support/${id}/messages`);
      if (!res.ok) return;
      const msgs: SupportMessage[] = await res.json();
      setMessages(msgs);
    } catch {
      // ignore polling errors
    }
  }, []);

  const startPolling = useCallback(
    (id: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (!initialMessages) {
        void fetchMessages(id);
      }
      pollRef.current = setInterval(() => fetchMessages(id), 4000);
    },
    [initialMessages, fetchMessages],
  );

  useEffect(() => {
    startPolling(caseId);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [caseId, startPolling]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const content = newMessage.trim();
    if (!content) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/${caseId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      const msg: SupportMessage = await res.json();
      setMessages((prev) => [...prev, msg]);
      setNewMessage("");
    } catch {
      // allow retry
    } finally {
      setSending(false);
    }
  }

  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card overflow-hidden">
      {/* Chat header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageCircle className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Support Chat</span>
        <span
          className="relative flex size-2"
          title="Live — polling for updates"
        >
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        <CopyableCaseId caseId={caseId} />
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-[280px] max-h-[480px]"
      >
        {sorted.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            No messages yet.
          </p>
        )}

        {sorted.map((m) => {
          const isUser = m.adminId === null;
          return (
            <div
              key={m.id}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] space-y-1 ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                    isUser
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  }`}
                >
                  {m.content}
                </div>
                <div
                  className={`flex items-center gap-1.5 px-1 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <span className="text-[11px] text-muted-foreground">
                    {isUser ? "You" : "Support Agent"}
                  </span>
                  <span className="text-[11px] text-muted-foreground/60">
                    &middot;
                  </span>
                  <span className="text-[11px] text-muted-foreground/60">
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Waiting indicator */}
        {isWaiting && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-muted/60 px-3.5 py-2.5 rounded-bl-md">
              <div className="flex gap-1">
                <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3" />
                <span>
                  Waiting for agent &middot; {formatElapsed(elapsedSeconds)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Response-time badge when admin has responded */}
        {lastUserMessage && firstAdminAfterLastUser && (
          <div className="flex justify-center py-1">
            <div className="flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1">
              <CheckCircle2 className="size-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">
                Agent responded in{" "}
                {formatResponseTime(lastUserMessage, firstAdminAfterLastUser)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-border px-3 py-3 bg-muted/30"
      >
        <Input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message…"
          disabled={sending}
          className="flex-1 bg-background"
          autoComplete="off"
        />
        <Button
          type="submit"
          size="icon"
          disabled={sending || !newMessage.trim()}
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </form>
    </div>
  );
}

function CopyableCaseId({ caseId }: { caseId: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(caseId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-auto flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground font-mono transition-colors hover:bg-muted hover:text-foreground"
    >
      <span>{caseId}</span>
      {copied ? (
        <Check className="size-3 text-green-500" />
      ) : (
        <Copy className="size-3" />
      )}
    </button>
  );
}
