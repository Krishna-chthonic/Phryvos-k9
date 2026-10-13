import { CircleDashed } from "lucide-react";

/** Minimal placeholder for modules that land in a later build phase. */
export function ModulePending({
  title,
  note,
  phase,
}: {
  title: string;
  note: string;
  phase: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <CircleDashed className="h-8 w-8 text-zinc-400" />
      <div>
        <h1 className="text-lg font-medium text-zinc-900">{title}</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">{note}</p>
      </div>
      <span className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs text-zinc-500">
        arrives in {phase}
      </span>
    </div>
  );
}
