import path from "path";
import { Hono } from "hono";
import { jsxRenderer } from "hono/jsx-renderer";
import { getTests, run } from "core/src/benchmark";

const app = new Hono();
app.use("*", jsxRenderer());

const MODELS = [
  "anthropic/claude-sonnet-4-20250514",
  "openrouter/google/gemini-2.5-pro",
  "openai/codex-mini-latest",
  "openai/gpt-4.1",
];
const TESTS = await getTests();
const css = await Bun.file(path.join(import.meta.dir, "index.css")).text();

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
        <style>{css}</style>
      </head>
      <body>
        <form id="benchmark-form">
          <h1>Run Benchmark</h1>
          <div className="form-row">
            <label htmlFor="model">Model:</label>
            <select id="model" name="model">
              {MODELS.map((model) => (
                <option value={model}>{model}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="test">Test:</label>
            <select id="test" name="test">
              {TESTS.map((test) => (
                <option value={test}>{test}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <button type="submit">Run</button>
          </div>
          <pre id="result" style={{ display: "none" }}></pre>
        </form>
        <script
          dangerouslySetInnerHTML={{
            __html: `document.getElementById('benchmark-form').addEventListener('submit', async function(e) {
              e.preventDefault();
              const model = document.getElementById('model').value;
              const testName = document.getElementById('test').value;
              const resultPre = document.getElementById('result');
              resultPre.style.display = 'block';
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
            });
            // Hide result if empty on page load
            const resultPre = document.getElementById('result');
            if (!resultPre.textContent.trim()) resultPre.style.display = 'none';
          `,
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
