"use client";

import { useEffect, useState, useTransition } from "react";
import {
  applyOrganizeAction,
  planLooseFilesAction,
  planUploadAction,
  prepareFoldersAction,
} from "@/app/actions/organize";
import type { FolderOption } from "@/app/lib/drive";
import type { FilePlan, OrganizeTarget } from "@/app/lib/file-organizer";
import { Modal } from "@/app/ui/modal";
import { fileKind } from "./file-kind";
import { CaretDownIcon, FileTypeIcon, SparkIcon } from "./icons";

export type OrganizeMode = { kind: "upload"; files: File[] } | { kind: "loose" };

/** "e:<folder id>" for an existing folder, "n:<name>" for a new top-level folder. */
type Choice = string;

function choiceOf(target: OrganizeTarget): Choice {
  return target.kind === "existing" ? `e:${target.folderId}` : `n:${target.name}`;
}

function targetOf(choice: Choice, folders: FolderOption[]): OrganizeTarget {
  if (choice.startsWith("e:")) {
    const folderId = choice.slice(2);
    return { kind: "existing", folderId, path: folders.find((folder) => folder.id === folderId)?.path ?? "" };
  }
  return { kind: "new", name: choice.slice(2) };
}

function ConfidenceBadge({ plan }: { plan: FilePlan }) {
  if (!plan.byJev) {
    return <span className="whitespace-nowrap rounded-full bg-cream px-2 py-0.5 text-xs text-ink/55">By name</span>;
  }
  const percent = Math.round(plan.confidence * 100);
  const tone =
    percent >= 75 ? "bg-[#e7efe4] text-[#3d5a34]" : percent >= 50 ? "bg-sand text-ink/70" : "bg-[#f6ebe7] text-[#8c3a32]";
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>AI {percent}%</span>;
}

export function OrganizeDialog({
  mode,
  onClose,
  onUpload,
  onDone,
}: {
  mode: OrganizeMode;
  onClose: () => void;
  /** Upload mode: starts the uploads with the chosen folder for each file. */
  onUpload: (jobs: { file: File; parentId: string }[]) => void;
  onDone: (message: string) => void;
}) {
  const [plans, setPlans] = useState<FilePlan[] | null>(null);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const request =
      mode.kind === "upload"
        ? planUploadAction(mode.files.map((file) => ({ name: file.name, type: file.type })))
        : planLooseFilesAction();
    request
      .then((result) => {
        if (cancelled) return;
        if (result.error || !result.plans) {
          setError(result.error ?? "The AI could not organize these files.");
          setPlans([]);
          return;
        }
        setPlans(result.plans);
        setFolders(result.folders ?? []);
        setChoices(Object.fromEntries(result.plans.map((plan) => [plan.key, choiceOf(plan.target)])));
      })
      .catch(() => {
        if (cancelled) return;
        setError("The AI could not organize these files. Try again.");
        setPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const newNames = [
    ...new Set(
      (plans ?? []).flatMap((plan) => (plan.target.kind === "new" ? [plan.target.name] : [])),
    ),
  ];
  const chosenNew = new Set(
    Object.values(choices).flatMap((choice) => (choice.startsWith("n:") ? [choice.slice(2)] : [])),
  );
  const count = plans?.length ?? 0;
  const noun = count === 1 ? "file" : "files";

  function confirm() {
    if (!plans || plans.length === 0) return;
    setError(undefined);
    startTransition(async () => {
      if (mode.kind === "upload") {
        const created = chosenNew.size > 0 ? await prepareFoldersAction([...chosenNew]) : { folders: {} };
        if (created.error || !created.folders) {
          setError(created.error ?? "Couldn't create the folders.");
          return;
        }
        const ids = created.folders;
        const jobs = plans.flatMap((plan) => {
          const choice = choices[plan.key];
          const parentId = choice.startsWith("e:") ? choice.slice(2) : ids[choice.slice(2)];
          const file = mode.files[Number(plan.key)];
          return file && parentId ? [{ file, parentId }] : [];
        });
        onUpload(jobs);
        onClose();
        return;
      }

      const result = await applyOrganizeAction(
        plans.map((plan) => ({ fileId: plan.key, target: targetOf(choices[plan.key], folders) })),
      );
      if (result.error && !result.moved) {
        setError(result.error);
        return;
      }
      const moved = result.moved ?? 0;
      onDone(result.error ?? `AI organized ${moved} ${moved === 1 ? "file" : "files"} into folders.`);
      onClose();
    });
  }

  const title = mode.kind === "upload" ? "Organize uploads with AI" : "Organize files with AI";
  const description =
    mode.kind === "upload"
      ? "Files must go inside a folder. AI picked one for each file based on its name, type, and your folders. Change any choice before uploading."
      : "These files are outside any folder. AI picked a folder for each one based on its name, type, and your folders. Review and move them.";

  return (
    <Modal title={title} description={description} onClose={onClose} wide>
      {plans === null ? (
        <div className="flex items-center gap-3 rounded-xl bg-cream px-4 py-6 text-sm text-ink/70">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-sand border-t-gold" />
          AI is choosing folders...
        </div>
      ) : count === 0 ? (
        <p className="rounded-xl bg-cream px-4 py-6 text-sm text-ink/70">
          {error ?? (mode.kind === "loose" ? "Every file is already inside a folder." : "There are no files to organize.")}
        </p>
      ) : (
        <ul className="max-h-[50dvh] divide-y divide-sand overflow-y-auto rounded-xl border border-sand">
          {plans.map((plan) => (
            <li key={plan.key} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <FileTypeIcon kind={fileKind(null, plan.name)} className="h-6 w-6 shrink-0" />
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink" title={plan.name}>
                  {plan.name}
                </p>
                <ConfidenceBadge plan={plan} />
              </div>
              <div className="relative w-full sm:w-56">
              <select
                value={choices[plan.key]}
                onChange={(event) => setChoices((current) => ({ ...current, [plan.key]: event.target.value }))}
                aria-label={`Folder for ${plan.name}`}
                className="h-10 w-full appearance-none truncate rounded-full border border-sand bg-white pl-4 pr-10 text-base text-ink outline-none transition hover:border-gold/70 focus:border-gold sm:text-sm"
              >
                {newNames.length > 0 && (
                  <optgroup label="New folders">
                    {newNames.map((name) => (
                      <option key={`n:${name}`} value={`n:${name}`}>
                        + {name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {folders.length > 0 && (
                  <optgroup label="Your folders">
                    {folders.map((folder) => (
                      <option key={folder.id} value={`e:${folder.id}`}>
                        {folder.path}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <CaretDownIcon className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/60" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && count > 0 && <p className="mt-3 text-xs text-[#8c3a32]">{error}</p>}
      {count > 0 && chosenNew.size > 0 && (
        <p className="mt-3 text-xs text-ink/60">
          New {chosenNew.size === 1 ? "folder" : "folders"} to create: {[...chosenNew].join(", ")}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-full px-4 text-sm font-medium text-gold transition hover:bg-gold/10"
        >
          Cancel
        </button>
        {count > 0 && (
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-cream transition hover:bg-gold disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SparkIcon className="h-4 w-4" />
            {pending
              ? "Working..."
              : mode.kind === "upload"
                ? `Upload ${count} ${noun}`
                : `Move ${count} ${noun}`}
          </button>
        )}
      </div>
    </Modal>
  );
}
