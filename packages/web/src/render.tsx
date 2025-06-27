/** @jsx jsx */
/** @jsxImportSource hono/jsx */

import { Fragment } from "hono/jsx";
import { renderToString } from "hono/jsx/dom/server";
import path from "path";
import type { Result } from "core";

async function generate() {
  const resultsPath = path.join(import.meta.dir, "..", "..", "..", "results");
  const data: Record<
    string,
    {
      models: Set<string>;
      projects: Set<string>;
      results: Record<string, Result>;
    }
  > = {};
  for await (const summaryPath of new Bun.Glob("**/summary.json").scan({
    cwd: resultsPath,
    absolute: true,
  })) {
    const parts = summaryPath.split(path.sep);
    const idx = parts.lastIndexOf("results");
    if (idx === -1) continue;
    const timestamp = parts[idx + 1];
    const project = parts[idx + 2];
    const model = parts.slice(idx + 3, -1).join("/");

    data[timestamp] = data[timestamp] ?? {
      models: new Set(),
      projects: new Set(),
      results: {},
    };
    data[timestamp].models.add(model);
    data[timestamp].projects.add(project);

    const summary = JSON.parse(await Bun.file(summaryPath).text());
    data[timestamp]["results"][`${project}/${model}`] = summary;
  }

  return Object.entries(data)
    .map(([timestamp, { models, projects, results }]) => ({
      timestamp,
      models: Array.from(models).sort(),
      projects: Array.from(projects).sort(),
      results,
    }))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .reverse();
}

const allResults = await generate();
const results = allResults[0];

console.log(allResults);

function renderResultsTable(results: {
  timestamp: string;
  models: string[];
  projects: string[];
  results: Record<string, Result>;
}) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr>
          <th style={{ border: "1px solid #ccc", padding: "4px" }}></th>
          {results.projects.map((project: string) => (
            <th style={{ border: "1px solid #ccc", padding: "4px" }}>
              {project}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {results.models.map((model: string) => (
          <tr>
            <td
              style={{
                border: "1px solid #ccc",
                padding: "4px",
                fontWeight: "bold",
              }}
            >
              {model}
            </td>
            {results.projects.map((project: string) => {
              const key = `${project}/${model}`;
              const value = results.results[key];
              return (
                <td
                  style={{
                    border: "1px solid #ccc",
                    padding: "4px",
                    fontFamily: "monospace",
                    fontSize: "0.9em",
                  }}
                >
                  {value ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          fontSize: "1.3em",
                          fontWeight: "bold",
                          gap: 4,
                        }}
                      >
                        {typeof value.added === "number" && (
                          <span style={{ color: "#228B22", marginRight: 4 }}>
                            +{value.added}
                          </span>
                        )}
                        {typeof value.removed === "number" && (
                          <span style={{ color: "#B22222" }}>
                            -{value.removed}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {typeof value.duration === "number" && (
                          <span
                            style={{
                              color: "#888",
                              fontSize: "1.3em",
                              fontWeight: "bold",
                            }}
                          >
                            {(value.duration / 1000).toFixed(2)}s
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {typeof value.cost === "number" && (
                          <span
                            style={{
                              color: "#0074d9",
                              fontSize: "1.3em",
                              fontWeight: "bold",
                            }}
                          >
                            ${value.cost.toFixed(4)}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          gap: 2,
                        }}
                      >
                        {value.opencode.share && (
                          <a
                            href={`https://opencode.ai/s/${value.opencode.share}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "#0074d9",
                              textDecoration: "underline",
                              fontSize: "0.85em",
                            }}
                          >
                            View share link
                          </a>
                        )}
                        {value.gitRef && (
                          <a
                            href={`https://github.com/sst/agents-benchmark/tree/${value.gitRef}/projects/${project}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "#0074d9",
                              textDecoration: "underline",
                              fontSize: "0.85em",
                            }}
                          >
                            View test
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    ""
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const Rendered = renderToString(
  <Fragment>
    <h2>Latest Results ({results.timestamp})</h2>
    {renderResultsTable(results)}
    <div style={{ marginTop: "2em" }}>
      <h3>Historical Test Results</h3>
      <ul>
        {allResults.map((r) => (
          <li
            key={r.timestamp}
            data-table={renderToString(renderResultsTable(r))}
          >
            <a
              href={`?date=${encodeURIComponent(r.timestamp)}`}
              style={{ color: "#0074d9", textDecoration: "underline" }}
            >
              {r.timestamp}
            </a>
          </li>
        ))}
      </ul>
    </div>
  </Fragment>
);
