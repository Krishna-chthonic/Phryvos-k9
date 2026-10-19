"use client";

import React from "react";

export function EditBox({
  value,
  onChange,
  onSave,
  onCancel,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="mx-auto my-2 w-full max-w-5xl rounded-2xl border border-zinc-300 bg-white p-3 shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full resize-none bg-transparent text-sm text-zinc-800 dark:text-zinc-100 outline-none"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-xl border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 cursor-pointer dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={busy || !value.trim()}
          className="rounded-xl bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-40 shadow-xs cursor-pointer dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Save & resend
        </button>
      </div>
    </div>
  );
}
