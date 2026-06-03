import { useState, useRef } from "react";
import { supabase } from "../supabase";
import Papa from "papaparse";

export default function ImportTasks({ spaces, onDone }) {
  const [step, setStep] = useState(1);
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({
    title: "Task Name",
    status: "Status",
    priority: "Priority",
    assignee: "Assignee",
    due_date: "Start Date",
    description: "Task Content",
  });
  const [selectedSpace, setSelectedSpace] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("");
  const [statusMap, setStatusMap] = useState({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState({ imported: 0, skipped: 0 });
  const [errors, setErrors] = useState([]);
  const fileRef = useRef();

  const csvStatuses = [
    ...new Set(rows.map((r) => r[mapping.status]).filter(Boolean)),
  ];

  const spaceFolders =
    spaces.find((s) => s.id === selectedSpace)?.folders || [];

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setHeaders(results.meta.fields || []);
        setRows(results.data);
        setStep(2);
      },
    });
  }

  function normalizeStatus(csvStatus) {
    if (statusMap[csvStatus]) return statusMap[csvStatus];
    const s = (csvStatus || "").toLowerCase().trim();
    if (s === "complete" || s === "done" || s === "completed") return "Done";
    if (s === "in progress" || s === "in_progress") return "In Progress";
    if (s === "to do" || s === "todo" || s === "open") return "To Do";
    if (s === "in review") return "In Review";
    if (s === "client cancelled" || s === "cancelled")
      return "Client Cancelled";
    return "To Do";
  }

  function normalizePriority(p) {
    const val = (p || "").toLowerCase().trim();
    if (val === "urgent" || val === "high") return "High";
    if (val === "normal" || val === "medium" || val === "med") return "Medium";
    if (val === "low") return "Low";
    return "Medium";
  }

  function normalizeDate(dateStr) {
    if (!dateStr || dateStr.trim() === "") return null;
    try {
      const cleaned = dateStr
        .replace(/(\d+)(st|nd|rd|th)/, "$1")
        .replace(/,/g, "");
      const d = new Date(cleaned);
      if (isNaN(d.getTime())) return null;
      return d.toISOString().split("T")[0];
    } catch {
      return null;
    }
  }

  function normalizeAssignees(assigneeStr) {
    if (!assigneeStr) return [];
    const cleaned = assigneeStr.replace(/[\[\]]/g, "").trim();
    if (!cleaned) return [];
    return cleaned
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function buildPreview() {
    return rows.slice(0, 8).map((row) => ({
      title: row[mapping.title] || "",
      status: normalizeStatus(row[mapping.status]),
      priority: normalizePriority(row[mapping.priority]),
      assignees: normalizeAssignees(row[mapping.assignee]),
      due_date: normalizeDate(row[mapping.due_date]),
    }));
  }

  async function runImport() {
    if (!selectedSpace) {
      alert("Please select a space first.");
      return;
    }
    setImporting(true);
    setProgress(0);
    setErrors([]);

    let imported = 0;
    let skipped = 0;
    const errs = [];

    const tasks = rows.map((row) => {
      const assignees = normalizeAssignees(row[mapping.assignee]);
      return {
        title: (row[mapping.title] || "").trim(),
        status: normalizeStatus(row[mapping.status]),
        priority: normalizePriority(row[mapping.priority]),
        assignee: assignees[0] || "",
        assignees: assignees,
        due_date: normalizeDate(row[mapping.due_date]),
        description: (row[mapping.description] || "").trim(),
        space_id: selectedSpace,
        folder_id: selectedFolder || null,
      };
    });

    const valid = tasks.filter((t) => t.title.length > 0);
    skipped = tasks.length - valid.length;

    const batchSize = 20;
    for (let i = 0; i < valid.length; i += batchSize) {
      const batch = valid.slice(i, i + batchSize);
      const { error } = await supabase.from("tasks").insert(batch);
      if (error) {
        errs.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      } else {
        imported += batch.length;
      }
      setProgress(Math.round(((i + batch.length) / valid.length) * 100));
    }

    setResult({ imported, skipped });
    setErrors(errs);
    setImporting(false);
    setStep(4);
  }

  const stepLabels = ["Upload CSV", "Map columns", "Preview & import", "Done"];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Import tasks from ClickUp</div>
          <div className="page-subtitle">
            Upload a ClickUp CSV export and map it to your spaces
          </div>
        </div>
        <button className="btn" onClick={onDone}>
          ✕ Close
        </button>
      </div>

      {/* Steps indicator */}
      <div
        style={{
          display: "flex",
          gap: 0,
          padding: "12px 24px",
          borderBottom: "1px solid #e8e8e8",
          background: "#fff",
        }}
      >
        {stepLabels.map((label, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginRight: 20,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background:
                  step > i + 1
                    ? "#16a34a"
                    : step === i + 1
                      ? "#1d4ed8"
                      : "#e8e8e8",
                color: step >= i + 1 ? "#fff" : "#aaa",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {step > i + 1 ? "✓" : i + 1}
            </div>
            <span
              style={{
                fontSize: 12,
                color: step === i + 1 ? "#1d4ed8" : "#888",
                fontWeight: step === i + 1 ? 500 : 400,
              }}
            >
              {label}
            </span>
            {i < 3 && <span style={{ color: "#ddd", marginLeft: 14 }}>›</span>}
          </div>
        ))}
      </div>

      <div className="content-area">
        {/* STEP 1 — Upload */}
        {step === 1 && (
          <div
            style={{ maxWidth: 500, margin: "40px auto", textAlign: "center" }}
          >
            <div
              style={{
                border: "2px dashed #e8e8e8",
                borderRadius: 12,
                padding: "40px 24px",
                cursor: "pointer",
                background: "#fafaf9",
              }}
              onClick={() => fileRef.current?.click()}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                Upload ClickUp CSV export
              </div>
              <div style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
                In ClickUp: open list → ... → More → Export → CSV
              </div>
              <button className="btn btn-primary">Choose CSV file</button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                style={{ display: "none" }}
                onChange={handleFile}
              />
            </div>
          </div>
        )}

        {/* STEP 2 — Map columns */}
        {step === 2 && (
          <div style={{ maxWidth: 700 }}>
            <div
              style={{
                background: "#fff",
                border: "1px solid #e8e8e8",
                borderRadius: 8,
                padding: 20,
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                {rows.length} tasks found · Map CSV columns to task fields
              </div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
                Auto-detected from your ClickUp export — adjust if needed
              </div>
              <div className="form-grid">
                {Object.entries(mapping).map(([field, csvCol]) => (
                  <div className="form-group" key={field}>
                    <label className="form-label">
                      {field === "due_date"
                        ? "Due date"
                        : field.charAt(0).toUpperCase() +
                          field.slice(1).replace("_", " ")}
                    </label>
                    <select
                      value={csvCol}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          [field]: e.target.value,
                        }))
                      }
                    >
                      <option value="">— Skip —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                background: "#fff",
                border: "1px solid #e8e8e8",
                borderRadius: 8,
                padding: 20,
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
                Import destination
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Space *</label>
                  <select
                    value={selectedSpace}
                    onChange={(e) => {
                      setSelectedSpace(e.target.value);
                      setSelectedFolder("");
                    }}
                  >
                    <option value="">Select space...</option>
                    {spaces.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Folder (optional)</label>
                  <select
                    value={selectedFolder}
                    onChange={(e) => setSelectedFolder(e.target.value)}
                    disabled={!selectedSpace}
                  >
                    <option value="">No folder</option>
                    {spaceFolders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {csvStatuses.length > 0 && (
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #e8e8e8",
                  borderRadius: 8,
                  padding: 20,
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  Map ClickUp statuses
                </div>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>
                  Auto-mapped — adjust if needed
                </div>
                {csvStatuses.map((s) => (
                  <div
                    key={s}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        width: 160,
                        color: "#555",
                        flexShrink: 0,
                      }}
                    >
                      {s || "(empty)"}
                    </span>
                    <span style={{ color: "#aaa" }}>→</span>
                    <select
                      value={statusMap[s] || normalizeStatus(s)}
                      onChange={(e) =>
                        setStatusMap((prev) => ({
                          ...prev,
                          [s]: e.target.value,
                        }))
                      }
                      style={{ flex: 1 }}
                    >
                      <option>To Do</option>
                      <option>In Progress</option>
                      <option>In Review</option>
                      <option>Done</option>
                      <option>Client Cancelled</option>
                    </select>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setStep(3)}
                disabled={!selectedSpace}
              >
                Preview import →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — Preview */}
        {step === 3 && (
          <div style={{ maxWidth: 900 }}>
            <div
              style={{
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: 8,
                padding: "12px 16px",
                marginBottom: 16,
                fontSize: 13,
                color: "#1e40af",
              }}
            >
              <strong>{rows.length} tasks</strong> will be imported into{" "}
              <strong>
                {spaces.find((s) => s.id === selectedSpace)?.name}
              </strong>
              {selectedFolder &&
                ` / ${spaceFolders.find((f) => f.id === selectedFolder)?.name}`}
              . Showing first 8 as preview.
            </div>

            <div
              style={{
                background: "#fff",
                border: "1px solid #e8e8e8",
                borderRadius: 8,
                overflow: "hidden",
                marginBottom: 16,
              }}
            >
              <table className="task-table">
                <thead>
                  <tr>
                    <th>Task name</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Assignees</th>
                    <th>Due date</th>
                  </tr>
                </thead>
                <tbody>
                  {buildPreview().map((task, i) => (
                    <tr key={i}>
                      <td
                        style={{ fontWeight: 500, maxWidth: 280, fontSize: 13 }}
                      >
                        {task.title}
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background:
                              task.status === "Done"
                                ? "#dcfce7"
                                : task.status === "In Progress"
                                  ? "#fef9c3"
                                  : "#f5f5f4",
                            color:
                              task.status === "Done"
                                ? "#15803d"
                                : task.status === "In Progress"
                                  ? "#854d0e"
                                  : "#555",
                          }}
                        >
                          {task.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{task.priority}</td>
                      <td>
                        <div
                          style={{ display: "flex", flexWrap: "wrap", gap: 3 }}
                        >
                          {task.assignees.length > 0
                            ? task.assignees.map((name) => (
                                <span
                                  key={name}
                                  style={{
                                    background: "#f0f0ef",
                                    borderRadius: 20,
                                    padding: "1px 7px",
                                    fontSize: 11,
                                    fontWeight: 500,
                                    color: "#333",
                                  }}
                                >
                                  {name}
                                </span>
                              ))
                            : "—"}
                        </div>
                      </td>
                      <td style={{ fontSize: 12 }}>{task.due_date || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {importing && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: "#555", marginBottom: 6 }}>
                  Importing... {progress}%
                </div>
                <div
                  style={{
                    background: "#e8e8e8",
                    borderRadius: 20,
                    height: 6,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: "100%",
                      background: "#1d4ed8",
                      transition: "width 0.3s",
                      borderRadius: 20,
                    }}
                  />
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn"
                onClick={() => setStep(2)}
                disabled={importing}
              >
                Back
              </button>
              <button
                className="btn btn-primary"
                onClick={runImport}
                disabled={importing}
              >
                {importing
                  ? `Importing... ${progress}%`
                  : `Import all ${rows.length} tasks`}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 — Done */}
        {step === 4 && (
          <div
            style={{ maxWidth: 480, margin: "40px auto", textAlign: "center" }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>
              {errors.length === 0 ? "✅" : "⚠️"}
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                marginBottom: 8,
                color: "#1a1a1a",
              }}
            >
              Import complete
            </div>
            <div style={{ fontSize: 14, color: "#555", marginBottom: 20 }}>
              <span style={{ color: "#16a34a", fontWeight: 600 }}>
                {result.imported} tasks imported
              </span>
              {result.skipped > 0 && (
                <span style={{ color: "#888", marginLeft: 8 }}>
                  · {result.skipped} skipped (empty titles)
                </span>
              )}
            </div>
            {errors.length > 0 && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 16,
                  fontSize: 12,
                  color: "#b91c1c",
                  textAlign: "left",
                }}
              >
                {errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                className="btn"
                onClick={() => {
                  setStep(1);
                  setRows([]);
                  setHeaders([]);
                  setStatusMap({});
                }}
              >
                Import another file
              </button>
              <button className="btn btn-primary" onClick={onDone}>
                View tasks
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
