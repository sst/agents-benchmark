#!/usr/bin/env bun

import path from "path";
import { run } from "core";

const MODELS = [
  "anthropic/claude-sonnet-4-20250514",
  "openrouter/google/gemini-2.5-pro",
  "openai/codex-mini-latest",
  "openai/gpt-4.1",
];
const TESTS_PATH = path.join(import.meta.dir, "..", "tests");

for await (const test of new Bun.Glob("**/prompt.txt").scan({
  cwd: TESTS_PATH,
  absolute: false,
  onlyFiles: false,
})) {
  // ie. test is "ts-file.refactor/prompt.txt"
  const testName = test.split(path.sep)[0]!; // ie. ts-file.refactor

  for (const model of MODELS) {
    await run(testName, model);
  }
}
