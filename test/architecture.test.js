import assert from "node:assert/strict";
import test from "node:test";
import { dispatchSupervisorActions } from "../src/dispatcher.js";
import { resolveExecutionPolicy } from "../src/execution-policy.js";
import { claimRuns, successfulHandoffFailure } from "../src/runner.js";
import { createSupervisorReport } from "../src/supervisor.js";
import {
  completeArchitectureInState,
  functionalDeliveryContract,
  generatePrompt,
  taskRequiresArchitecture,
} from "../src/store.js";

function fixtureState(taskPatch = {}) {
  return {
    projects: [{
      id: "project_1",
      key: "demo",
      name: "Demo",
      repoPath: "/tmp/demo",
      defaultBranch: "main",
      contextLinks: ["README.md"],
      standards: [],
      safetyRules: [],
      validationCommands: ["npm test"],
    }],
    tasks: [{
      id: "task_1",
      projectId: "project_1",
      title: "Build the product from this mockup",
      description: "A modern app with durable user state.",
      type: "epic",
      status: "architecture_pending",
      architectureRequired: true,
      architectureStatus: "pending",
      attachments: [{ type: "image", label: "mockup", url: "/tmp/mockup.png" }],
      acceptanceCriteria: ["The product works locally."],
      deliveryMode: "functional",
      priority: "high",
      ...taskPatch,
    }],
    runs: [],
    comments: [],
    reviews: [],
    events: [],
    qaBundles: [],
  };
}

test("broad epics and app mockups require architecture unless explicitly waived", () => {
  assert.equal(taskRequiresArchitecture({ type: "epic", title: "New product" }), true);
  assert.equal(taskRequiresArchitecture({
    type: "feature",
    title: "Build the mobile app",
    attachments: ["/tmp/mockup.png"],
  }), true);
  assert.equal(taskRequiresArchitecture({
    type: "bug",
    title: "Fix button spacing",
    attachments: ["/tmp/screenshot.png"],
  }), false);
  assert.equal(taskRequiresArchitecture({
    type: "epic",
    title: "Document an existing decision",
    architectureRequired: false,
  }), false);
});

test("architecture is a durable xhigh pre-builder dispatch", async () => {
  const state = fixtureState();
  const supervisor = createSupervisorReport(state);
  assert.equal(supervisor.actions[0].type, "start_architecture");
  assert.equal(supervisor.actions[0].role, "systems-architect");

  const policy = resolveExecutionPolicy(state.tasks[0], supervisor.actions[0], {
    executionPolicy: { model: "another-model", reasoningEffort: "low" },
  });
  assert.equal(policy.model, "gpt-5.6-sol");
  assert.equal(policy.reasoningEffort, "xhigh");
  assert.equal(policy.selectionReason, "systems_architect_role");

  const report = await dispatchSupervisorActions(supervisor.actions, { state });
  assert.equal(report.runs.length, 1);
  assert.equal(report.runs[0].group, "architect");
  assert.equal(report.runs[0].role, "systems-architect");
  assert.equal(report.runs[0].model, "gpt-5.6-sol");
  assert.equal(report.runs[0].modelReasoningEffort, "xhigh");
  assert.equal(state.tasks[0].status, "architecture_pending");

  const claimed = await claimRuns({ state, limit: 1 });
  assert.equal(claimed.length, 1);
  assert.equal(state.tasks[0].status, "architecture_in_progress");
});

test("architecture completion records the decision and unlocks governed child tasks", () => {
  const state = fixtureState();
  state.tasks.push({
    id: "task_2",
    projectId: "project_1",
    title: "Implement the durable data slice",
    type: "feature",
    status: "idea",
  });
  const summary = [
    "Use a modular monolith with PostgreSQL as the source of truth.",
    "Bound reads with indexed queries and cursor pagination.",
    "Add queues or caches only when measured load demonstrates the need.",
  ].join(" ");

  const task = completeArchitectureInState(state, "task_1", {
    body: summary,
    taskIds: ["task_2"],
  });

  assert.equal(task.status, "architecture_ready");
  assert.equal(task.architectureStatus, "completed");
  assert.deepEqual(task.architectureDecisionTaskIds, ["task_2"]);
  assert.equal(state.tasks[1].status, "ready");
  assert.equal(state.tasks[1].architectureStatus, "inherited");
  assert.equal(state.tasks[1].architectureParentTaskId, "task_1");
  assert.ok(state.events.some((event) => event.type === "architecture_completed"));
});

test("architect and functional-delivery prompts reject static mockup replicas", () => {
  const state = fixtureState();
  const prompt = generatePrompt(state, "task_1", "systems-architect");
  assert.match(prompt, /smallest modern architecture/i);
  assert.match(prompt, /supplied mockup, screenshot, logo/i);
  assert.match(prompt, /data ownership, durable persistence/i);
  assert.match(prompt, /dependency-linked StudioOps child tasks/i);
  assert.match(prompt, /gpt-5\.6-sol/);
  assert.match(prompt, /xhigh/);

  const contract = functionalDeliveryContract(state.tasks[0]);
  assert.match(contract, /not authorization to deliver a static replica/i);
  assert.match(contract, /Primary controls must execute real behavior/i);
  assert.match(contract, /survive refresh and process restart/i);
});

test("runner rejects an architect exit that did not record a durable handoff", () => {
  const state = fixtureState({ status: "architecture_in_progress" });
  const run = {
    id: "run_1",
    taskId: "task_1",
    group: "architect",
    role: "systems-architect",
  };
  assert.equal(successfulHandoffFailure(state, run, state.tasks[0]), "architecture_handoff_missing");

  state.tasks[0].architectureStatus = "completed";
  state.tasks[0].architectureDecisionTaskIds = ["task_2"];
  assert.equal(successfulHandoffFailure(state, run, state.tasks[0]), "");
});
