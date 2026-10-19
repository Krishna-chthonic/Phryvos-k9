/**
 * DAG Scheduling & Critical Path Method (CPM) Engine
 * 
 * Implements:
 * 1. Topological Sorting with Cycle Detection (Kahn's Algorithm)
 * 2. Critical Path Method (CPM):
 *    - Forward Pass: Earliest Start (ES), Earliest Finish (EF)
 *    - Backward Pass: Latest Finish (LF), Latest Start (LS)
 *    - Total Float / Slack calculation: Slack = LS - ES
 *    - Critical Path: Nodes with Total Float <= 0
 * 3. Type-Checked Syllabus AST & Conceptual Debt:
 *    - Checks if prerequisites meet mastery threshold (>= 70%)
 *    - Blocks downstream topics if debt > 0
 * 4. Adaptive Re-Scheduler with Unified Diff:
 *    - Automatically calculates downstream schedule slips
 */

export interface DagNode {
  id: string;
  name: string;
  durationHours: number;
  progressPct: number; // 0 - 100
  prerequisites: string[]; // IDs of prerequisite nodes
  startDate?: string | null;
  dueDate?: string | null;
}

export interface CpmNodeResult extends DagNode {
  es: number; // Earliest Start (hours from project start)
  ef: number; // Earliest Finish
  ls: number; // Latest Start
  lf: number; // Latest Finish
  slack: number; // Float = ls - es
  isCritical: boolean;
  blockedByDebt: boolean;
  debtReason?: string;
}

export interface CpmScheduleResult {
  nodes: Record<string, CpmNodeResult>;
  criticalPath: string[]; // IDs of nodes on the critical path in order
  projectDurationHours: number;
  hasCycles: boolean;
  cycleNodes?: string[];
  totalDebtCount: number;
}

export interface ScheduleDiffItem {
  nodeId: string;
  nodeName: string;
  originalStartDate: string | null;
  newStartDate: string | null;
  shiftHours: number;
  reason: string;
}

/**
 * Computes CPM (Critical Path Method) for a directed acyclic graph of tasks/topics
 */
