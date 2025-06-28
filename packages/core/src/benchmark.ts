import fs from "fs/promises";
import os from "os";
import path from "path";
import { $ } from "bun";
import type { Result } from "./schema";

const ROOT_PATH = path.join(import.meta.dir, "..", "..", "..");
const PROJECTS_PATH = path.join(ROOT_PATH, "projects");
const TESTS_PATH = path.join(ROOT_PATH, "tests");
const RESULTS_PATH = path.join(ROOT_PATH, "results");

export async function getTests() {
  return (
    await Array.fromAsync(
      new Bun.Glob("**/prompt.txt").scan({
        cwd: TESTS_PATH,
        absolute: false,
      })
    )
  ).map((test) => test.split(path.sep)[0]!);
}

export async function getResults() {
  const results = [];
  for await (const summaryPath of new Bun.Glob("**/summary.json").scan({
    cwd: RESULTS_PATH,
    absolute: false,
  })) {
    const summary = await Bun.file(path.join(RESULTS_PATH, summaryPath)).json();
    results.push({
      timestamp: summaryPath.split(path.sep)[0]!,
      summary,
    });
  }
  return results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function run(testName: string, model: string) {
  const TEST_ID = new Date().toISOString();

  const project = testName.split(".")[0]!; // ie. ts-file
  const projectPath = path.join(PROJECTS_PATH, project);
  const expectedPath = path.join(TESTS_PATH, testName, "expected");
  const promptPath = path.join(TESTS_PATH, testName, "prompt.txt");

  // Reset source
  printHeader("Git reset source");
  await $`git checkout ${projectPath}`;

  // Run setup script
  if (await Bun.file(path.join(projectPath, "setup.ts")).exists()) {
    printHeader("Run setup script");
    await $`bun ${path.join(projectPath, "setup.ts")}`;
  }

  // Run test
  printHeader("Run test");
  const prompt = await Bun.file(promptPath).text();
  const tsBefore = performance.now();
  await $`opencode run ${prompt} -m ${model} --share`.cwd(projectPath);
  const duration = performance.now() - tsBefore;
  console.log(`Duration: ${duration}ms`);

  // Store patch
  const patchCmd = await $`diff -r ${expectedPath} ${projectPath}`
    .nothrow()
    .quiet();
  if (patchCmd.exitCode > 1) throw new Error(patchCmd.text());
  const patch = patchCmd.text();
  const diffs = parsePatch(patch);

  // Store test info
  const session = await getSession();
  console.log(session);
  const summary = {
    test: testName,
    model,
    opencode: {
      share: session.info.share.url.split("/").pop(),
      version: session.info.version,
    },
    duration: Math.round(duration),
    cost: session.cost,
    tokens: session.tokens,
    gitRef: (await $`git rev-parse HEAD`.text()).trim(),
    diffs,
  } satisfies Result;

  // Store results
  await fs.mkdir(path.join(RESULTS_PATH, TEST_ID), { recursive: true });
  await Bun.write(path.join(RESULTS_PATH, TEST_ID, "diff.patch"), patch);
  await Bun.write(
    path.join(RESULTS_PATH, TEST_ID, "summary.json"),
    JSON.stringify(summary)
  );
}

async function getSession() {
  const projectDir = ROOT_PATH.split(path.sep).filter(Boolean).join("-");
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
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  for await (const message of new Bun.Glob("*").scan({
    cwd: path.join(sessionPath, "message", sessionID),
    absolute: true,
  })) {
    const json = await Bun.file(message).json();
    cost += json.metadata?.assistant?.cost ?? 0;
    inputTokens += json.metadata?.assistant?.tokens?.input ?? 0;
    outputTokens += json.metadata?.assistant?.tokens?.output ?? 0;
    cacheReadTokens += json.metadata?.assistant?.tokens?.cache?.read ?? 0;
    cacheWriteTokens += json.metadata?.assistant?.tokens?.cache?.write ?? 0;
  }

  return {
    info: await Bun.file(session).json(),
    cost,
    tokens: {
      input: inputTokens,
      output: outputTokens,
      cache_read: cacheReadTokens,
      cache_write: cacheWriteTokens,
    },
  };
}

function printHeader(text: string) {
  console.log(`=== ${text} ===`);
}

function parsePatch(patch: string) {
  const files = [];
  let currentFile: string | null = null;
  let addedLines: number = 0;
  let removedLines: number = 0;
  const lines = patch.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // Detect start of a new file diff (diff -r ... <file1> <file2>)
    if (line.startsWith("diff -r ")) {
      if (currentFile) {
        files.push({
          file: path.relative(PROJECTS_PATH, currentFile),
          added: addedLines,
          removed: removedLines,
        });
      }
      // Try to extract the file path (the second file in the diff line)
      const parts = line.split(" ");
      currentFile = parts[parts.length - 1] ?? "";
      addedLines = 0;
      removedLines = 0;
    } else if (line.startsWith("< ")) {
      addedLines++;
    } else if (line.startsWith("> ")) {
      removedLines++;
    }
  }
  if (currentFile) {
    files.push({
      file: path.relative(PROJECTS_PATH, currentFile),
      added: addedLines,
      removed: removedLines,
    });
  }
  return files;
}
