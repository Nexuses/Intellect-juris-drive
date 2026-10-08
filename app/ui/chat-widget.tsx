"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

type Message = { role: "user" | "assistant"; content: string };

export function ChatWidget({
  hint = "Ask where a file is, what is in a folder, for a summary, or about a link.",
}: {
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, pending, error, open]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || pending) return;

    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");
    setError(undefined);
    setPending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data: { reply?: string; error?: string } = await response.json();
      if (!response.ok || !data.reply) {
        setError(data.error ?? "Couldn't reach Jev.");
        return;
      }
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch {
      setError("Couldn't reach Jev.");
    } finally {
      setPending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {open && (
        <section
          aria-label="Jev chat"
          className="mb-3 flex h-[min(32rem,calc(100vh-7rem))] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-sand bg-white shadow-[0_12px_40px_rgba(41,45,48,0.16)]"
        >
          <header className="flex items-center gap-3 border-b border-sand px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-cream">
              <ChatIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Jev</p>
              <p className="text-xs text-ink/60">Ask about your drive</p>
            </div>
          </header>

          <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-cream px-4 py-4">
            {messages.length === 0 && (
              <p className="text-sm leading-6 text-ink/70">
                {hint}
              </p>
            )}
            {messages.map((message, index) => (
              <p
                key={`${message.role}-${index}`}
                className={
                  message.role === "user"
                    ? "ml-8 whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-3 py-2 text-sm leading-6 text-cream"
                    : "mr-8 whitespace-pre-wrap rounded-2xl rounded-bl-md bg-white px-3 py-2 text-sm leading-6 text-ink shadow-[0_1px_2px_rgba(41,45,48,0.06)]"
                }
              >
                {message.content}
              </p>
            ))}
            {pending && <p className="text-sm text-ink/50">Jev is writing...</p>}
            {error && <p className="text-sm text-[#8c3a32]">{error}</p>}
          </div>

          <form onSubmit={(event) => void send(event)} className="flex items-end gap-2 border-t border-sand p-3">
            <textarea
              ref={inputRef}
              value={draft}
              rows={2}
              placeholder="Message Jev"
              aria-label="Message Jev"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-sand bg-cream px-3 py-2 text-sm text-ink outline-none placeholder:text-ink/40 focus:border-gold"
            />
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-cream transition hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
            >
              <SendIcon />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        aria-label={open ? "Close chat" : "Open chat"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-cream shadow-[0_10px_28px_rgba(41,45,48,0.28)] transition duration-200 hover:-translate-y-0.5 hover:bg-gold"
      >
        {open ? <CloseIcon /> : <ChatIcon className="h-7 w-7" />}
      </button>
    </div>
  );
}

function ChatIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 3C6.48 3 2 6.94 2 11.8c0 2.55 1.32 4.84 3.4 6.4L4.2 21.5a.7.7 0 0 0 1 .76L9.1 20c.93.26 1.9.4 2.9.4 5.52 0 10-3.94 10-8.6S17.52 3 12 3z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M3.4 11.2 20.2 3.7a.8.8 0 0 1 1.1 1L16.7 20.4a.8.8 0 0 1-1.46.14l-2.7-6.16-6.16-2.7a.8.8 0 0 1-.02-1.48z" />
    </svg>
  );
}
