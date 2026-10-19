import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { daemons } from "../lib/agent/daemons.ts";
import { mcpKernel } from "../lib/agent/mcp-kernel.ts";
import { extractWikiLinks, buildKnowledgeGraph, findUnlinkedMentions } from "../lib/vault-links.ts";
import { computeCpmSchedule, computeScheduleDiff, type DagNode } from "../lib/dag-service.ts";
import { scheduleCard, type FSRSCard } from "../lib/fsrs.ts";

describe("Phase 5 Frontier Engine Tests", () => {
  describe("1. Autonomous Daemons & Governance", () => {
    it("should stage a Planner Daemon pass and record pending status", async () => {
      const action = await daemons.runPlannerPass({
        openCount: 5,
        urgentCount: 2,
        bottleneckTopics: ["Rotational Dynamics"],
      });

      assert.ok(action.id);
      assert.equal(action.daemon, "planner");
      assert.equal(action.status, "pending");

      // Verify staged actions list
      const staged = daemons.getStagedActions("pending");
      assert.ok(staged.some((a) => a.id === action.id));

      // Resolve action
      const resolved = daemons.resolveAction(action.id, "approved");
      assert.equal(resolved, true);
      assert.equal(daemons.getStagedActions().find((a) => a.id === action.id)?.status, "approved");
    });

    it("should stage a Nightly Tutor pass for JEE practice synthesis", async () => {
      const tutorAction = await daemons.runNightlyTutorPass("Physics");
      assert.equal(tutorAction.daemon, "tutor");
      assert.equal(tutorAction.actionType, "create_practice_sheet");
      assert.ok(String(tutorAction.payload.filePath).includes("physics.md"));

      const resolved = daemons.resolveAction(tutorAction.id, "rejected");
      assert.equal(resolved, true);
    });
  });

  describe("2. Universal MCP Host Kernel", () => {
    it("should list default registered MCP servers", () => {
      const servers = mcpKernel.listServers();
      assert.ok(servers.length >= 1);
      assert.equal(servers[0].id, "mcp-eval-calc");
    });

    it("should dynamically mount external MCP servers and discover tools", () => {
      mcpKernel.addServer({
        id: "mcp-test-physics",
        name: "Test Physics Simulator MCP",
        transport: "in-memory",
        enabled: true,
      });

      const updated = mcpKernel.listServers();
      assert.ok(updated.some((s) => s.id === "mcp-test-physics"));
    });
  });

  describe("3. Knowledge Graph & [[wiki-links]]", () => {
    it("should extract [[wiki-links]] with targets, aliases, and line numbers", () => {
      const md = "# Mechanics\nRefer to [[Kinematics]] and [[Rotational Dynamics|Rigid Body]]\nLine 3 has [[Gravitation#Kepler]]";
      const links = extractWikiLinks(md);

      assert.equal(links.length, 3);
      assert.equal(links[0].target, "Kinematics");
      assert.equal(links[0].lineNumber, 2);

      assert.equal(links[1].target, "Rotational Dynamics");
      assert.equal(links[1].alias, "Rigid Body");

      assert.equal(links[2].target, "Gravitation");
      assert.equal(links[2].anchor, "Kepler");
      assert.equal(links[2].lineNumber, 3);
    });

    it("should build bi-directional graph with backlinks, orphans, and ghost links", () => {
      const files = [
        { path: "/notes/a.md", content: "Links to [[b]] and [[ghost-note]]" },
        { path: "/notes/b.md", content: "Links to [[a]]" },
        { path: "/notes/c.md", content: "I am an orphan note" },
      ];

      const graph = buildKnowledgeGraph(files);
      const nodeA = graph.nodes["/notes/a"];
      const nodeB = graph.nodes["/notes/b"];

      assert.ok(nodeA);
      assert.ok(nodeB);
      assert.ok(nodeA.outgoing.includes("/notes/b"));
      assert.ok(nodeB.backlinks.includes("/notes/a"));
      assert.ok(graph.orphans.includes("/notes/c"));
      assert.ok(graph.ghosts.includes("ghost-note"));
    });

    it("should detect unlinked mentions in markdown", () => {
      const content = "Today we solved problems on Kinematics and torque.";
      const mentions = findUnlinkedMentions(content, "/notes/work.md", ["Kinematics", "Thermodynamics"]);

      assert.equal(mentions.length, 1);
      assert.equal(mentions[0].title, "Kinematics");
    });
  });

  describe("4. DAG Critical Path Method & Conceptual Debt", () => {
    const testNodes: DagNode[] = [
      { id: "A", name: "Topic A", durationHours: 10, progressPct: 90, prerequisites: [] },
      { id: "B", name: "Topic B", durationHours: 15, progressPct: 40, prerequisites: ["A"] }, // <70% mastery debt
      { id: "C", name: "Topic C", durationHours: 10, progressPct: 80, prerequisites: ["B"] },
    ];

    it("should compute topological sort, forward/backward passes, and critical path", () => {
      const cpm = computeCpmSchedule(testNodes);
      assert.ok(cpm.projectDurationHours >= 35);
      assert.equal(cpm.criticalPath.length, 3);
      assert.equal(cpm.hasCycles, false);
      assert.equal(cpm.totalDebtCount, 1); // Topic B is in debt
    });

    it("should calculate schedule diff on simulated delays", () => {
      const diff = computeScheduleDiff(testNodes, "A", 12);
      assert.ok(diff.length > 0);
      assert.equal(diff[0].shiftHours, 12);
    });
  });

  describe("5. Modern FSRS Spaced Repetition", () => {
    it("should schedule flashcard reviews with stability and difficulty growth", () => {
      const card: FSRSCard = {
        id: 1,
        subjectId: 1,
        topicId: 101,
        due: Date.now(),
        stability: 2,
        difficulty: 5,
        elapsedDays: 0,
        scheduledDays: 1,
        reps: 0,
        lapses: 0,
        state: 0,
        lastReview: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const easyReview = scheduleCard(card, 4); // 4 = Easy
      assert.ok(easyReview.nextScheduledDays > 0);
      assert.ok(easyReview.nextStability > 0);

      const againReview = scheduleCard(card, 1); // 1 = Again
      assert.equal(againReview.nextState, 1); // Learning
    });
  });
});
