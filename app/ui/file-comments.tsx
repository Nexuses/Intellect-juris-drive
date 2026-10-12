"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import {
  addCommentAction,
  deleteCommentAction,
  listCommentsAction,
  type CommentViewer,
} from "@/app/actions/comments";
import { CommentIcon, TrashIcon } from "@/app/dashboard/ui/icons";
import type { FileComment } from "@/app/lib/file-comments";

const MAX_COMMENT_LENGTH = 2000;
export const OPEN_COMMENTS_EVENT = "drive:open-comments";

/** Asks the drive browser to preview `fileId` with its comments open. */
export function openFileComments(fileId: string) {
  window.dispatchEvent(new CustomEvent<string>(OPEN_COMMENTS_EVENT, { detail: fileId }));
}

function formatCommentDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function countAll(comments: FileComment[]) {
  return comments.reduce((sum, comment) => sum + 1 + comment.replies.length, 0);
}

function CommentForm({
  placeholder,
  submitLabel,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  onSubmit: (text: string) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [saving, startSaving] = useTransition();

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || saving) return;
    startSaving(async () => {
      if (await onSubmit(text)) setDraft("");
    });
  }

  return (
    <form onSubmit={submit}>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) submit();
          if (event.key === "Escape" && onCancel) {
            event.stopPropagation();
            onCancel();
          }
        }}
        autoFocus={autoFocus}
        maxLength={MAX_COMMENT_LENGTH}
        rows={onCancel ? 2 : 3}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full resize-none rounded-xl border border-sand bg-white px-3 py-2 text-base text-ink outline-none transition placeholder:text-ink/40 focus:border-gold sm:text-sm"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink/45">Ctrl + Enter to send</span>
        <div className="flex items-center gap-1">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-ink/60 transition hover:bg-sand hover:text-ink"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!draft.trim() || saving}
            className="rounded-full bg-gold px-4 py-1.5 text-sm font-medium text-cream transition hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Sending..." : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

function CommentCard({
  comment,
  canDelete,
  onDelete,
  compact,
}: {
  comment: FileComment;
  canDelete: boolean;
  onDelete: () => void;
  compact?: boolean;
}) {
  return (
    <div className="group">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-ink">
            <span className="truncate">{comment.authorName}</span>
            {comment.authorRole === "admin" && (
              <span className="shrink-0 rounded-full bg-ink px-1.5 py-px text-[10px] font-medium text-cream">Admin</span>
            )}
          </p>
          <p className="text-[11px] text-ink/50" suppressHydrationWarning>
            {formatCommentDate(comment.createdAt)}
          </p>
        </div>
        {canDelete && (
          <button
            type="button"
            aria-label="Delete comment"
            title="Delete comment"
            onClick={onDelete}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink/40 transition hover:bg-sand hover:text-ink sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      <p
        className={`whitespace-pre-wrap break-words text-ink [overflow-wrap:anywhere] ${compact ? "mt-1 text-[13px]" : "mt-2 text-sm"}`}
      >
        {comment.text}
      </p>
    </div>
  );
}

/** Comment thread for one file. `onChange` runs after a comment is added or deleted. */
export function FileComments({ fileId, onChange }: { fileId: string; onChange?: () => void }) {
  const [comments, setComments] = useState<FileComment[] | null>(null);
  const [viewer, setViewer] = useState<CommentViewer | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollOnNext = useRef(true);

  useEffect(() => {
    let active = true;
    listCommentsAction(fileId).then((result) => {
      if (!active) return;
      setComments(result.comments ?? []);
      setViewer(result.viewer ?? null);
      if (result.error) setError(result.error);
    });
    return () => {
      active = false;
    };
  }, [fileId]);

  useEffect(() => {
    if (!comments || !scrollOnNext.current) return;
    scrollOnNext.current = false;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [comments]);

  async function post(text: string, parentId?: string) {
    setError(null);
    const result = await addCommentAction(fileId, text, parentId);
    if (result.error || !result.comment) {
      setError(result.error ?? "The comment could not be sent.");
      return false;
    }
    const comment = result.comment;
    if (!parentId) scrollOnNext.current = true;
    setComments((current) =>
      parentId
        ? (current ?? []).map((thread) =>
            thread.id === parentId ? { ...thread, replies: [...thread.replies, comment] } : thread,
          )
        : [...(current ?? []), comment],
    );
    setReplyTo(null);
    onChange?.();
    return true;
  }

  function remove(commentId: string) {
    setError(null);
    const previous = comments;
    setComments((current) =>
      (current ?? [])
        .filter((thread) => thread.id !== commentId)
        .map((thread) => ({ ...thread, replies: thread.replies.filter((reply) => reply.id !== commentId) })),
    );
    deleteCommentAction(commentId).then((result) => {
      if (result.error) {
        setError(result.error);
        setComments(previous);
      } else {
        onChange?.();
      }
    });
  }

  const canDelete = (comment: FileComment) =>
    Boolean(viewer && (viewer.isAdmin || viewer.id === comment.authorId));
  const total = comments ? countAll(comments) : 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-cream">
      <div className="flex shrink-0 items-center gap-2 border-b border-sand px-4 py-3">
        <CommentIcon className="h-[18px] w-[18px] text-gold" />
        <h2 className="text-sm font-medium text-ink">Comments</h2>
        {total > 0 && <span className="rounded-full bg-sand px-2 py-0.5 text-xs text-ink/70">{total}</span>}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {comments === null ? (
          <p className="text-sm text-ink/55">Loading comments...</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-ink/55">
            No comments yet.{" "}
            {viewer?.isAdmin ? "Leave a comment for the file's owner below." : "Add a comment about this file below."}
          </p>
        ) : (
          comments.map((thread) => (
            <article key={thread.id} className="rounded-xl bg-white p-3 shadow-[0_1px_2px_rgba(41,45,48,0.06)]">
              <CommentCard comment={thread} canDelete={canDelete(thread)} onDelete={() => remove(thread.id)} />

              {thread.replies.length > 0 && (
                <div className="mt-3 space-y-3 border-l-2 border-sand pl-3">
                  {thread.replies.map((reply) => (
                    <CommentCard
                      key={reply.id}
                      comment={reply}
                      compact
                      canDelete={canDelete(reply)}
                      onDelete={() => remove(reply.id)}
                    />
                  ))}
                </div>
              )}

              {replyTo === thread.id ? (
                <div className="mt-3">
                  <CommentForm
                    placeholder={`Reply to ${thread.authorName}`}
                    submitLabel="Reply"
                    autoFocus
                    onSubmit={(text) => post(text, thread.id)}
                    onCancel={() => setReplyTo(null)}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setReplyTo(thread.id)}
                  className="mt-2 rounded-full px-2 py-1 text-xs font-medium text-gold transition hover:bg-sand"
                >
                  Reply
                </button>
              )}
            </article>
          ))
        )}
      </div>

      <div className="shrink-0 border-t border-sand p-3">
        {error && <p className="mb-2 text-xs text-[#8c3a32]">{error}</p>}
        <CommentForm placeholder="Write a comment..." submitLabel="Comment" onSubmit={(text) => post(text)} />
      </div>
    </div>
  );
}