export function computeCpmSchedule(
  nodesList: DagNode[],
  options?: {
    masteryThresholdPct?: number; // default 70%
    projectStartHours?: number; // default 0
  }
): CpmScheduleResult {
  const threshold = options?.masteryThresholdPct ?? 70;
  const nodesMap = new Map<string, DagNode>();
  const inDegree = new Map<string, number>();
  const dependentsMap = new Map<string, string[]>(); // node -> list of nodes depending on it

  for (const n of nodesList) {
    nodesMap.set(n.id, n);
    inDegree.set(n.id, 0);
    dependentsMap.set(n.id, []);
  }

  for (const n of nodesList) {
    for (const prereqId of n.prerequisites) {
      if (nodesMap.has(prereqId)) {
        dependentsMap.get(prereqId)!.push(n.id);
        inDegree.set(n.id, (inDegree.get(n.id) || 0) + 1);
      }
    }
  }

  // 1. Topological Sort (Kahn's Algorithm)
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    topoOrder.push(curr);

    for (const depId of dependentsMap.get(curr) || []) {
      const nextDeg = (inDegree.get(depId) || 1) - 1;
      inDegree.set(depId, nextDeg);
      if (nextDeg === 0) queue.push(depId);
    }
  }

  // If cycle detected
  if (topoOrder.length !== nodesList.length) {
    const cycleNodes = nodesList.filter((n) => !topoOrder.includes(n.id)).map((n) => n.id);
    return {
      nodes: {},
      criticalPath: [],
      projectDurationHours: 0,
      hasCycles: true,
      cycleNodes,
      totalDebtCount: 0,
    };
  }

  // 2. Forward Pass: Earliest Start (ES) and Earliest Finish (EF)
  const esMap = new Map<string, number>();
  const efMap = new Map<string, number>();

  for (const id of topoOrder) {
    const node = nodesMap.get(id)!;
    let maxPrereqEf = options?.projectStartHours ?? 0;

    for (const prereqId of node.prerequisites) {
      if (efMap.has(prereqId)) {
        maxPrereqEf = Math.max(maxPrereqEf, efMap.get(prereqId)!);
      }
    }

    const es = maxPrereqEf;
    const ef = es + Math.max(node.durationHours, 0.5);
    esMap.set(id, es);
    efMap.set(id, ef);
  }

  const projectDurationHours = Math.max(...Array.from(efMap.values()), 0);

  // 3. Backward Pass: Latest Finish (LF) and Latest Start (LS)
  const lfMap = new Map<string, number>();
  const lsMap = new Map<string, number>();

  // Process in reverse topological order
  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const id = topoOrder[i];
    const node = nodesMap.get(id)!;
    const deps = dependentsMap.get(id) || [];

    let minDepLs = projectDurationHours;
    if (deps.length > 0) {
      minDepLs = Math.min(...deps.map((depId) => lsMap.get(depId)!));
    }

    const lf = minDepLs;
    const ls = lf - Math.max(node.durationHours, 0.5);
    lfMap.set(id, lf);
    lsMap.set(id, ls);
  }

  // 4. Calculate Slacks & Prerequisite Conceptual Debt
  const resultMap: Record<string, CpmNodeResult> = {};
  const criticalPath: string[] = [];
  let totalDebtCount = 0;

  for (const id of topoOrder) {
    const node = nodesMap.get(id)!;
    const es = esMap.get(id)!;
    const ef = efMap.get(id)!;
    const ls = lsMap.get(id)!;
    const lf = lfMap.get(id)!;
    const slack = Math.max(0, Number((ls - es).toFixed(2)));
    const isCritical = slack <= 0.05;

    // Check prerequisite debt
    let blockedByDebt = false;
    const debtReasons: string[] = [];

    for (const prereqId of node.prerequisites) {
      const prereqNode = nodesMap.get(prereqId);
      if (prereqNode && prereqNode.progressPct < threshold) {
        blockedByDebt = true;
        debtReasons.push(
          `Prerequisite "${prereqNode.name}" is only at ${prereqNode.progressPct}% (needs ${threshold}%)`
        );
      }
    }

    if (blockedByDebt) totalDebtCount++;

    const cpmNode: CpmNodeResult = {
      ...node,
      es,
      ef,
      ls,
      lf,
      slack,
      isCritical,
      blockedByDebt,
      debtReason: debtReasons.length > 0 ? debtReasons.join("; ") : undefined,
    };

    resultMap[id] = cpmNode;
    if (isCritical) {
      criticalPath.push(id);
    }
  }

  return {
    nodes: resultMap,
    criticalPath,
    projectDurationHours,
    hasCycles: false,
    totalDebtCount,
  };
}

/**
 * Adaptive Re-Scheduler: Computes schedule shifts if an upstream topic is delayed
 */
export function computeScheduleDiff(
  originalNodes: DagNode[],
  delayedNodeId: string,
  addedDelayHours: number
): ScheduleDiffItem[] {
  const originalCpm = computeCpmSchedule(originalNodes);
  
  // Clone and apply delay to node duration
  const modifiedNodes = originalNodes.map((n) => {
    if (n.id === delayedNodeId) {
      return { ...n, durationHours: n.durationHours + addedDelayHours };
    }
    return n;
  });

  const newCpm = computeCpmSchedule(modifiedNodes);
  const diffs: ScheduleDiffItem[] = [];

  for (const n of originalNodes) {
    const orig = originalCpm.nodes[n.id];
    const updated = newCpm.nodes[n.id];
    if (!orig || !updated) continue;

    const shift = Number((updated.es - orig.es).toFixed(2));
    if (shift > 0.01) {
      diffs.push({
        nodeId: n.id,
        nodeName: n.name,
        originalStartDate: n.startDate || `T+${orig.es}h`,
        newStartDate: `T+${updated.es}h`,
        shiftHours: shift,
        reason:
          n.id === delayedNodeId
            ? `Direct delay added (+${addedDelayHours}h)`
            : `Pushed by prerequisite chain (+${shift}h)`,
      });
    }
  }

  return diffs;
}
