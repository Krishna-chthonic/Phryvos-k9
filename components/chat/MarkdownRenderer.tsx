"use client";

import React, { memo, useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Check, Copy } from "lucide-react";

function extractText(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return extractText((node as { props: { children?: unknown } }).props.children);
  }
  return "";
}

/**
 * Isolated memoized CodeBlock with copy state & timer cleanup (CHAT-53 & CHAT-54).
 * Prevents re-parsing Markdown and KaTeX math ASTs whenever code copy state toggles.
 */
export const CodeBlock = memo(function CodeBlock({
  children,
}: {
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const codeProps = (
    children as React.ReactElement<{ className?: string; children?: unknown }>
  )?.props;
  const langMatch = codeProps?.className?.match(/language-([a-zA-Z0-9_-]+)/);
  const lang = langMatch ? langMatch[1].toUpperCase() : "CODE";
  const codeText = extractText(codeProps?.children ?? children);

  const handleCopy = async () => {
    if (!codeText) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(codeText);
      } else {
        throw new Error("Clipboard API unavailable");
      }
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = codeText;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), 2000);
      } catch {
        // clipboard completely blocked
      }
    }
  };

  return (
    <div className="relative group my-3 overflow-hidden rounded-xl bg-zinc-900 text-zinc-100 shadow-md border border-zinc-800">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/80 border-b border-zinc-700/50 text-[11px] text-zinc-400 font-mono">
        <span>{lang}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-zinc-200 transition cursor-pointer select-none"
          aria-label={`Copy ${lang} snippet`}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs font-mono leading-normal">
        {children}
      </pre>
    </div>
  );
});

export const MarkdownRenderer = memo(function MarkdownRenderer({
  children,
}: {
  children: string;
}) {
  return (
    <div className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-100 space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre: ({ children: preChildren }) => <CodeBlock>{preChildren}</CodeBlock>,
          code: ({ children: codeChildren, className }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) return <code>{codeChildren}</code>;
            return (
              <code className="rounded-md bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 text-xs font-mono text-zinc-800 border border-zinc-200/60 dark:border-zinc-700">
                {codeChildren}
              </code>
            );
          },
          p: ({ children: pChildren }) => (
            <p className="leading-relaxed mb-2 last:mb-0">{pChildren}</p>
          ),
          ul: ({ children: ulChildren }) => (
            <ul className="list-disc pl-5 my-2 space-y-1">{ulChildren}</ul>
          ),
          ol: ({ children: olChildren }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1">{olChildren}</ol>
          ),
          li: ({ children: liChildren }) => <li className="leading-relaxed">{liChildren}</li>,
          table: ({ children: tableChildren }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs border-collapse">
                {tableChildren}
              </table>
            </div>
          ),
          thead: ({ children: theadChildren }) => (
            <thead className="bg-zinc-100/80 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 border-b border-zinc-200 dark:border-zinc-800">
              {theadChildren}
            </thead>
          ),
          th: ({ children: thChildren }) => (
            <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-300">
              {thChildren}
            </th>
          ),
          td: ({ children: tdChildren }) => (
            <td className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800/50 text-zinc-800 dark:text-zinc-200">
              {tdChildren}
            </td>
          ),
          h1: ({ children: h1Children }) => (
            <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mt-3 mb-1.5">
              {h1Children}
            </h1>
          ),
          h2: ({ children: h2Children }) => (
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-2.5 mb-1">
              {h2Children}
            </h2>
          ),
          h3: ({ children: h3Children }) => (
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mt-2 mb-1">
              {h3Children}
            </h3>
          ),
          a: ({ children: aChildren, href }) => {
            const isSafe =
              href &&
              !href.startsWith("//") &&
              (href.startsWith("http://") ||
                href.startsWith("https://") ||
                href.startsWith("/") ||
                href.startsWith("#") ||
                href.startsWith("mailto:"));

            if (!isSafe) {
              return <span>{aChildren}</span>;
            }

            const isExternal = href.startsWith("http://") || href.startsWith("https://");
            return (
              <a
                href={href}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
                className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {aChildren}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
