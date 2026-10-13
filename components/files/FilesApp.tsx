"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronRight,
  Download,
  File as FileIcon,
  FilePlus2,
  Folder,
  FolderPlus,
  History,
  Pencil,
  Search,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { filesApi, type SearchHit, type VersionInfo } from "@/lib/api";
import type { FileMeta } from "@/lib/vault-service";

const CodeEditor = dynamic(
  () => import("@/components/files/CodeEditor").then((m) => m.Editor),
  {
    ssr: false,
    loading: () => <div className="p-4 text-sm text-zinc-400">Loading editor…</div>,
  },
);

const LANG: Record<string, string> = {
  ".md": "markdown",
  ".markdown": "markdown",
  ".txt": "plaintext",
  ".log": "plaintext",
  ".json": "json",
  ".js": "javascript",
  ".mjs": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".css": "css",
  ".html": "html",
  ".htm": "html",
  ".xml": "xml",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".sql": "sql",
  ".toml": "ini",
  ".svg": "xml",
  ".csv": "plaintext",
  ".sh": "shell",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
};

function isTextMime(m: string | null) {
  if (!m) return true;
  return (
    m.startsWith("text/") ||
    [
      "application/json",
      "application/xml",
      "application/javascript",
      "application/typescript",
      "application/yaml",
      "application/sql",
      "application/x-yaml",
      "image/svg+xml",
    ].includes(m)
  );
}

interface OpenDoc {
  path: string;
  text: string | null; // null = binary
  binary: ArrayBuffer | null;
  mime: string | null;
  dirty: boolean;
  versions: VersionInfo[];
  showVersions: boolean;
}

