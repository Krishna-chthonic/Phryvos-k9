import type { AiMode, EffortLevel } from "@/lib/ai/modes-and-effort";

/** Live tool execution reported by the SSE `step` event. */
export interface StepEvt {
  step: number;
  toolCallId: string;
  tool: string;
  args: Record<string, unknown>;
  result: string;
  approval?: string;
}

/** Destructive tool awaiting the user — the SSE `approval` event. */
export interface ApprovalReq {
  approvalId: string;
  tool: string;
  args: Record<string, unknown>;
  description: string;
}

export interface ModeAndEffortBarProps {
  mode: AiMode;
  onModeChange: (mode: AiMode) => void;
  effort: EffortLevel;
  onEffortChange: (effort: EffortLevel) => void;
  disabled?: boolean;
}
