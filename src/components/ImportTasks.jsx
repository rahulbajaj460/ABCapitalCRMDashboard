import { useState, useRef, useEffect } from "react";
import { supabase } from "../supabase";
import Papa from "papaparse";

const FIELD_TYPES = [
  "text",
  "number",
  "date",
  "email",
  "phone",
  "url",
  "username",
];

const CORE_FIELDS = [
  { key: "title", label: "Task Name *", required: true },
  { key: "status", label: "Status", required: false },
  { key: "priority", label: "Priority", required: false },
  { key: "assignee", label: "Assignee", required: false },
  { key: "due_date", label: "Due Date", required: false },
  { key: "description", label: "Description", required: false },
];

export default function ImportTasks({ spaces, onDone, onRefreshSpaces }) {
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

  const [customFieldMappings, setCustomFieldMappings] = useState({});
  const [selectedSpace, setSelectedSpace] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("");
  const [statusMap, setStatusMap] = useState({});

  // Status review state
  const [statusReview, setStatusReview] = useState({
    newStatuses: [], // in CSV but not in portal
    emptyStatuses: [], // in portal but 0 tasks
  });
  const [newStatusActions, setNewStatusActions] = useState({}); // { statusName: { action: 'create'|'map', mapTo: '', color: '#...' } }
  const [emptyStatusActions, setEmptyStatusActions] = useState({}); // { statusId: 'keep'|'delete' }
  const [loadingReview, setLoadingReview] = useState(false);

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

  const unmappedColumns = headers.filter(
    (h) => !Object.values(mapping).includes(h),
  );

  const existingFields = (() => {
    const space = spaces.find((s) => s.id === selectedSpace);
    if (!space) return [];
    if (selectedFolder) {
      const folder = space.folders?.find((f) => f.id === selectedFolder);
      return folder?.space_fields || space.space_fields || [];
    }
    return space.space_fields || [];
  })();

  // Get portal statuses for selected space/folder
  function getPortalStatuses() {
    const space = spaces.find((s) => s.id === selectedSpace);
    if (!space) return [];
    if (selectedFolder) {
      const folder = space.folders?.find((f) => f.id === selectedFolder);
      const folderStatuses = folder?.space_statuses || [];
      if (folderStatuses.length > 0) return folderStatuses;
    }
    return (space.space_statuses || []).filter((s) => !s.folder_id);
  }

  async function buildStatusReview() {
    setLoadingReview(true);
    const portalStatuses = getPortalStatuses();
    const portalStatusNames = portalStatuses.map((s) =>
      s.name.toLowerCase().trim(),
    );

    // Normalize CSV statuses
    const csvStatusesNormalized = csvStatuses.map((s) => normalizeStatus(s));
    const uniqueCsvStatuses = [...new Set(csvStatusesNormalized)];

    // Find statuses in CSV but not in portal
    const newStatuses = uniqueCsvStatuses.filter(
      (s) => !portalStatusNames.includes(s.toLowerCase().trim()),
    );

    // Find portal statuses with 0 tasks
    const emptyStatuses = [];
    for (const ps of portalStatuses) {
      let query = supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", ps.name)
        .eq("space_id", selectedSpace);

      if (selectedFolder) {
        query = query.eq("folder_id", selectedFolder);
      }

      const { count } = await query;
      if ((count || 0) === 0) {
        emptyStatuses.push(ps);
      }
    }

    setStatusReview({ newStatuses, emptyStatuses });

    // Set default actions
    const newActions = {};
    newStatuses.forEach((s) => {
      newActions[s] = { action: "create", mapTo: "", color: "#378ADD" };
    });
    setNewStatusActions(newActions);

    const emptyActions = {};
    emptyStatuses.forEach((s) => {
      emptyActions[s.id] = "keep";
    });
    setEmptyStatusActions(emptyActions);

    setLoadingReview(false);

    // If nothing to review, skip to preview
    if (newStatuses.length === 0 && emptyStatuses.length === 0) {
      setStep(3);
    } else {
      setStep(25); // step 2.5
    }
  }

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
    // Return as-is with title case for unknown statuses
    return csvStatus.trim().replace(/\b\w/g, (c) => c.toUpperCase());
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

  function updateCustomFieldMapping(col, updates) {
    setCustomFieldMappings((prev) => ({
      ...prev,
      [col]: {
        ...(prev[col] || { action: "skip", fieldName: col, fieldType: "text" }),
        ...updates,
      },
    }));
  }

  async function applyStatusChanges() {
    const portalStatuses = getPortalStatuses();

    // Create new statuses
    for (const [statusName, cfg] of Object.entries(newStatusActions)) {
      if (cfg.action === "create") {
        await supabase.from("space_statuses").insert({
          space_id: selectedSpace,
          folder_id: selectedFolder || null,
          name: statusName,
          color: cfg.color,
          status_order: portalStatuses.length + 1,
        });
      } else if (cfg.action === "map" && cfg.mapTo) {
        // Update statusMap so CSV tasks with this status get mapped
        setStatusMap((prev) => ({ ...prev, [statusName]: cfg.mapTo }));
      }
    }

    // Delete empty statuses marked for deletion
    for (const [statusId, action] of Object.entries(emptyStatusActions)) {
      if (action === "delete") {
        await supabase.from("space_statuses").delete().eq("id", statusId);
      }
    }

    await onRefreshSpaces?.();
  }

  async function createNewFields() {
    const toCreate = Object.entries(customFieldMappings).filter(
      ([, v]) => v.action === "new" && v.fieldName?.trim(),
    );
    const created = {};
    for (const [col, cfg] of toCreate) {
      const { data, error } = await supabase
        .from("space_fields")
        .insert({
          space_id: selectedSpace,
          folder_id: selectedFolder || null,
          field_name: cfg.fieldName.trim(),
          field_type: cfg.fieldType || "text",
          field_order:
            (existingFields.length || 0) + Object.keys(created).length + 1,
        })
        .select()
        .single();
      if (!error && data) created[col] = data.id;
    }
    return created;
  }

  function buildPreview() {
    return rows.slice(0, 6).map((row) => ({
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

    // Apply status changes first
    await applyStatusChanges();

    // Create new custom fields
    const newFieldIds = await createNewFields();

    const fieldIdMap = {};
    for (const [col, cfg] of Object.entries(customFieldMappings)) {
      if (cfg.action === "new" && newFieldIds[col])
        fieldIdMap[col] = newFieldIds[col];
      else if (cfg.action === "existing" && cfg.existingFieldId)
        fieldIdMap[col] = cfg.existingFieldId;
    }

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
        assignees,
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
      const { data: inserted, error } = await supabase
        .from("tasks")
        .insert(batch)
        .select("id");

      if (error) {
        errs.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      } else {
        if (inserted && Object.keys(fieldIdMap).length > 0) {
          const fieldValues = [];
          inserted.forEach((task, idx) => {
            const row = rows[i + idx];
            if (!row) return;
            for (const [col, fieldId] of Object.entries(fieldIdMap)) {
              const value = row[col];
              if (value && value.trim()) {
                fieldValues.push({
                  task_id: task.id,
                  field_id: fieldId,
                  value: value.trim(),
                });
              }
            }
          });
          if (fieldValues.length > 0) {
            await supabase.from("task_field_values").insert(fieldValues);
          }
        }
        imported += batch.length;
      }
      setProgress(Math.round(((i + batch.length) / valid.length) * 100));
    }

    setResult({ imported, skipped });
    setErrors(errs);
    setImporting(false);
    if (onRefreshSpaces) await onRefreshSpaces();
    setStep(4);
  }

  const stepLabels = [
    "Upload CSV",
    "Map columns",
    "Review statuses",
    "Preview & import",
    "Done",
  ];
  const stepNumbers = { 1: 1, 2: 2, 25: 3, 3: 4, 4: 5 };
  const currentStepNum = stepNumbers[step] || 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Import tasks from ClickUp</div>
          <div className="page-subtitle">
            Upload a ClickUp CSV and map columns to your task fields
          </div>
        </div>
        <button className="btn" onClick={onDone}>
          ✕ Close
        </button>
      </div>

      {/* Steps */}
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
              marginRight: 16,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background:
                  currentStepNum > i + 1
                    ? "#16a34a"
                    : currentStepNum === i + 1
                      ? "#1d4ed8"
                      : "#e8e8e8",
                color: currentStepNum >= i + 1 ? "#fff" : "#aaa",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {currentStepNum > i + 1 ? "✓" : i + 1}
            </div>
            <span
              style={{
                fontSize: 12,
                color: currentStepNum === i + 1 ? "#1d4ed8" : "#888",
                fontWeight: currentStepNum === i + 1 ? 500 : 400,
              }}
            >
              {label}
            </span>
            {i < stepLabels.length - 1 && (
              <span style={{ color: "#ddd", marginLeft: 12 }}>›</span>
            )}
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
          <div style={{ maxWidth: 760 }}>
            {/* Core fields */}
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
                {rows.length} tasks found · Map core fields
              </div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
                Match CSV columns to standard task fields
              </div>
              <div className="form-grid">
                {CORE_FIELDS.map(({ key, label }) => (
                  <div className="form-group" key={key}>
                    <label className="form-label">{label}</label>
                    <select
                      value={mapping[key]}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          [key]: e.target.value,
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

            {/* Destination */}
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

            {/* Extra columns */}
            {unmappedColumns.length > 0 && (
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
                  Extra columns ({unmappedColumns.length})
                </div>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
                  Choose what to do with unmapped columns
                </div>
                {unmappedColumns.map((col) => {
                  const action = customFieldMappings[col]?.action || "skip";
                  const cfg = customFieldMappings[col] || {
                    action: "skip",
                    fieldName: col,
                    fieldType: "text",
                  };
                  const sampleValue = rows.find((r) => r[col])?.[col] || "";
                  return (
                    <div
                      key={col}
                      style={{
                        border: "1px solid #e8e8e8",
                        borderRadius: 8,
                        padding: "12px 14px",
                        marginBottom: 10,
                        background: action === "skip" ? "#fafaf9" : "#f0f9ff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ minWidth: 180, flex: 1 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#333",
                            }}
                          >
                            {col}
                          </div>
                          {sampleValue && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "#aaa",
                                marginTop: 2,
                              }}
                            >
                              Sample: {sampleValue.slice(0, 40)}
                              {sampleValue.length > 40 ? "..." : ""}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <select
                            value={action}
                            onChange={(e) =>
                              updateCustomFieldMapping(col, {
                                action: e.target.value,
                              })
                            }
                            style={{ fontSize: 12, padding: "4px 8px" }}
                          >
                            <option value="skip">Skip this column</option>
                            <option value="new">Create new custom field</option>
                            {existingFields.length > 0 && (
                              <option value="existing">
                                Map to existing field
                              </option>
                            )}
                          </select>
                          {action === "new" && (
                            <>
                              <input
                                placeholder="Field name"
                                value={cfg.fieldName || col}
                                onChange={(e) =>
                                  updateCustomFieldMapping(col, {
                                    fieldName: e.target.value,
                                  })
                                }
                                style={{
                                  fontSize: 12,
                                  padding: "4px 8px",
                                  width: 150,
                                }}
                              />
                              <select
                                value={cfg.fieldType || "text"}
                                onChange={(e) =>
                                  updateCustomFieldMapping(col, {
                                    fieldType: e.target.value,
                                  })
                                }
                                style={{ fontSize: 12, padding: "4px 8px" }}
                              >
                                {FIELD_TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {t.charAt(0).toUpperCase() + t.slice(1)}
                                  </option>
                                ))}
                              </select>
                              <span
                                style={{
                                  fontSize: 11,
                                  background: "#dbeafe",
                                  color: "#1d4ed8",
                                  borderRadius: 20,
                                  padding: "2px 8px",
                                }}
                              >
                                Will be created
                              </span>
                            </>
                          )}
                          {action === "existing" && (
                            <select
                              value={cfg.existingFieldId || ""}
                              onChange={(e) =>
                                updateCustomFieldMapping(col, {
                                  existingFieldId: e.target.value,
                                })
                              }
                              style={{ fontSize: 12, padding: "4px 8px" }}
                            >
                              <option value="">Select field...</option>
                              {existingFields.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.field_name} ({f.field_type})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                className="btn btn-primary"
                onClick={buildStatusReview}
                disabled={!selectedSpace || loadingReview}
              >
                {loadingReview ? "Analysing statuses..." : "Review statuses →"}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2.5 — Status review */}
        {step === 25 && (
          <div style={{ maxWidth: 700 }}>
            {/* New statuses from CSV */}
            {statusReview.newStatuses.length > 0 && (
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
                  🆕 New statuses found in CSV (
                  {statusReview.newStatuses.length})
                </div>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
                  These statuses exist in your CSV but are not in your portal.
                  Choose what to do with each.
                </div>
                {statusReview.newStatuses.map((statusName) => {
                  const cfg = newStatusActions[statusName] || {
                    action: "create",
                    color: "#378ADD",
                    mapTo: "",
                  };
                  const portalStatuses = getPortalStatuses();
                  return (
                    <div
                      key={statusName}
                      style={{
                        border: "1px solid #e8e8e8",
                        borderRadius: 8,
                        padding: "12px 14px",
                        marginBottom: 10,
                        background:
                          cfg.action === "create" ? "#f0fdf4" : "#eff6ff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <span
                            style={{
                              background:
                                cfg.action === "create"
                                  ? cfg.color || "#378ADD"
                                  : "#f0f0ef",
                              color: cfg.action === "create" ? "#fff" : "#333",
                              borderRadius: 20,
                              padding: "2px 10px",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {statusName}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: "#aaa",
                              marginLeft: 8,
                            }}
                          >
                            {
                              rows.filter(
                                (r) =>
                                  normalizeStatus(r[mapping.status]) ===
                                  statusName,
                              ).length
                            }{" "}
                            tasks
                          </span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <select
                            value={cfg.action}
                            onChange={(e) =>
                              setNewStatusActions((prev) => ({
                                ...prev,
                                [statusName]: {
                                  ...cfg,
                                  action: e.target.value,
                                },
                              }))
                            }
                            style={{ fontSize: 12, padding: "4px 8px" }}
                          >
                            <option value="create">Create this status</option>
                            <option value="map">Map to existing status</option>
                          </select>
                          {cfg.action === "create" && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <label style={{ fontSize: 11, color: "#888" }}>
                                Color:
                              </label>
                              <input
                                type="color"
                                value={cfg.color || "#378ADD"}
                                onChange={(e) =>
                                  setNewStatusActions((prev) => ({
                                    ...prev,
                                    [statusName]: {
                                      ...cfg,
                                      color: e.target.value,
                                    },
                                  }))
                                }
                                style={{
                                  width: 36,
                                  height: 28,
                                  padding: 2,
                                  cursor: "pointer",
                                }}
                              />
                            </div>
                          )}
                          {cfg.action === "map" && (
                            <select
                              value={cfg.mapTo || ""}
                              onChange={(e) =>
                                setNewStatusActions((prev) => ({
                                  ...prev,
                                  [statusName]: {
                                    ...cfg,
                                    mapTo: e.target.value,
                                  },
                                }))
                              }
                              style={{ fontSize: 12, padding: "4px 8px" }}
                            >
                              <option value="">Map to...</option>
                              {portalStatuses.map((s) => (
                                <option key={s.id} value={s.name}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty statuses in portal */}
            {statusReview.emptyStatuses.length > 0 && (
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
                  🗑 Empty statuses in portal (
                  {statusReview.emptyStatuses.length})
                </div>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
                  These statuses have 0 tasks. Keep them or delete them?
                </div>
                {statusReview.emptyStatuses.map((status) => {
                  const action = emptyStatusActions[status.id] || "keep";
                  return (
                    <div
                      key={status.id}
                      style={{
                        border: "1px solid #e8e8e8",
                        borderRadius: 8,
                        padding: "12px 14px",
                        marginBottom: 10,
                        background: action === "delete" ? "#fef2f2" : "#fafaf9",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: status.color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{ flex: 1, fontSize: 13, fontWeight: 500 }}
                        >
                          {status.name}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "#aaa",
                            marginRight: 8,
                          }}
                        >
                          0 tasks
                        </span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() =>
                              setEmptyStatusActions((prev) => ({
                                ...prev,
                                [status.id]: "keep",
                              }))
                            }
                            style={{
                              padding: "4px 12px",
                              fontSize: 12,
                              borderRadius: 6,
                              cursor: "pointer",
                              border: "1px solid #e8e8e8",
                              background:
                                action === "keep" ? "#1d4ed8" : "#fff",
                              color: action === "keep" ? "#fff" : "#333",
                              fontWeight: action === "keep" ? 600 : 400,
                            }}
                          >
                            Keep
                          </button>
                          <button
                            onClick={() =>
                              setEmptyStatusActions((prev) => ({
                                ...prev,
                                [status.id]: "delete",
                              }))
                            }
                            style={{
                              padding: "4px 12px",
                              fontSize: 12,
                              borderRadius: 6,
                              cursor: "pointer",
                              border: "1px solid #fca5a5",
                              background:
                                action === "delete" ? "#fee2e2" : "#fff",
                              color: action === "delete" ? "#b91c1c" : "#333",
                              fontWeight: action === "delete" ? 600 : 400,
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Summary */}
            <div
              style={{
                background: "#f5f5f4",
                borderRadius: 8,
                padding: "12px 16px",
                marginBottom: 16,
                fontSize: 12,
                color: "#555",
              }}
            >
              <strong>Summary: </strong>
              {Object.values(newStatusActions).filter(
                (v) => v.action === "create",
              ).length > 0 && (
                <span style={{ color: "#16a34a", marginRight: 12 }}>
                  ✅{" "}
                  {
                    Object.values(newStatusActions).filter(
                      (v) => v.action === "create",
                    ).length
                  }{" "}
                  statuses will be created
                </span>
              )}
              {Object.values(newStatusActions).filter((v) => v.action === "map")
                .length > 0 && (
                <span style={{ color: "#1d4ed8", marginRight: 12 }}>
                  🔄{" "}
                  {
                    Object.values(newStatusActions).filter(
                      (v) => v.action === "map",
                    ).length
                  }{" "}
                  statuses will be mapped
                </span>
              )}
              {Object.values(emptyStatusActions).filter((v) => v === "delete")
                .length > 0 && (
                <span style={{ color: "#b91c1c" }}>
                  🗑{" "}
                  {
                    Object.values(emptyStatusActions).filter(
                      (v) => v === "delete",
                    ).length
                  }{" "}
                  empty statuses will be deleted
                </span>
              )}
              {Object.values(newStatusActions).length === 0 &&
                Object.values(emptyStatusActions).filter((v) => v === "delete")
                  .length === 0 && (
                  <span style={{ color: "#888" }}>No changes to statuses</span>
                )}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => setStep(2)}>
                Back
              </button>
              <button className="btn btn-primary" onClick={() => setStep(3)}>
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
              {Object.values(customFieldMappings).filter(
                (v) => v.action === "new",
              ).length > 0 && (
                <span style={{ marginLeft: 8 }}>
                  ·{" "}
                  <strong>
                    {
                      Object.values(customFieldMappings).filter(
                        (v) => v.action === "new",
                      ).length
                    }{" "}
                    new custom fields
                  </strong>{" "}
                  will be created
                </span>
              )}
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
                onClick={() => setStep(25)}
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
                  · {result.skipped} skipped
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
                  setCustomFieldMappings({});
                  setStatusReview({ newStatuses: [], emptyStatuses: [] });
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
