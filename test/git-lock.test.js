import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { withGitRepositoryLock } from "../src/git-lock.js";

test("git repository locks serialize concurrent preparation for the same repo", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mission-control-git-lock-"));
  const repo = path.join(root, "repo");
  const lockRoot = path.join(root, "locks");
  const events = [];

  try {
    const first = withGitRepositoryLock(repo, async () => {
      events.push("first:start");
      await sleep(75);
      events.push("first:end");
      return "first";
    }, { lockRoot, timeoutMs: 5_000, pollMs: 10 });

    await sleep(10);

    const second = withGitRepositoryLock(repo, async () => {
      events.push("second:start");
      events.push("second:end");
      return "second";
    }, { lockRoot, timeoutMs: 5_000, pollMs: 10 });

    assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
    assert.deepEqual(events, [
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
