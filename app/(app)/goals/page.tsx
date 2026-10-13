import { GoalsApp } from "@/components/goals/GoalsApp";

/**
 * P6: Goals page — importers: none, this is the entry point.
 * Callers: GoalsApp component which calls /api/goals, /api/goals/:id/milestones
 * Data schemas: goals, goal_milestones
 * User instruction: continue
 */
export default function GoalsPage() {
  return <GoalsApp />;
}
