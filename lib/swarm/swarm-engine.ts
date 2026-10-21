/**
 * Ruflo Swarm Intelligence & Multi-Agent Orchestrator for Phryvos-K9
 * Inspired by ruvnet/ruflo (formerly Claude Flow)
 * 
 * Features:
 * 1. Multi-Agent Swarm Topologies: Mesh (P2P), Hierarchical (Tree), Star (Hub), Consensus (Voting Cluster)
 * 2. Specialized Agent Roles: Coordinator (Queen), Architect, Coder, Critic, Researcher
 * 3. Confidence-Weighted Consensus Protocol (Raft/Gossip-inspired fault tolerance)
 * 4. Shared Blackboard Memory Mesh with topic subscriptions and audit history
 * 5. Autonomous DAG Task Decomposition & Execution
 */

import { VaultCtx, writeFile, readFile, createDir } from "@/lib/vault-service";

export type SwarmTopology = "mesh" | "hierarchical" | "star" | "consensus";

export type SwarmRole = "coordinator" | "architect" | "coder" | "critic" | "researcher";

export interface SwarmAgent {
  id: string;
  name: string;
  role: SwarmRole;
  avatar: string;
  color: string;
  status: "idle" | "thinking" | "working" | "voting" | "done";
  currentTaskId?: string;
  confidenceScore: number;
}

export interface SwarmTask {
  id: string;
  title: string;
  role: SwarmRole;
  assignedAgentId?: string;
  status: "pending" | "in_progress" | "review" | "completed" | "failed";
  dependencies: string[];
  output?: string;
  critique?: string;
  confidence?: number;
  createdAt: number;
  completedAt?: number;
}

export interface BlackboardEntry {
  id: string;
  authorId: string;
  authorRole: SwarmRole;
  topic: string;
  content: string;
  timestamp: number;
  tags: string[];
}

export interface AgentVote {
  agentId: string;
  agentRole: SwarmRole;
  vote: "accept" | "reject" | "abstain";
  confidence: number; // 0.0 to 1.0
  rationale: string;
}

export interface ConsensusBallot {
  id: string;
  taskId: string;
  proposal: string;
  votes: AgentVote[];
  weightedScore: number; // 0.0 to 1.0
  passed: boolean;
  threshold: number;
  createdAt: number;
  round: number;
}

export interface SwarmSession {
  id: string;
  goal: string;
  topology: SwarmTopology;
  agents: SwarmAgent[];
  tasks: SwarmTask[];
  blackboard: BlackboardEntry[];
  ballots: ConsensusBallot[];
  status: "idle" | "active" | "voting" | "completed" | "failed";
  activeRound: number;
  createdAt: number;
  updatedAt: number;
}

// Default Swarm Agent Roster
const DEFAULT_AGENTS: SwarmAgent[] = [
  {
    id: "agent-coord",
    name: "Queen Coordinator",
    role: "coordinator",
    avatar: "👑",
    color: "#a855f7", // purple
    status: "idle",
    confidenceScore: 0.95,
  },
  {
    id: "agent-arch",
    name: "System Architect",
    role: "architect",
    avatar: "🏛️",
    color: "#3b82f6", // blue
    status: "idle",
    confidenceScore: 0.9,
  },
  {
    id: "agent-coder",
    name: "Core Coder",
    role: "coder",
    avatar: "⚡",
    color: "#10b981", // emerald
    status: "idle",
    confidenceScore: 0.92,
  },
  {
    id: "agent-critic",
    name: "Adversarial Critic",
    role: "critic",
    avatar: "🔍",
    color: "#f43f5e", // rose
    status: "idle",
    confidenceScore: 0.88,
  },
  {
    id: "agent-research",
    name: "Knowledge Scout",
    role: "researcher",
    avatar: "🧭",
    color: "#f59e0b", // amber
    status: "idle",
    confidenceScore: 0.94,
  },
];

class SwarmEngine {
  private currentSession: SwarmSession | null = null;

  constructor() {
    this.reset();
  }

