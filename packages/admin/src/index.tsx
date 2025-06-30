import path from "path";
import { Hono } from "hono";
import { jsxRenderer } from "hono/jsx-renderer";
import { getResults, getTests, run } from "core/src/benchmark";

const app = new Hono();
app.use("*", jsxRenderer());

const MODELS = [
  "anthropic/claude-sonnet-4-20250514",
  "openrouter/google/gemini-2.5-pro",
  "openai/codex-mini-latest",
  "openai/gpt-4.1",
];
const css = await Bun.file(path.join(import.meta.dir, "index.css")).text();

function renderPatchedFileWithHighlights(diff?: string) {
  // Split diff into lines
  const diffLines = diff ? diff.split("\n") : [];
  let result: { line: string; type: "context" | "add" | "remove" }[] = [];

  // Find the first hunk
  let i = 0;
  while (i < diffLines.length) {
    const line = diffLines[i] ?? "";
    if (line.startsWith("@@")) break;
    i++;
  }

  while (i < diffLines.length) {
    const hunkHeader = diffLines[i] ?? "";
    if (!hunkHeader.startsWith("@@")) {
      i++;
      continue;
    }
    i++;
    while (i < diffLines.length && !(diffLines[i] ?? "").startsWith("@@")) {
      const line = diffLines[i] ?? "";
      if (line.startsWith("+")) {
        result.push({ line: line.slice(1), type: "add" });
      } else if (line.startsWith("-")) {
        result.push({ line: line.slice(1), type: "remove" });
      } else if (line.startsWith(" ")) {
        result.push({ line: line.slice(1), type: "context" });
      } else if (line.trim() === "") {
        // blank line in diff, treat as context
        result.push({ line: "", type: "context" });
      }
      i++;
    }
  }
  return (
    <pre
      style={{
        background: "#f4f4f4",
        border: "1px solid #e0e0e0",
        borderRadius: 4,
        padding: 8,
        fontSize: 13,
        overflowX: "auto",
      }}
    >
      {result.map((l, idx) => (
        <div key={idx}>
          <span
            className={
              l.type === "add"
                ? "diff-added"
                : l.type === "remove"
                ? "diff-removed"
                : undefined
            }
            style={{
              backgroundColor:
                l.type === "add"
                  ? "#eaffea"
                  : l.type === "remove"
                  ? "#ffeaea"
                  : undefined,
              display: "block",
              whiteSpace: "pre-wrap",
            }}
          >
            {l.type === "add"
              ? "+ " + (l.line ?? "")
              : l.type === "remove"
              ? "- " + (l.line ?? "")
              : "  " + (l.line ?? "")}
          </span>
        </div>
      ))}
    </pre>
  );
}

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
  const TESTS = await getTests();
  const RESULTS = await getResults();
  console.log(JSON.stringify(RESULTS, null, 2));
  return c.render(
    <html>
      <head>
        <title>Agents Benchmark</title>
        <style>{css}</style>
      </head>
      <body>
        <div>
          <h1>Run Benchmark</h1>
          <form id="benchmark-form">
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
          <h1>Results</h1>
          <table
            id="results-table"
            style={{
              width: "100%",
              maxWidth: 400,
              marginTop: "1.5rem",
              borderCollapse: "collapse",
              background: "#fff",
              borderRadius: 8,
              boxShadow: "0 2px 8px #0001",
            }}
          >
            <thead>
              <tr>
                <th>Run</th>
                <th>Timestamp</th>
                <th>Test</th>
                <th>Model</th>
                <th>Duration</th>
                <th>Cost</th>
                <th>I/O Tokens</th>
                <th>Cache R/W</th>
                <th>Diffs</th>
                <th>Version</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              {RESULTS.map((r, i) => [
                <tr key={r.timestamp}>
                  <td>#{i + 1}</td>
                  <td>{new Date(r.timestamp).toLocaleString()}</td>
                  <td>{r.summary.test}</td>
                  <td>{r.summary.model}</td>
                  <td>{(r.summary.duration / 1000).toFixed(0)}s</td>
                  <td>${r.summary.cost.toFixed(4)}</td>
                  <td>
                    {r.summary.tokens.input} / {r.summary.tokens.output}
                  </td>
                  <td>
                    {r.summary.tokens.cache_read} /{" "}
                    {r.summary.tokens.cache_write}
                  </td>
                  <td>
                    {r.summary.diffs.length > 0 ? (
                      <>
                        {r.summary.diffs.map((diff) => (
                          <div
                            key={diff.file}
                            style={{
                              display: "flex",
                              gap: "0.5em",
                              alignItems: "center",
                            }}
                          >
                            <span style={{ fontFamily: "monospace" }}>
                              {diff.file}
                            </span>
                            <span className="diff-added">+{diff.added}</span>
                            <span className="diff-removed">
                              -{diff.removed}
                            </span>
                          </div>
                        ))}
                        <button
                          type="button"
                          style={{
                            marginLeft: 8,
                            fontSize: 12,
                            padding: "2px 8px",
                          }}
                          data-diff-toggle={r.timestamp}
                        >
                          View diff
                        </button>
                      </>
                    ) : (
                      <span style={{ color: "#888" }}>No diff</span>
                    )}
                  </td>
                  <td>{r.summary.opencode.version}</td>
                  <td>
                    <a
                      href={`https://opencode.ai/s/${r.summary.opencode.share}`}
                      target="_blank"
                    >
                      link
                    </a>
                  </td>
                </tr>,
                r.summary.diffs.length > 0 && (
                  <tr
                    key={r.timestamp + "-diff"}
                    id={`diff-row-${r.timestamp}`}
                    data-diff-row={r.timestamp}
                    style={{ display: "none" }}
                  >
                    <td colSpan={12}>
                      <div style={{ display: "flex", gap: 24 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>
                            Expected Changes
                          </div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>
                            Actual Changes
                          </div>
                        </div>
                      </div>

                      {r.summary.diffs.map((diff) => (
                        <div key={diff.file} style={{ marginBottom: "2em" }}>
                          <div style={{ display: "flex", gap: 24 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 500,
                                  marginBottom: 8,
                                  fontSize: 16,
                                }}
                              >
                                {diff.file}
                              </div>
                              {renderPatchedFileWithHighlights(
                                diff.expectedPatch
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: 500,
                                  marginBottom: 8,
                                  fontSize: 16,
                                }}
                              >
                                {diff.file}
                              </div>
                              {renderPatchedFileWithHighlights(
                                diff.actualPatch
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </td>
                  </tr>
                ),
              ])}
            </tbody>
          </table>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.getElementById('benchmark-form').addEventListener('submit', async function(e) {
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
              // Diff row toggling
              document.querySelectorAll('[data-diff-toggle]').forEach(function(btn) {
                btn.addEventListener('click', function() {
                  var ts = btn.getAttribute('data-diff-toggle');
                  var row = document.querySelector('[data-diff-row="' + ts + '"]');
                  if (row) row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
                });
              });
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
