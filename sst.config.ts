/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app() {
    return {
      name: "agents-benchmark",
      home: "cloudflare",
    };
  },
  async run() {
    const worker = new sst.cloudflare.StaticSite("MyWorker", {
      domain: $app.stage === "dev" ? "benchmark.models.dev" : undefined,
      path: "./packages/web/",
      build: {
        output: "./dist",
        command: "./script/build.ts",
      },
    });

    return {
      url: worker.url,
    };
  },
});