export function FilesApp() {
  const [children, setChildren] = useState<Record<string, FileMeta[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["/"]));
  const [doc, setDoc] = useState<OpenDoc | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [trash, setTrash] = useState<FileMeta[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [modal, setModal] = useState<
    | { kind: "new-file" | "new-dir"; parent: string }
    | { kind: "rename"; current: string }
    | null
  >(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const notice = useCallback((msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3500);
  }, []);

  const loadDir = useCallback(async (dir: string) => {
    if (dir in children) return;
    try {
      const res = await filesApi.listDir(dir);
      setChildren((c) => ({ ...c, [dir]: res.children }));
    } catch (e) {
      notice(e instanceof Error ? e.message : "Failed to list");
    }
  }, [children, notice]);

  const loadTrash = useCallback(async () => {
    try {
      setTrash((await filesApi.listTrash()).children);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadDir("/");
    loadTrash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // global search (debounced)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setHits((await filesApi.search(q)).hits);
      } catch {
        setHits([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const openFile = useCallback(
    async (path: string) => {
      try {
        const res = await filesApi.read(path);
        const ct = res.headers.get("content-type");
        const text = isTextMime(ct) ? await res.text() : null;
        const binary = text === null ? await res.arrayBuffer() : null;
        let versions: VersionInfo[] = [];
        try {
          versions = (await filesApi.versions(path)).versions;
        } catch {
          /* no versions yet */
        }
        setDoc({ path, text, binary, mime: ct, dirty: false, versions, showVersions: false });
      } catch (e) {
        notice(e instanceof Error ? e.message : "Failed to open");
      }
    },
    [notice],
  );

  const save = useCallback(async () => {
    if (!doc || doc.text === null || !doc.dirty) return;
    try {
      const meta = (await filesApi.writeText(doc.path, doc.text)).meta;
      setDoc((d) => (d ? { ...d, dirty: false } : d));
      notice(`Saved ${meta.path} (v${meta.version})`);
    } catch (e) {
      notice(e instanceof Error ? e.message : "Save failed");
    }
  }, [doc, notice]);

  const toggleDir = useCallback(
    (dir: string) => {
      setExpanded((s) => {
        const n = new Set(s);
        if (n.has(dir)) n.delete(dir);
        else {
          n.add(dir);
          loadDir(dir);
        }
        return n;
      });
    },
    [loadDir],
  );

  const doMove = useCallback(
    async (from: string, to: string) => {
      try {
        const { meta } = await filesApi.move(from, to);
        setChildren((c) => {
          const n: Record<string, FileMeta[]> = {};
          for (const [k, v] of Object.entries(c))
            n[k] = v.map((x) =>
              x.path === from ? { ...x, path: meta.path, name: meta.name } : x,
            );
          return n;
        });
        notice(`Moved to ${meta.path}`);
      } catch (e) {
        notice(e instanceof Error ? e.message : "Move failed");
      }
    },
    [notice],
  );

  const doDelete = useCallback(
    async (path: string) => {
      if (!confirm(`Move “${path}” to trash?`)) return;
      try {
        await filesApi.remove(path);
        if (doc?.path === path) setDoc(null);
        await loadTrash();
        notice("Moved to trash");
      } catch (e) {
        notice(e instanceof Error ? e.message : "Delete failed");
      }
    },
    [doc?.path, loadTrash, notice],
  );

  const doRestore = useCallback(
    async (path: string) => {
      try {
        await filesApi.restore(path);
        await loadTrash();
        notice(`Restored ${path}`);
      } catch (e) {
        notice(e instanceof Error ? e.message : "Restore failed");
      }
    },
    [loadTrash, notice],
  );

  const upload = useCallback(
    async (file: File, targetDir: string) => {
      const path = `${targetDir === "/" ? "" : targetDir}/${file.name}`;
      try {
        await filesApi.create(path, "file");
        await filesApi.writeRaw(path, await file.arrayBuffer(), file.type || undefined);
        await loadDir(targetDir);
        notice(`Uploaded ${path}`);
      } catch (e) {
        notice(e instanceof Error ? e.message : "Upload failed");
      }
    },
    [loadDir, notice],
  );

  const createNode = useCallback(
    async (kind: "file" | "dir", parent: string, name: string) => {
      const clean = name.replace(/^\/+/, "").replace(/[^a-zA-Z0-9._-]/g, "");
      if (!clean) return;
      const path = `${parent === "/" ? "" : parent}/${clean}`;
      try {
        await filesApi.create(path, kind);
        await loadDir(parent);
        notice(`Created ${path}`);
      } catch (e) {
        notice(e instanceof Error ? e.message : "Create failed");
      }
    },
    [loadDir, notice],
  );

  const currentDir = useMemo(() => {
    if (!doc) return "/";
    const i = doc.path.lastIndexOf("/");
    return i <= 0 ? "/" : doc.path.slice(0, i);
  }, [doc]);

  const language = useMemo(() => {
    if (!doc) return "plaintext";
    const dot = doc.path.lastIndexOf(".");
    return (dot >= 0 && LANG[doc.path.slice(dot).toLowerCase()]) || "plaintext";
  }, [doc]);

  const tree = (dir: string, depth: number): ReactNode | null => {
    const items = children[dir];
    if (!items) return null;
    return (
      <>
        {items.map((m) => (
          <div key={m.path}>
            <button
              onClick={() => (m.isDir ? toggleDir(m.path) : openFile(m.path))}
              style={{ paddingLeft: depth * 14 + 8 }}
              className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[13px] ${
                doc?.path === m.path
                  ? "bg-zinc-200/70 font-medium text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {m.isDir ? (
                <>
                  <ChevronRight
                    className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${
                      expanded.has(m.path) ? "rotate-90" : ""
                    }`}
                  />
                  <Folder className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                </>
              ) : (
                <FileIcon className="ml-1 h-3.5 w-3.5 shrink-0 text-zinc-400" />
              )}
              <span className="truncate">{m.name}</span>
            </button>
            {m.isDir && expanded.has(m.path) && <div>{tree(m.path, depth + 1)}</div>}
          </div>
        ))}
      </>
    );
  };

  return (
    <div className="flex h-full min-h-0">
      {/* left: search + tree + trash */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="p-3 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-zinc-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search vault…"
              className="w-full rounded-md border border-zinc-200 bg-zinc-50 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-zinc-300 focus:bg-white"
            />
          </div>
        </div>

        {hits !== null ? (
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              Results
            </div>
            {hits.length === 0 && <div className="px-2 text-sm text-zinc-400">No matches.</div>}
            {hits.map((h) => (
              <button
                key={h.path}
                onClick={() => (h.isDir ? loadDir(h.path) : openFile(h.path))}
                className="block w-full rounded px-2 py-1.5 text-left text-[13px] text-zinc-700 hover:bg-zinc-100"
              >
                <div className="truncate font-medium text-zinc-800">{h.name}</div>
                <div className="truncate text-[11px] text-zinc-400">{h.path}</div>
                {h.snippet && (
                  <div className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">{h.snippet}</div>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-2 pb-2">{tree("/", 0)}</div>
        )}

        {trash.length > 0 && (
          <div className="border-t border-zinc-200 p-2">
            <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              <Trash2 className="h-3 w-3" /> Trash
            </div>
            {trash.map((t) => (
              <div key={t.path} className="flex items-center gap-1 px-2 py-0.5 text-[13px] text-zinc-500">
                <span className="flex-1 truncate">{t.name}</span>
                <button
                  onClick={() => doRestore(t.path)}
                  title="Restore"
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* right: toolbar + content */}
      <main className="flex min-w-0 flex-1 flex-col bg-zinc-50">
        <div className="flex items-center gap-1 border-b border-zinc-200 bg-white px-3 py-2">
          <button
            onClick={() => setModal({ kind: "new-file", parent: currentDir })}
            className="tbtn"
            title="New file"
          >
            <FilePlus2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setModal({ kind: "new-dir", parent: currentDir })}
            className="tbtn"
            title="New folder"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
          <button onClick={() => fileInput.current?.click()} className="tbtn" title="Upload">
            <Upload className="h-4 w-4" />
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              Array.from(e.target.files ?? []).forEach((f) => upload(f, currentDir));
              e.target.value = "";
            }}
          />
          {doc && (
            <>
              <span className="mx-1 h-5 w-px bg-zinc-200" />
              <button
                onClick={() => setModal({ kind: "rename", current: doc.path })}
                className="tbtn"
                title="Rename / move"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => doDelete(doc.path)} className="tbtn" title="Delete to trash">
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setDoc((d) => (d ? { ...d, showVersions: !d.showVersions } : d))}
                className="tbtn"
                title="Version history"
              >
                <History className="h-4 w-4" />
              </button>
              <a href={filesApi.downloadUrl(doc.path)} className="tbtn" title="Download">
                <Download className="h-4 w-4" />
              </a>
            </>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
            {flash && <span className="max-w-[40%] truncate text-zinc-600">{flash}</span>}
            {doc && (
              <span className="max-w-[30%] truncate">
                {doc.path}
                {doc.dirty ? " •" : ""}
              </span>
            )}
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden">
          {!doc && (
            <div className="flex h-full items-center justify-center text-sm text-zinc-400">
              Select a file, or create / upload one.
            </div>
          )}

          {doc && doc.text !== null && (
            <CodeEditor
              value={doc.text}
              language={language}
              theme="vs"
              onChange={(v) => setDoc((d) => (d ? { ...d, text: v ?? "", dirty: true } : d))}
              onMount={(editor, monaco) => {
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, save);
              }}
              className="h-full"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                automaticLayout: true,
                wordWrap: "on",
                scrollBeyondLastLine: false,
                padding: { top: 12 },
              }}
            />
          )}

          {doc && doc.text === null && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <span className="text-sm text-zinc-500">
                {doc.mime?.startsWith("image/")
                  ? "Image"
                  : doc.mime?.startsWith("audio/")
                    ? "Audio"
                    : doc.mime?.startsWith("video/")
                      ? "Video"
                      : "Binary"}{" "}
                file — {doc.path}
              </span>
              {doc.mime?.startsWith("image/") && doc.binary && (
                <img
                  src={URL.createObjectURL(new Blob([doc.binary], { type: doc.mime }))}
                  alt={doc.path}
                  className="max-h-[60vh] max-w-[80%] rounded border border-zinc-200 object-contain"
                />
              )}
              <a
                href={filesApi.downloadUrl(doc.path)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Download
              </a>
            </div>
          )}

          {doc?.showVersions && (
            <div className="absolute right-0 top-0 h-full w-72 border-l border-zinc-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
                <span className="text-sm font-medium text-zinc-800">History</span>
                <button
                  onClick={() => setDoc((d) => (d ? { ...d, showVersions: false } : d))}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="overflow-y-auto p-2">
                {doc.versions.length === 0 && (
                  <div className="p-2 text-sm text-zinc-400">No previous versions yet.</div>
                )}
                {doc.versions.map((v) => (
                  <div key={v.version} className="rounded px-2 py-1.5 text-sm hover:bg-zinc-50">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-zinc-800">v{v.version}</span>
                      <span className="text-[11px] text-zinc-400">
                        {new Date(v.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {v.note && <div className="text-[11px] text-zinc-500">{v.note}</div>}
                    <button
                      onClick={async () => {
                        try {
                          await filesApi.restoreVersion(doc.path, v.version);
                          const res = await filesApi.read(doc.path);
                          const ct = res.headers.get("content-type");
                          const text = isTextMime(ct) ? await res.text() : null;
                          const binary = text === null ? await res.arrayBuffer() : null;
                          const versions = (await filesApi.versions(doc.path)).versions;
                          setDoc((d) =>
                            d
                              ? {
                                  ...d,
                                  text,
                                  binary,
                                  mime: ct,
                                  dirty: false,
                                  versions,
                                }
                              : d,
                          );
                          notice(`Restored v${v.version}`);
                        } catch (e) {
                          notice(e instanceof Error ? e.message : "Restore failed");
                        }
                      }}
                      className="mt-1 rounded border border-zinc-300 bg-white px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-50"
                    >
                      Restore this version
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* modal: new / rename */}
      {modal && (
        <Modal
          title={
            modal.kind === "rename"
              ? `Rename / move ${modal.current}`
              : modal.kind === "new-dir"
                ? `New folder in ${modal.parent}`
                : `New file in ${modal.parent}`
          }
          confirmLabel={modal.kind === "rename" ? "Move" : "Create"}
          onCancel={() => setModal(null)}
          onConfirm={async (name) => {
            if (modal.kind === "rename") {
              // absolute path, or relative to the file's directory
              const i = modal.current.lastIndexOf("/");
              const dir = i <= 0 ? "/" : modal.current.slice(0, i);
              const to = name.startsWith("/") ? name : `${dir}/${name}`;
              await doMove(modal.current, to);
            } else {
              await createNode(modal.kind === "new-dir" ? "dir" : "file", modal.parent, name);
            }
            setModal(null);
          }}
          defaultValue={modal.kind === "rename" ? modal.current : ""}
          placeholder={
            modal.kind === "rename" ? "New name or full path, e.g. /notes/new.md" : "Name"
          }
        />
      )}

      <style jsx global>{`
        .tbtn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          color: #52525b;
        }
        .tbtn:hover {
          background: #f4f4f5;
          color: #18181b;
        }
      `}</style>
    </div>
  );
}

function Modal({
  title,
  confirmLabel,
  defaultValue,
  placeholder,
  onConfirm,
  onCancel,
}: {
  title: string;
  confirmLabel: string;
  defaultValue: string;
  placeholder: string;
  onConfirm: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(defaultValue), [defaultValue]);
  const submit = () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    onConfirm(value.trim()).finally(() => setBusy(false));
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-sm font-medium text-zinc-800">{title}</div>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={placeholder}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-400"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            disabled={!value.trim() || busy}
            onClick={submit}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
