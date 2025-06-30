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
    const summary = (await Bun.file(
      path.join(RESULTS_PATH, summaryPath)
    ).json()) as Result;
    const patchPath = path.join(RESULTS_PATH, summaryPath, "..", "diff.patch");

    const testName = summary.test;
    const project = testName.split(".")[0]!; // ie. ts-file
    const projectPath = path.join(PROJECTS_PATH, project);
    const expectedPath = path.join(TESTS_PATH, testName, "expected");

    await $`git checkout ${expectedPath}`;

    // Generate source vs expected patch
    const expectedDiff = await diff(projectPath, expectedPath);
    const expectedPatches = (await parsePatch(expectedDiff)).map((patch) => ({
      ...patch,
      file: patch.file.split(path.sep).slice(3).join(path.sep),
    }));

    // Generate source vs actual patch
    const search = path.relative(ROOT_PATH, projectPath).replace(/\//g, "\\/");
    const replace = path
      .relative(ROOT_PATH, expectedPath)
      .replace(/\//g, "\\/");
    await $`cat ${patchPath} | sed 's/${search}/${replace}/g' | patch`.cwd(
      ROOT_PATH
    );
    const actualDiff = await diff(projectPath, expectedPath);
    const actualPatches = (await parsePatch(actualDiff)).map((patch) => ({
      ...patch,
      file: patch.file.split(path.sep).slice(3).join(path.sep),
    }));

    await $`git checkout ${expectedPath}`;

    // For each diff, load
    // - original source
    // - expected diff
    // - actual diff
    const files = [
      ...new Set(
        [...expectedPatches, ...actualPatches].map((diff) => diff.file)
      ),
    ];
    const patchInfoByFile: Record<
      string,
      { source: string; expectedPatch?: string; actualPatch?: string }
    > = {};
    await Promise.all(
      files.map(async (file) => {
        patchInfoByFile[file] = {
          source: await Bun.file(path.join(projectPath, file)).text(),
          actualPatch: actualPatches
            .find((patch) => patch.file === file)
            ?.lines?.join("\n"),
          expectedPatch: expectedPatches
            .find((patch) => patch.file === file)
            ?.lines?.join("\n"),
        };
      })
    );

    results.push({
      timestamp: summaryPath.split(path.sep)[0]!,
      summary: {
        ...summary,
        diffs: summary.diffs.map((diff) => ({
          ...diff,
          ...patchInfoByFile[diff.file]!,
        })),
      },
    });
  }
  return results.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function run(testName: string, model: string) {
  const TEST_ID = new Date().toISOString();

  const project = testName.split(".")[0]!; // ie. ts-file
  const projectPath = path.join(PROJECTS_PATH, project);
  const testPath = path.join(TESTS_PATH, testName);

  // Reset source
  printHeader("Git reset source");
  await $`git checkout ${projectPath}`;

  // Run setup script
  if (await Bun.file(path.join(projectPath, "package.json")).exists()) {
    printHeader("Run setup script");
    await $`bun i`.cwd(projectPath);
  }

  // Run test
  printHeader("Run test");
  const prompt = await Bun.file(path.join(testPath, "prompt.txt")).text();
  const tsBefore = performance.now();
  await $`opencode run ${prompt} -m ${model} --share`.cwd(projectPath);
  const duration = performance.now() - tsBefore;
  console.log(`Duration: ${duration}ms`);

  // Generate patch
  const patch = await diff(path.join(testPath, "expected"), projectPath);

  // Store test info
  const session = await getSession();
  console.log(session);
  const summary = {
    test: testName,
    model,
    opencode: {
      share: session.info.share?.url?.split("/")?.pop(),
      version: session.info.version,
    },
    duration: Math.round(duration),
    cost: session.cost,
    tokens: session.tokens,
    gitRef: (await $`git rev-parse HEAD`.text()).trim(),
    diffs: (await parsePatch(patch)).map((diff) => {
      return {
        // transform from "projects/hello-world/bar.ts"
        // to "bar.ts"
        file: diff.file.split(path.sep).slice(2).join(path.sep),
        added: diff.lines.filter((line) => line.match(/^\+[^+]/)).length,
        removed: diff.lines.filter((line) => line.match(/^-[^-]/)).length,
      };
    }),
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

/**
 * @example
 * Input:
 * ```
 *   diff("tests/hello-world.noop/expected/foo.ts", "projects/hello-world/foo.ts")
 * ```
 * Output:
 * ```patch
 *   diff -ur tests/hello-world.noop/expected/foo.ts projects/hello-world/foo.ts
 *   --- tests/hello-world.noop/expected/foo.ts	2025-06-29 02:35:37
 *   +++ projects/hello-world/foo.ts	2025-06-27 23:56:28
 *   @@ -1 +1 @@
 *   -console.log("expected");
 *   +console.log("actual");
 * ```
 */
async function diff(expected: string, actual: string) {
  const expectedRelPath = path.relative(ROOT_PATH, expected);
  const actualRelPath = path.relative(ROOT_PATH, actual);
  const patchCmd = await $`diff -ur ${expectedRelPath} ${actualRelPath}`
    .cwd(ROOT_PATH)
    .nothrow()
    .quiet();
  if (patchCmd.exitCode > 1) throw new Error(patchCmd.stderr.toString());
  return patchCmd.text();
}
async function parsePatch(patch: string) {
  const files = [];
  let currentFile: string | null = null;
  let currentLines: string[] = [];
  const lines = patch.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // Detect start of a new file diff (diff -r ... <file1> <file2>)
    if (line.startsWith("diff ")) {
      if (currentFile) {
        files.push({
          file: currentFile,
          lines: currentLines,
        });
      }
      // Try to extract the file path (the second file in the diff line)
      const parts = line.split(" ");
      currentFile = parts[parts.length - 1] ?? "";
      currentLines = [];
    }
    currentLines.push(line);
  }

  if (currentFile) {
    files.push({
      file: currentFile,
      lines: currentLines,
    });
  }
  return files;
}
