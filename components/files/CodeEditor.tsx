"use client";

/**
 * Monaco wrapper — prebuilt `min` build served from public/monaco/vs
 * (copy script: `npm run monaco:copy`). The loader fetches it at runtime,
 * so webpack never bundles/compiles the editor source and the editor
 * worker comes from the same prebuilt tree. Zero cost on other routes:
 * this module only loads when a text file is opened (ssr:false).
 */
import loader from "@monaco-editor/loader";
import { Editor } from "@monaco-editor/react";

loader.config({
  paths: { vs: "/monaco/vs" },
});

export { Editor };
