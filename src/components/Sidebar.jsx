import { useState } from "react";
import { supabase } from "../supabase";

const SPACE_COLORS = [
  "#378ADD",
  "#1D9E75",
  "#7F77DD",
  "#D85A30",
  "#E04F8A",
  "#F59E0B",
  "#16A34A",
  "#DC2626",
  "#7C3AED",
  "#0891B2",
  "#374151",
  "#9333EA",
];

const SPACE_ICONS = [
  "💼",
  "📊",
  "🚀",
  "⚡",
  "🎯",
  "📋",
  "🔥",
  "💡",
  "🌟",
  "📈",
  "🏆",
  "🗂️",
  "📌",
  "🧩",
  "🏢",
];

const BASE_TEMPLATES = [
  {
    key: "business",
    label: "Business Services",
    desc: "Client work & compliance",
    icon: "💼",
    statuses: [
      { name: "To Do", color: "#888780" },
      { name: "In Progress", color: "#7c3aed" },
      { name: "In Review", color: "#d97706" },
      { name: "Done", color: "#16a34a" },
      { name: "Client Cancelled", color: "#f59e0b" },
    ],
  },
  {
    key: "starter",
    label: "Starter",
    desc: "For everyday tasks",
    icon: "🚀",
    statuses: [
      { name: "To Do", color: "#888780" },
      { name: "In Progress", color: "#7c3aed" },
      { name: "Done", color: "#16a34a" },
    ],
  },
  {
    key: "project",
    label: "Project Management",
    desc: "Plan, manage, execute",
    icon: "📊",
    statuses: [
      { name: "Backlog", color: "#e0e0e0" },
      { name: "To Do", color: "#888780" },
      { name: "In Progress", color: "#7c3aed" },
      { name: "In Review", color: "#d97706" },
      { name: "Done", color: "#16a34a" },
    ],
  },
  {
    key: "custom",
    label: "Custom",
    desc: "Start from scratch",
    icon: "🧩",
    statuses: [],
  },
];

