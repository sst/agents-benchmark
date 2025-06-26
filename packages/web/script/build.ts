#!/usr/bin/env bun

import { Rendered } from "../src/render";
import fs from "fs/promises";

await fs.rm("./dist", { recursive: true, force: true });
await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "dist",
  target: "bun",
});

for await (const file of new Bun.Glob("./public/*").scan()) {
  await Bun.write(file.replace("./public/", "./dist/"), Bun.file(file));
}

let html = await Bun.file("./dist/index.html").text();
html = html.replace("<!--static-->", Rendered);
await Bun.write("./dist/index.html", html);
