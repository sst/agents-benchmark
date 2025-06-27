#!/usr/bin/env bun

import os from "os";
import path from "path";
import { $ } from "bun";
import fs from "fs/promises";
import type { Result } from "core";

const MODELS = [
  "anthropic/claude-sonnet-4-20250514",
  "openrouter/google/gemini-2.5-pro",
  "openai/codex-mini-latest",
  "openai/gpt-4.1",
];
const TEST_ID = new Date().toISOString();
const PROJECTS_PATH = path.join(import.meta.dir, "..", "projects");
const TESTS_PATH = path.join(import.meta.dir, "..", "tests");
const RESULTS_PATH = path.join(import.meta.dir, "..", "results", TEST_ID);

for await (const test of new Bun.Glob("**/prompt.txt").scan({
  cwd: TESTS_PATH,
  absolute: false,
  onlyFiles: false,
})) {
  // ie. test is "ts-file.refactor/prompt.txt"
  const testName = test.split(path.sep)[0]!; // ie. ts-file.refactor
  const project = testName.split(".")[0]!; // ie. ts-file

  const projectPath = path.join(PROJECTS_PATH, project);
  const expectedPath = path.join(TESTS_PATH, testName, "expected");
  const promptPath = path.join(TESTS_PATH, testName, "prompt.txt");
  const prompt = await Bun.file(promptPath).text();

  for (const model of MODELS) {
    const resultPath = path.join(RESULTS_PATH, testName, model);
    await fs.mkdir(resultPath, { recursive: true });

    // Run test
    const tsBefore = performance.now();
    await $`opencode run ${prompt} -m ${model} --share`.cwd(projectPath);
    const duration = performance.now() - tsBefore;

    // Store patch
    const patchPath = path.join(resultPath, "diff.patch");
    const patchCmd = await $`diff -rN ${expectedPath} ${projectPath}`
      .nothrow()
      .quiet();
    if (patchCmd.exitCode > 1) throw new Error(patchCmd.text());
    const patch = patchCmd.text();
    await Bun.write(patchPath, patch);

    // Store test info
    const session = await getSession();
    console.log(session);
    await Bun.write(
      path.join(resultPath, "summary.json"),
      JSON.stringify({
        opencode: {
          share: session.info.share.url.split("/").pop(),
          version: session.info.version,
        },
        duration: Math.round(duration),
        cost: session.cost,
        gitRef: (await $`git rev-parse HEAD`.text()).trim(),
        added: patch.split("\n").filter((line) => line.startsWith("<")).length,
        removed: patch.split("\n").filter((line) => line.startsWith(">"))
          .length,
      } satisfies Result)
    );

    // Reset source
    await $`git checkout ${projectPath}`;
  }
}

async function getSession() {
  const projectDir = path
    .resolve(import.meta.dir, "..")
    .split(path.sep)
    .filter(Boolean)
    .join("-");
  const sessionPath = path.join(
    os.homedir(),
    ".local",
    "share",
    "opencode",
    "project",
    projectDir,
    "storage",
    "session"
  );

  // Get session info
  const sessions = await Array.fromAsync(
    new Bun.Glob("*").scan({
      cwd: path.join(sessionPath, "info"),
      absolute: true,
    })
  );
  if (sessions.length === 0)
    throw new Error("Session not found in ~/.local/share");
  const session = sessions.sort()[0]!;
  const sessionID = session.split(path.sep).pop()!.split(".")[0]!;

  // Get session messages and aggregate cost
  let cost = 0;
  for await (const message of new Bun.Glob("*").scan({
    cwd: path.join(sessionPath, "message", sessionID),
    absolute: true,
  })) {
    const json = await Bun.file(message).json();
    cost += json.metadata?.assistant?.cost ?? 0;
  }

  return {
    info: await Bun.file(session).json(),
    cost,
  };
}