export default function Sidebar({
  spaces,
  activeSpace,
  activeFolder,
  view,
  onNavigate,
  onSpaceSelect,
  onFolderSelect,
  onSpaceCreated,
  profile,
  onLogout,
  taskCounts = {},
  width = 240,
}) {
  const [showAddSpace, setShowAddSpace] = useState(false);
  const [spaceStep, setSpaceStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState("business");
  const [newSpace, setNewSpace] = useState({
    name: "",
    color: "#378ADD",
    icon: "💼",
    description: "",
  });

  // Editable statuses for step 2
  const [editableStatuses, setEditableStatuses] = useState([]);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#378ADD");
  const [editingStatusIdx, setEditingStatusIdx] = useState(null);

  const [expandedSpaces, setExpandedSpaces] = useState({});
  const [showAddFolder, setShowAddFolder] = useState(null);
  const [newFolder, setNewFolder] = useState("");

  function toggleSpace(spaceId) {
    setExpandedSpaces((prev) => ({ ...prev, [spaceId]: !prev[spaceId] }));
  }

  function selectTemplate(key) {
    setSelectedTemplate(key);
    const tmpl = BASE_TEMPLATES.find((t) => t.key === key);
    setEditableStatuses(tmpl ? tmpl.statuses.map((s) => ({ ...s })) : []);
  }

  function addStatus() {
    if (!newStatusName.trim()) return;
    if (
      editableStatuses.find(
        (s) => s.name.toLowerCase() === newStatusName.trim().toLowerCase(),
      )
    )
      return;
    setEditableStatuses((prev) => [
      ...prev,
      { name: newStatusName.trim(), color: newStatusColor },
    ]);
    setNewStatusName("");
    setNewStatusColor("#378ADD");
  }

  function deleteStatus(idx) {
    setEditableStatuses((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateStatus(idx, field, val) {
    setEditableStatuses((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: val } : s)),
    );
  }

  async function createSpace() {
    if (!newSpace.name.trim()) return;
    const { data, error } = await supabase
      .from("spaces")
      .insert({ name: newSpace.name.trim(), color: newSpace.color })
      .select()
      .single();

    if (!error && data) {
      if (editableStatuses.length > 0) {
        await supabase.from("space_statuses").insert(
          editableStatuses.map((s, i) => ({
            space_id: data.id,
            folder_id: null,
            name: s.name,
            color: s.color,
            status_order: i + 1,
          })),
        );
      }
      setNewSpace({ name: "", color: "#378ADD", icon: "💼", description: "" });
      setSpaceStep(1);
      setSelectedTemplate("business");
      setEditableStatuses([]);
      setShowAddSpace(false);
      onSpaceCreated();
    }
  }

  async function deleteSpace(spaceId, e) {
    e.stopPropagation();
    if (!confirm("Delete this space and all its data? This cannot be undone."))
      return;
    await supabase.from("spaces").delete().eq("id", spaceId);
    onSpaceCreated();
  }

  async function createFolder(spaceId) {
    if (!newFolder.trim()) return;
    const { data, error } = await supabase
      .from("folders")
      .insert({ space_id: spaceId, name: newFolder.trim() })
      .select()
      .single();

    if (!error && data) {
      await supabase.from("space_statuses").insert([
        {
          space_id: spaceId,
          folder_id: data.id,
          name: "To Do",
          color: "#888780",
          status_order: 1,
        },
        {
          space_id: spaceId,
          folder_id: data.id,
          name: "In Progress",
          color: "#7c3aed",
          status_order: 2,
        },
        {
          space_id: spaceId,
          folder_id: data.id,
          name: "In Review",
          color: "#d97706",
          status_order: 3,
        },
        {
          space_id: spaceId,
          folder_id: data.id,
          name: "Done",
          color: "#16a34a",
          status_order: 4,
        },
      ]);
      setNewFolder("");
      setShowAddFolder(null);
      onSpaceCreated();
    }
  }

  async function deleteFolder(folderId, e) {
    e.stopPropagation();
    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("folder_id", folderId);
    const n = count || 0;
    if (
      !confirm(
        n > 0
          ? `Delete folder and all ${n} tasks inside? This cannot be undone.`
          : "Delete this folder?",
      )
    )
      return;
    await supabase.from("folders").delete().eq("id", folderId);
    onSpaceCreated();
  }

  const selectedTmpl =
    BASE_TEMPLATES.find((t) => t.key === selectedTemplate) || BASE_TEMPLATES[0];

  return (
    <aside
      className="sidebar"
      style={{ width, minWidth: width, maxWidth: width }}
    >
      {/* Header */}
      <div
        style={{ padding: "16px 16px 12px", borderBottom: "1px solid #e8e8e8" }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>
          AB Capital
        </div>
        <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
          Internal workspace
        </div>
      </div>

      {/* Nav */}
      <div style={{ padding: "8px 0 4px" }}>
        <div className="sidebar-section">Main</div>
        {[
          { key: "dashboard", icon: "📊", label: "Dashboard" },
          { key: "wiki", icon: "📗", label: "Wiki" },
          { key: "mytasks", icon: "👤", label: "My Tasks" },
        ].map((item) => (
          <div
            key={item.key}
            className={`nav-item ${view === item.key ? "active" : ""}`}
            onClick={() => onNavigate(item.key)}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Spaces */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="sidebar-section">Spaces</div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            paddingBottom: 8,
            scrollbarWidth: "thin",
            scrollbarColor: "#e0e0e0 transparent",
          }}
        >
          {spaces.map((space) => {
            const isExpanded = expandedSpaces[space.id] !== false;
            const isActive = activeSpace?.id === space.id && !activeFolder;
            return (
              <div key={space.id}>
                <div
                  className={`space-item ${isActive ? "active" : ""}`}
                  onClick={() => {
                    onSpaceSelect(space);
                    toggleSpace(space.id);
                  }}
                  style={{ position: "relative" }}
                >
                  <span style={{ fontSize: 10, color: "#aaa", marginRight: 2 }}>
                    {isExpanded ? "▾" : "▸"}
                  </span>
                  <span
                    className="space-dot"
                    style={{ background: space.color || "#378ADD" }}
                  />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                    {space.name}
                  </span>
                  {taskCounts[space.id] > 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "#aaa",
                        background: "#f0f0ef",
                        borderRadius: 20,
                        padding: "0 6px",
                        flexShrink: 0,
                      }}
                    >
                      {taskCounts[space.id]}
                    </span>
                  )}
                  <span
                    className="space-delete-btn"
                    onClick={(e) => deleteSpace(space.id, e)}
                    style={{
                      opacity: 0,
                      fontSize: 12,
                      color: "#aaa",
                      padding: "0 4px",
                      borderRadius: 4,
                      marginLeft: 2,
                    }}
                  >
                    ✕
                  </span>
                </div>
                {isExpanded && (
                  <div>
                    {(space.folders || []).map((folder) => {
                      const isFolderActive = activeFolder?.id === folder.id;
                      return (
                        <div
                          key={folder.id}
                          className={`folder-item ${isFolderActive ? "active" : ""}`}
                          onClick={() => onFolderSelect(space, folder)}
                          style={{ position: "relative" }}
                        >
                          <span style={{ fontSize: 12 }}>📁</span>
                          <span style={{ flex: 1, fontSize: 12 }}>
                            {folder.name}
                          </span>
                          {taskCounts[folder.id] > 0 && (
                            <span
                              style={{
                                fontSize: 11,
                                color: "#aaa",
                                background: "#f0f0ef",
                                borderRadius: 20,
                                padding: "0 6px",
                                flexShrink: 0,
                              }}
                            >
                              {taskCounts[folder.id]}
                            </span>
                          )}
                          <span
                            className="space-delete-btn"
                            onClick={(e) => deleteFolder(folder.id, e)}
                            style={{
                              opacity: 0,
                              fontSize: 12,
                              color: "#aaa",
                              padding: "0 4px",
                              borderRadius: 4,
                            }}
                          >
                            ✕
                          </span>
                        </div>
                      );
                    })}
                    {showAddFolder === space.id ? (
                      <div
                        style={{
                          padding: "4px 10px 4px 28px",
                          display: "flex",
                          gap: 4,
                        }}
                      >
                        <input
                          autoFocus
                          placeholder="Folder name"
                          value={newFolder}
                          onChange={(e) => setNewFolder(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") createFolder(space.id);
                            if (e.key === "Escape") {
                              setShowAddFolder(null);
                              setNewFolder("");
                            }
                          }}
                          style={{ flex: 1, fontSize: 12, padding: "4px 8px" }}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: 11, padding: "3px 8px" }}
                          onClick={() => createFolder(space.id)}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <div
                        className="add-btn-sidebar"
                        style={{ paddingLeft: 28 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAddFolder(space.id);
                          setNewFolder("");
                        }}
                      >
                        + Add folder
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <button
            className="add-btn-sidebar"
            onClick={() => {
              setSpaceStep(1);
              setSelectedTemplate("business");
              setEditableStatuses(
                BASE_TEMPLATES[0].statuses.map((s) => ({ ...s })),
              );
              setShowAddSpace(true);
            }}
            style={{ width: "100%", marginTop: 4 }}
          >
            + Add space
          </button>
        </div>
      </div>

      {/* Profile */}
      <div
        style={{
          padding: "12px 14px",
          borderTop: "1px solid #e8e8e8",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: profile?.avatar_color || "#1d4ed8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {(profile?.full_name || "U").charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "#1a1a1a",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {profile?.full_name || "User"}
          </div>
          <div style={{ fontSize: 11, color: "#aaa" }}>
            {profile?.role || "member"}
          </div>
        </div>
        <button
          onClick={onLogout}
          title="Logout"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#aaa",
            fontSize: 16,
            padding: 4,
            borderRadius: 4,
            flexShrink: 0,
          }}
        >
          ↩
        </button>
      </div>

      {/* ── SPACE CREATION MODAL ── */}
      {showAddSpace && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              width: "100%",
              maxWidth: 600,
              maxHeight: "92vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
            }}
          >
            {/* ── STEP 1 ── */}
            {spaceStep === 1 && (
              <>
                <div
                  style={{
                    padding: "28px 32px 20px",
                    borderBottom: "1px solid #f0f0f0",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          color: "#1a1a1a",
                          marginBottom: 4,
                        }}
                      >
                        Create a Space
                      </div>
                      <div
                        style={{ fontSize: 13, color: "#999", lineHeight: 1.6 }}
                      >
                        A Space represents a team, department, or group with its
                        own folders and workflows.
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowAddSpace(false);
                        setSpaceStep(1);
                      }}
                      style={{
                        background: "#f5f5f4",
                        border: "none",
                        borderRadius: "50%",
                        width: 32,
                        height: 32,
                        cursor: "pointer",
                        fontSize: 18,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#666",
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div
                  style={{ padding: "24px 32px", flex: 1, overflowY: "auto" }}
                >
                  {/* Icon + Name */}
                  <div style={{ marginBottom: 22 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#888",
                        marginBottom: 8,
                        textTransform: "uppercase",
                        letterSpacing: ".06em",
                      }}
                    >
                      Icon & name
                    </label>
                    <div
                      style={{ display: "flex", gap: 10, alignItems: "center" }}
                    >
                      <button
                        onClick={() => {
                          const current = SPACE_ICONS.indexOf(newSpace.icon);
                          setNewSpace((prev) => ({
                            ...prev,
                            icon: SPACE_ICONS[
                              (current + 1) % SPACE_ICONS.length
                            ],
                          }));
                        }}
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: 12,
                          background: newSpace.color,
                          border: "none",
                          fontSize: 24,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
                          flexShrink: 0,
                        }}
                        title="Click to change icon"
                      >
                        {newSpace.icon}
                      </button>
                      <input
                        autoFocus
                        placeholder="e.g. Accounting, Visa Team, Growth"
                        value={newSpace.name}
                        onChange={(e) =>
                          setNewSpace((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        onKeyDown={(e) =>
                          e.key === "Enter" &&
                          newSpace.name.trim() &&
                          setSpaceStep(2)
                        }
                        style={{
                          flex: 1,
                          fontSize: 15,
                          padding: "12px 16px",
                          border: "1.5px solid #e0e0e0",
                          borderRadius: 10,
                          outline: "none",
                          fontWeight: 500,
                          color: "#1a1a1a",
                        }}
                        onFocus={(e) =>
                          (e.target.style.borderColor = "#1d4ed8")
                        }
                        onBlur={(e) => (e.target.style.borderColor = "#e0e0e0")}
                      />
                    </div>
                  </div>

                  {/* Color */}
                  <div style={{ marginBottom: 22 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#888",
                        marginBottom: 8,
                        textTransform: "uppercase",
                        letterSpacing: ".06em",
                      }}
                    >
                      Color
                    </label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {SPACE_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() =>
                            setNewSpace((prev) => ({ ...prev, color }))
                          }
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: "50%",
                            background: color,
                            border:
                              newSpace.color === color
                                ? "2.5px solid #1a1a1a"
                                : "2px solid transparent",
                            cursor: "pointer",
                            boxShadow:
                              newSpace.color === color
                                ? `0 0 0 3px #fff, 0 0 0 5px ${color}66`
                                : "none",
                            transition: "all 0.12s",
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#888",
                        marginBottom: 8,
                        textTransform: "uppercase",
                        letterSpacing: ".06em",
                      }}
                    >
                      Description{" "}
                      <span
                        style={{
                          color: "#ccc",
                          fontWeight: 400,
                          textTransform: "none",
                        }}
                      >
                        (optional)
                      </span>
                    </label>
                    <textarea
                      placeholder="What is this space for?"
                      value={newSpace.description}
                      onChange={(e) =>
                        setNewSpace((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        fontSize: 13,
                        padding: "12px 14px",
                        border: "1.5px solid #e0e0e0",
                        borderRadius: 10,
                        resize: "none",
                        minHeight: 72,
                        outline: "none",
                        boxSizing: "border-box",
                        fontFamily: "inherit",
                        color: "#333",
                        lineHeight: 1.6,
                      }}
                      onFocus={(e) => (e.target.style.borderColor = "#1d4ed8")}
                      onBlur={(e) => (e.target.style.borderColor = "#e0e0e0")}
                    />
                  </div>
                </div>

                <div
                  style={{
                    padding: "16px 32px",
                    borderTop: "1px solid #f0f0f0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#fafaf9",
                  }}
                >
                  <button
                    onClick={() => {
                      setShowAddSpace(false);
                      setSpaceStep(1);
                    }}
                    style={{
                      padding: "10px 20px",
                      borderRadius: 8,
                      border: "1px solid #e0e0e0",
                      background: "#fff",
                      fontSize: 13,
                      cursor: "pointer",
                      fontWeight: 500,
                      color: "#555",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setSpaceStep(2)}
                    disabled={!newSpace.name.trim()}
                    style={{
                      padding: "10px 28px",
                      borderRadius: 8,
                      border: "none",
                      background: newSpace.name.trim() ? "#1a1a1a" : "#e0e0e0",
                      color: newSpace.name.trim() ? "#fff" : "#aaa",
                      fontSize: 13,
                      cursor: newSpace.name.trim() ? "pointer" : "not-allowed",
                      fontWeight: 600,
                    }}
                  >
                    Continue →
                  </button>
                </div>
              </>
            )}

            {/* ── STEP 2 ── */}
            {spaceStep === 2 && (
              <>
                <div
                  style={{
                    padding: "28px 32px 20px",
                    borderBottom: "1px solid #f0f0f0",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          color: "#1a1a1a",
                          marginBottom: 4,
                        }}
                      >
                        Define your workflow
                      </div>
                      <div
                        style={{ fontSize: 13, color: "#999", lineHeight: 1.6 }}
                      >
                        Start with a template, then customise statuses exactly
                        as you need.
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowAddSpace(false);
                        setSpaceStep(1);
                      }}
                      style={{
                        background: "#f5f5f4",
                        border: "none",
                        borderRadius: "50%",
                        width: 32,
                        height: 32,
                        cursor: "pointer",
                        fontSize: 18,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#666",
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div
                  style={{ flex: 1, overflowY: "auto", padding: "20px 32px" }}
                >
                  {/* Template grid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                      marginBottom: 24,
                    }}
                  >
                    {BASE_TEMPLATES.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => selectTemplate(t.key)}
                        style={{
                          padding: "14px 16px",
                          borderRadius: 12,
                          textAlign: "left",
                          border:
                            selectedTemplate === t.key
                              ? "2px solid #1a1a1a"
                              : "1.5px solid #e8e8e8",
                          background:
                            selectedTemplate === t.key ? "#f5f5f4" : "#fff",
                          cursor: "pointer",
                          transition: "all 0.12s",
                          boxShadow:
                            selectedTemplate === t.key
                              ? "0 2px 8px rgba(0,0,0,0.08)"
                              : "none",
                        }}
                      >
                        <div style={{ fontSize: 16, marginBottom: 4 }}>
                          {t.icon}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#1a1a1a",
                            marginBottom: 2,
                          }}
                        >
                          {t.label}
                        </div>
                        <div style={{ fontSize: 11, color: "#888" }}>
                          {t.desc}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Editable statuses section */}
                  <div
                    style={{ borderTop: "1px solid #f0f0f0", paddingTop: 20 }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#1a1a1a",
                          }}
                        >
                          Task statuses
                        </div>
                        <div
                          style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}
                        >
                          Customise for <strong>{selectedTmpl.label}</strong> —
                          drag to reorder coming soon
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          borderRadius: 20,
                          padding: "2px 10px",
                          fontWeight: 500,
                        }}
                      >
                        {editableStatuses.length} statuses
                      </span>
                    </div>

                    {/* Status list */}
                    {editableStatuses.length === 0 ? (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#ccc",
                          padding: "16px 0",
                          textAlign: "center",
                        }}
                      >
                        No statuses yet — add one below
                      </div>
                    ) : (
                      <div style={{ marginBottom: 12 }}>
                        {editableStatuses.map((s, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "8px 10px",
                              borderRadius: 8,
                              background: "#fafaf9",
                              border: "1px solid #e8e8e8",
                              marginBottom: 6,
                            }}
                          >
                            <input
                              type="color"
                              value={s.color}
                              onChange={(e) =>
                                updateStatus(idx, "color", e.target.value)
                              }
                              style={{
                                width: 28,
                                height: 28,
                                padding: 2,
                                cursor: "pointer",
                                border: "none",
                                borderRadius: 6,
                                flexShrink: 0,
                              }}
                            />
                            {editingStatusIdx === idx ? (
                              <input
                                autoFocus
                                value={s.name}
                                onChange={(e) =>
                                  updateStatus(idx, "name", e.target.value)
                                }
                                onBlur={() => setEditingStatusIdx(null)}
                                onKeyDown={(e) =>
                                  e.key === "Enter" && setEditingStatusIdx(null)
                                }
                                style={{
                                  flex: 1,
                                  fontSize: 13,
                                  padding: "3px 8px",
                                  border: "1.5px solid #1d4ed8",
                                  borderRadius: 6,
                                  outline: "none",
                                }}
                              />
                            ) : (
                              <span
                                style={{
                                  flex: 1,
                                  fontSize: 13,
                                  fontWeight: 500,
                                  background: s.color,
                                  color: "#fff",
                                  borderRadius: 20,
                                  padding: "2px 12px",
                                  display: "inline-block",
                                  maxWidth: "fit-content",
                                }}
                              >
                                {s.name}
                              </span>
                            )}
                            <button
                              onClick={() =>
                                setEditingStatusIdx(
                                  idx === editingStatusIdx ? null : idx,
                                )
                              }
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                fontSize: 13,
                                color: "#aaa",
                                padding: "2px 6px",
                              }}
                              title="Rename"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => deleteStatus(idx)}
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                fontSize: 13,
                                color: "#f87171",
                                padding: "2px 6px",
                              }}
                              title="Delete"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add status input */}
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1.5px dashed #e0e0e0",
                        background: "#fafaf9",
                      }}
                    >
                      <input
                        type="color"
                        value={newStatusColor}
                        onChange={(e) => setNewStatusColor(e.target.value)}
                        style={{
                          width: 28,
                          height: 28,
                          padding: 2,
                          cursor: "pointer",
                          border: "none",
                          borderRadius: 6,
                          flexShrink: 0,
                        }}
                      />
                      <input
                        placeholder="Add a status..."
                        value={newStatusName}
                        onChange={(e) => setNewStatusName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addStatus()}
                        style={{
                          flex: 1,
                          fontSize: 13,
                          padding: "6px 10px",
                          border: "1px solid #e0e0e0",
                          borderRadius: 7,
                          outline: "none",
                        }}
                      />
                      <button
                        onClick={addStatus}
                        disabled={!newStatusName.trim()}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 7,
                          border: "none",
                          background: newStatusName.trim()
                            ? "#1d4ed8"
                            : "#e0e0e0",
                          color: "#fff",
                          fontSize: 12,
                          cursor: newStatusName.trim()
                            ? "pointer"
                            : "not-allowed",
                          fontWeight: 500,
                        }}
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: "16px 32px",
                    borderTop: "1px solid #f0f0f0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#fafaf9",
                  }}
                >
                  <button
                    onClick={() => setSpaceStep(1)}
                    style={{
                      padding: "10px 20px",
                      borderRadius: 8,
                      border: "1px solid #e0e0e0",
                      background: "#fff",
                      fontSize: 13,
                      cursor: "pointer",
                      fontWeight: 500,
                      color: "#555",
                    }}
                  >
                    ← Back
                  </button>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <div style={{ display: "flex", gap: 5 }}>
                      {[1, 2].map((n) => (
                        <div
                          key={n}
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: spaceStep === n ? "#1a1a1a" : "#ddd",
                          }}
                        />
                      ))}
                    </div>
                    <button
                      onClick={createSpace}
                      style={{
                        padding: "10px 28px",
                        borderRadius: 8,
                        border: "none",
                        background: "#1a1a1a",
                        color: "#fff",
                        fontSize: 13,
                        cursor: "pointer",
                        fontWeight: 600,
                        boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
                      }}
                    >
                      Create Space ✓
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
