import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { runMigrations } from "../lib/db/migrate.ts";
import {
  createGoal,
  createMilestone,
  getGoal,
  deleteGoal,
  listGoals,
} from "../lib/goal-service.ts";
import {
  createSubject,
  createTopic,
  createStudyLog,
  getSubject,
  getTopic,
  deleteSubject,
  deleteTopic,
} from "../lib/exam-service.ts";
import {
  createProject,
  createTask,
  listTasks,
} from "../lib/tracking-service.ts";
import {
  createEvent,
  listEvents,
} from "../lib/event-service.ts";

describe("Database Integrity & Query Hardening Fixes", () => {
  let db: Database.Database;
  let tmpDir: string;
  const masterKey = randomBytes(32);

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phryvos-db-integrity-test-"));
    const p = path.join(tmpDir, "vault.db");
    db = new Database(p);
    db.pragma("foreign_keys = ON");
    runMigrations(db);
  });

  after(() => {
    try {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // 1. Goal Deletion Atomic Multi-Statement Fix
  it("deleteGoal deletes goal and all its milestones without SQLite syntax error", () => {
    const ctx = { db };
    const goal = createGoal(ctx, {
      title: "Master Quantum Mechanics",
      description: "Complete wave equations and perturbation theory",
    });
    assert.ok(goal.id > 0);

    createMilestone(ctx, { goalId: goal.id, title: "Schrodinger Equation" });
    createMilestone(ctx, { goalId: goal.id, title: "Dirac Notation" });

    const beforeDelete = getGoal(ctx, goal.id);
    assert.ok(beforeDelete);
    assert.equal(beforeDelete.milestones.length, 2);

    // This previously crashed with: SqliteError: near "DELETE": syntax error
    deleteGoal(ctx, goal.id);

    const afterDelete = getGoal(ctx, goal.id);
    assert.equal(afterDelete, null);

    const remainingMilestones = db
      .prepare("SELECT * FROM goal_milestones WHERE goal_id = ?")
      .all(goal.id);
    assert.equal(remainingMilestones.length, 0);
  });

  // 2. Exam Subject & Topic Deletion Atomic Multi-Statement Fixes
  it("deleteTopic deletes topic and its study logs without SQLite syntax error", () => {
    const ctx = { db, key: masterKey };
    const subject = createSubject(ctx, { name: "Advanced Mathematics" });
    const topic = createTopic(ctx, { subjectId: subject.id, name: "Linear Algebra" });

    createStudyLog(ctx, {
      subjectId: subject.id,
      topicId: topic.id,
      startedAt: Date.now(),
      durationMin: 45,
      note: "Eigenvalues and eigenvectors",
    });

    // Verify records exist before delete
    assert.ok(getTopic(ctx, subject.id, topic.id));

    // This previously crashed with: SqliteError: near "DELETE": syntax error
    deleteTopic(ctx, subject.id, topic.id);

    assert.equal(getTopic(ctx, subject.id, topic.id), null);
    const logs = db
      .prepare("SELECT * FROM study_logs WHERE topic_id = ?")
      .all(topic.id);
    assert.equal(logs.length, 0);
  });

  it("deleteSubject deletes subject, topics, and study logs in one atomic transaction", () => {
    const ctx = { db, key: masterKey };
    const subject = createSubject(ctx, { name: "Theoretical Physics" });
    const topic1 = createTopic(ctx, { subjectId: subject.id, name: "Classical Mechanics" });
    const topic2 = createTopic(ctx, { subjectId: subject.id, name: "Thermodynamics" });

    createStudyLog(ctx, {
      subjectId: subject.id,
      topicId: topic1.id,
      startedAt: Date.now(),
      durationMin: 30,
    });
    createStudyLog(ctx, {
      subjectId: subject.id,
      topicId: topic2.id,
      startedAt: Date.now(),
      durationMin: 60,
    });

    assert.ok(getSubject(ctx, subject.id));

    deleteSubject(ctx, subject.id);

    assert.equal(getSubject(ctx, subject.id), null);
    const remainingTopics = db
      .prepare("SELECT * FROM exam_topics WHERE subject_id = ?")
      .all(subject.id);
    assert.equal(remainingTopics.length, 0);
    const remainingLogs = db
      .prepare("SELECT * FROM study_logs WHERE subject_id = ?")
      .all(subject.id);
    assert.equal(remainingLogs.length, 0);
  });

  // 3. Event Query Parameterization & Bounds
  it("listEvents safely handles edge-case limits with parameterized queries", () => {
    const ctx = { db };
    const now = Date.now();
    createEvent(ctx, { title: "Team Standup", startAt: now });
    createEvent(ctx, { title: "Architecture Review", startAt: now + 3600000 });

    const standard = listEvents(ctx, { limit: 10 });
    assert.ok(standard.length >= 2);

    // Should not crash or inject invalid SQL even with NaN or extreme limits
    const safeWithNaN = listEvents(ctx, { limit: Number("invalid") });
    assert.ok(Array.isArray(safeWithNaN));

    const safeWithNegative = listEvents(ctx, { limit: -10 });
    assert.ok(Array.isArray(safeWithNegative));
  });

  // 4. Task Listing Single-Query Project Join
  it("listTasks returns projectTitle via direct JOIN without secondary N+1 queries", () => {
    const trackingCtx = { db };
    const project = createProject(trackingCtx, { title: "Autonomous OS Project" });
    const task = createTask(trackingCtx, {
      projectId: project.id,
      title: "Hardened SQLite Queries",
      status: "doing",
    });

    const tasks = listTasks(trackingCtx, { projectId: project.id });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].id, task.id);
    assert.equal(tasks[0].projectTitle, "Autonomous OS Project");
  });
});