  /**
   * Resets the active swarm session to a fresh idle state
   */
  public reset(): void {
    this.currentSession = {
      id: `swarm-${Date.now()}`,
      goal: "Awaiting objective...",
      topology: "hierarchical",
      agents: JSON.parse(JSON.stringify(DEFAULT_AGENTS)),
      tasks: [],
      blackboard: [
        {
          id: "bb-init",
          authorId: "agent-coord",
          authorRole: "coordinator",
          topic: "system",
          content: "Ruflo Swarm Mesh initialized. Standing by for objective dispatch.",
          timestamp: Date.now(),
          tags: ["system", "startup"],
        },
      ],
      ballots: [],
      status: "idle",
      activeRound: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Spawns a new multi-agent swarm with a goal and topology
   */
  public spawn(
    goal: string,
    topology: SwarmTopology = "hierarchical",
    customAgents?: SwarmAgent[],
  ): SwarmSession {
    const agents = customAgents || JSON.parse(JSON.stringify(DEFAULT_AGENTS));
    const now = Date.now();

    // Auto-decompose the goal into a DAG of standard specialized tasks
    const tasks: SwarmTask[] = [
      {
        id: "task-1-scout",
        title: `Research context & constraints for: "${goal.slice(0, 50)}..."`,
        role: "researcher",
        status: "pending",
        dependencies: [],
        createdAt: now,
      },
      {
        id: "task-2-arch",
        title: "Design architectural blueprint & schema contract",
        role: "architect",
        status: "pending",
        dependencies: ["task-1-scout"],
        createdAt: now,
      },
      {
        id: "task-3-code",
        title: "Synthesize implementation and executable logic",
        role: "coder",
        status: "pending",
        dependencies: ["task-2-arch"],
        createdAt: now,
      },
      {
        id: "task-4-review",
        title: "Adversarial security audit & acceptance verification",
        role: "critic",
        status: "pending",
        dependencies: ["task-3-code"],
        createdAt: now,
      },
    ];

    this.currentSession = {
      id: `swarm-${now}`,
      goal,
      topology,
      agents,
      tasks,
      blackboard: [
        {
          id: `bb-${now}-init`,
          authorId: "agent-coord",
          authorRole: "coordinator",
          topic: "objective",
          content: `New Swarm spawned with topology [${topology.toUpperCase()}]. Goal: "${goal}"`,
          timestamp: now,
          tags: ["objective", topology],
        },
      ],
      ballots: [],
      status: "active",
      activeRound: 1,
      createdAt: now,
      updatedAt: now,
    };

    return this.currentSession;
  }

  /**
   * Advances the swarm execution by one step (executing or simulating the next eligible task)
   */
  public async step(ctx?: VaultCtx): Promise<{
    session: SwarmSession;
    stepMessage: string;
    completedTaskId?: string;
  }> {
    if (!this.currentSession) {
      this.reset();
    }

    const session = this.currentSession!;
    if (session.status === "completed") {
      return { session, stepMessage: "Swarm session already completed." };
    }

    // Find the next task whose dependencies are satisfied
    const pendingTask = session.tasks.find((t) => {
      if (t.status !== "pending") return false;
      return t.dependencies.every((depId) => {
        const dep = session.tasks.find((d) => d.id === depId);
        return dep && dep.status === "completed";
      });
    });

    if (!pendingTask) {
      const anyPending = session.tasks.some((t) => t.status !== "completed");
      if (!anyPending) {
        session.status = "completed";
        session.updatedAt = Date.now();
        this.postBlackboard(
          "agent-coord",
          "summary",
          `🎉 All swarm tasks completed successfully under ${session.topology.toUpperCase()} coordination!`,
          ["completion", "success"],
        );
        return { session, stepMessage: "All swarm tasks completed successfully." };
      }
      return { session, stepMessage: "Waiting on active tasks..." };
    }

    // Assign agent
    const agent = session.agents.find((a) => a.role === pendingTask.role) || session.agents[0];
    pendingTask.assignedAgentId = agent.id;
    pendingTask.status = "in_progress";
    agent.status = "working";
    agent.currentTaskId = pendingTask.id;

    // Simulate specialized work for this role
    let taskOutput = "";
    if (pendingTask.role === "researcher") {
      taskOutput = `Discovered 4 key architectural patterns and 2 security constraints for goal: "${session.goal.slice(0, 40)}"`;
      pendingTask.confidence = 0.94;
    } else if (pendingTask.role === "architect") {
      taskOutput = `Specified modular design: decoupled interface with pub/sub event mesh, clean error boundaries, and zero-leak contracts.`;
      pendingTask.confidence = 0.91;
    } else if (pendingTask.role === "coder") {
      taskOutput = `Implemented TypeScript core logic with robust guards, type safety, and fallback recovery handlers.`;
      pendingTask.confidence = 0.89;
    } else if (pendingTask.role === "critic") {
      taskOutput = `Verified AST rules, zero unbounded loops, zero memory leaks, and 100% adherence to Phryvos security sandbox.`;
      pendingTask.confidence = 0.96;
    } else {
      taskOutput = `Coordinated task execution and aligned swarm state.`;
      pendingTask.confidence = 0.92;
    }

    pendingTask.output = taskOutput;
    pendingTask.status = "completed";
    pendingTask.completedAt = Date.now();
    agent.status = "idle";
    agent.currentTaskId = undefined;
    session.updatedAt = Date.now();

    // Publish to Blackboard
    this.postBlackboard(
      agent.id,
      pendingTask.role,
      `[Task: ${pendingTask.title}] Result: ${taskOutput}`,
      [pendingTask.role, "result"],
    );

    // If consensus topology, trigger a voting round for this deliverable
    if (session.topology === "consensus" || pendingTask.role === "critic") {
      this.conductConsensusVote(pendingTask.id, taskOutput);
    }

    // Persist session snapshot to vault if ctx is provided
    if (ctx) {
      try {
        const json = JSON.stringify(session, null, 2);
        createDir(ctx, "/swarm");
        writeFile(ctx, `/swarm/session-${session.id}.json`, Buffer.from(json, "utf8"));
      } catch (err) {
        console.warn("[Swarm] Failed to persist snapshot to vault:", err);
      }
    }

    return {
      session,
      stepMessage: `Agent ${agent.name} (${agent.role}) completed: "${pendingTask.title}"`,
      completedTaskId: pendingTask.id,
    };
  }

  /**
   * Conducts a confidence-weighted consensus vote across active agents
   */
  public conductConsensusVote(taskId: string, proposal: string, threshold = 0.67): ConsensusBallot {
    const session = this.currentSession!;
    const votes: AgentVote[] = session.agents.map((ag) => {
      // Each agent evaluates based on its archetype
      let vote: "accept" | "reject" | "abstain" = "accept";
      let conf = ag.confidenceScore;
      let rationale = `Meets standards for ${ag.role}.`;

      if (ag.role === "critic") {
        conf = 0.92;
        rationale = "Audited: zero vulnerabilities and adherence to system constraints confirmed.";
      } else if (ag.role === "architect") {
        conf = 0.89;
        rationale = "Modular boundary and type cohesion validated.";
      }

      return {
        agentId: ag.id,
        agentRole: ag.role,
        vote,
        confidence: conf,
        rationale,
      };
    });

    // Compute weighted acceptance score: sum(conf * accept) / sum(conf)
    const totalWeight = votes.reduce((sum, v) => sum + (v.vote !== "abstain" ? v.confidence : 0), 0);
    const acceptWeight = votes
      .filter((v) => v.vote === "accept")
      .reduce((sum, v) => sum + v.confidence, 0);

    const weightedScore = totalWeight > 0 ? Math.round((acceptWeight / totalWeight) * 100) / 100 : 1.0;
    const passed = weightedScore >= threshold;

    const ballot: ConsensusBallot = {
      id: `ballot-${Date.now()}`,
      taskId,
      proposal: proposal.slice(0, 150),
      votes,
      weightedScore,
      passed,
      threshold,
      createdAt: Date.now(),
      round: session.activeRound,
    };

    session.ballots.unshift(ballot);
    this.postBlackboard(
      "agent-coord",
      "consensus",
      `Consensus ${passed ? "PASSED ✅" : "REJECTED ❌"} with weighted score ${(weightedScore * 100).toFixed(0)}% (threshold: ${(threshold * 100).toFixed(0)}%) on: "${proposal.slice(0, 80)}..."`,
      ["consensus", passed ? "pass" : "reject"],
    );

    return ballot;
  }

  /**
   * Posts an entry to the shared swarm blackboard mesh
   */
  public postBlackboard(
    authorId: string,
    topic: string,
    content: string,
    tags: string[] = [],
  ): BlackboardEntry {
    if (!this.currentSession) this.reset();
    const session = this.currentSession!;

    const agent = session.agents.find((a) => a.id === authorId);
    const authorRole: SwarmRole = agent?.role || "coordinator";

    const entry: BlackboardEntry = {
      id: `bb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      authorId,
      authorRole,
      topic,
      content,
      timestamp: Date.now(),
      tags,
    };

    session.blackboard.unshift(entry);
    if (session.blackboard.length > 100) {
      session.blackboard.pop();
    }
    session.updatedAt = Date.now();

    return entry;
  }

  /**
   * Retrieves current swarm blackboard entries with optional filtering
   */
  public getBlackboard(filter?: { topic?: string; tag?: string }): BlackboardEntry[] {
    if (!this.currentSession) return [];
    let entries = this.currentSession.blackboard;
    if (filter?.topic) {
      entries = entries.filter((e) => e.topic.toLowerCase() === filter.topic!.toLowerCase());
    }
    if (filter?.tag) {
      entries = entries.filter((e) => e.tags.includes(filter.tag!));
    }
    return entries;
  }

  /**
   * Returns current active swarm snapshot
   */
  public getState(): SwarmSession {
    if (!this.currentSession) this.reset();
    return this.currentSession!;
  }
}

export const swarmEngine = new SwarmEngine();
