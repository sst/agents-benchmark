import { Hono } from "hono";
import { Fragment } from "hono/jsx";
import { jsxRenderer } from "hono/jsx-renderer";
import { getTests, run } from "core/src/benchmark";
import { readdir } from "fs/promises";
import path from "path";

const app = new Hono();
app.use("*", jsxRenderer());

const MODELS = [
  "anthropic/claude-sonnet-4-20250514",
  "openrouter/google/gemini-2.5-pro",
  "openai/codex-mini-latest",
  "openai/gpt-4.1",
];
const TESTS = await getTests();

app.post("/run_benchmark", async (c) => {
  const { testName, model } = await c.req.json();
  try {
    await run(testName, model);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 500);
  }
});

app.get("/", async (c) => {
  return c.render(
    <html>
      <head>
        <title>Agents Benchmark</title>
      </head>
      <body>
        <h1>Run Benchmark</h1>
        <form id="benchmark-form">
          <label htmlFor="model">Model:</label>
          <select id="model" name="model">
            {MODELS.map((model) => (
              <option value={model}>{model}</option>
            ))}
          </select>
          <br />
          <label htmlFor="test">Test:</label>
          <select id="test" name="test">
            {TESTS.map((test) => (
              <option value={test}>{test}</option>
            ))}
          </select>
          <br />
          <button type="submit">Run</button>
        </form>
        <pre id="result"></pre>
        <script
          dangerouslySetInnerHTML={{
            __html: `document.getElementById('benchmark-form').addEventListener('submit', async function(e) {
              e.preventDefault();
              const model = document.getElementById('model').value;
              const testName = document.getElementById('test').value;
              const resultPre = document.getElementById('result');
              resultPre.textContent = 'Running...';
              try {
                const res = await fetch('/run_benchmark', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ testName, model })
                });
                const data = await res.json();
                resultPre.textContent = JSON.stringify(data, null, 2);
              } catch (err) {
                resultPre.textContent = 'Error: ' + err;
              }
            });`,
          }}
        />
      </body>
    </html>
  );
});

export default {
  port: 3000,
  fetch: app.fetch,
};
