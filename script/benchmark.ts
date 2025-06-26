#!/usr/bin/env bun

import os from "os";
import path from "path";
import { $ } from "bun";
import fs from "fs/promises";
import type { Result } from "core";

const MODELS = [
  "anthropic/claude-sonnet-4-20250514",
  //"anthropic/claude-3-5-sonnet-20240620",
  //"anthropic/claude-3-haiku-20240307",
  //"openai/gpt-4o-mini",
  //"google/gemini-2.5-pro",
];
const testID = new Date().toISOString();
const projectsPath = path.join(import.meta.dir, "..", "projects");
const resultsPath = path.join(import.meta.dir, "..", "results", testID);

for await (const project of new Bun.Glob("*").scan({
  cwd: projectsPath,
  absolute: false,
  onlyFiles: false,
})) {
  const sourcePath = path.join(projectsPath, project, "source");
  const expectedPatchPath = path.join(projectsPath, project, "expected.patch");
  const promptPath = path.join(projectsPath, project, "prompt.txt");
  const prompt = await Bun.file(promptPath).text();

  for (const model of MODELS) {
    const resultPath = path.join(resultsPath, project, model);
    await fs.mkdir(resultPath, { recursive: true });

    // Run test
    await $`opencode run ${prompt} -m ${model} --share`.cwd(sourcePath);

    // Store patch
    const patchPath = path.join(resultPath, "diff.patch");
    const patch = await $`git diff ${sourcePath}`.text();
    await Bun.write(patchPath, patch);

    // Store test info
    const added =
      await $`bash -c "diff <(grep -v '^index ' ${patchPath}) <(grep -v '^index ' ${expectedPatchPath}) | grep -E '^<' | wc -l"`
        .nothrow()
        .quiet();
    if (added.exitCode > 1) throw new Error(added.stderr.toString("utf-8"));
    const removed =
      await $`bash -c "diff <(grep -v '^index ' ${patchPath}) <(grep -v '^index ' ${expectedPatchPath}) | grep -E '^>' | wc -l"`
        .nothrow()
        .quiet();
    if (removed.exitCode > 1) throw new Error(removed.stderr.toString("utf-8"));
    const sessionInfo = await getSessionInfo();
    await Bun.write(
      path.join(resultPath, "summary.json"),
      JSON.stringify({
        openCode: {
          share: sessionInfo.share.url.split("/").pop(),
          version: sessionInfo.version,
        },
        duration: sessionInfo.time.updated - sessionInfo.time.created,
        gitRef: (await $`git rev-parse HEAD`.text()).trim(),
        added: parseInt(added.text().trim()),
        removed: parseInt(removed.text().trim()),
      } satisfies Result)
    );

    // Reset source
    await $`git checkout ${sourcePath}`;
  }
}

async function getSessionInfo() {
  const projectDir = path
    .resolve(import.meta.dir, "..")
    .split(path.sep)
    .filter(Boolean)
    .join("-");
  const sessions = await Array.fromAsync(
    new Bun.Glob("*").scan({
      cwd: path.join(
        os.homedir(),
        ".local",
        "share",
        "opencode",
        "project",
        projectDir,
        "storage",
        "session",
        "info"
      ),
      absolute: true,
    })
  );
  if (sessions.length === 0)
    throw new Error("Session not found in ~/.local/share");
  const session = sessions.sort()[0]!;

  return await Bun.file(session).json();
}
