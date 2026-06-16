import { useState, useRef, useEffect } from "react";
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
  "🏢",
  "📊",
  "💼",
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
];

const TEMPLATES = [
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

  const [expandedSpaces, setExpandedSpaces] = useState({});
  const [showAddFolder, setShowAddFolder] = useState(null);
  const [newFolder, setNewFolder] = useState("");

  function toggleSpace(spaceId) {
    setExpandedSpaces((prev) => ({ ...prev, [spaceId]: !prev[spaceId] }));
  }

  async function createSpace(template = "business") {
    if (!newSpace.name.trim()) return;
    const { data, error } = await supabase
      .from("spaces")
      .insert({ name: newSpace.name.trim(), color: newSpace.color })
      .select()
      .single();

    if (!error && data) {
      const tmpl = TEMPLATES.find((t) => t.key === template) || TEMPLATES[0];
      if (tmpl.statuses.length > 0) {
        await supabase.from("space_statuses").insert(
          tmpl.statuses.map((s, i) => ({
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
      setShowAddSpace(false);
      onSpaceCreated();
    }
  }

  async function deleteSpace(spaceId, e) {
    e.stopPropagation();
    if (
      !confirm(
        "Delete this space and all its folders and tasks? This cannot be undone.",
      )
    )
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
      // Seed default statuses at folder level
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
    const taskCount = count || 0;
    const message =
      taskCount > 0
        ? `Delete this folder and all ${taskCount} tasks inside it? This cannot be undone.`
        : "Delete this folder?";
    if (!confirm(message)) return;
    await supabase.from("folders").delete().eq("id", folderId);
    onSpaceCreated();
  }

  const selectedTmpl =
    TEMPLATES.find((t) => t.key === selectedTemplate) || TEMPLATES[0];

  return (
    <aside
      className="sidebar"
      style={{ width, minWidth: width, maxWidth: width }}
    >
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">AB Capital</div>
        <div className="sidebar-sub">Internal workspace</div>
      </div>

      {/* Main nav */}
      <div style={{ padding: "8px 0" }}>
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
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
          {spaces.map((space) => {
            const isExpanded = expandedSpaces[space.id] !== false;
            const isActive = activeSpace?.id === space.id && !activeFolder;

            return (
              <div key={space.id}>
                {/* Space row */}
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
                        padding: "0px 6px",
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

                {/* Folders */}
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
                                padding: "0px 6px",
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

                    {/* Add folder */}
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

          {/* Add space */}
          <button
            className="add-btn-sidebar"
            onClick={() => setShowAddSpace(true)}
            style={{ width: "100%", marginTop: 4 }}
          >
            + Add space
          </button>
        </div>
      </div>

      {/* User profile */}
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

      {/* SPACE CREATION MODAL */}
      {showAddSpace && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
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
              maxWidth: 580,
              maxHeight: "92vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            {/* ── STEP 1 — Name & Icon ── */}
            {spaceStep === 1 && (
              <>
                <div style={{ padding: "28px 32px 0" }}>
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
                          marginBottom: 6,
                        }}
                      >
                        Create a Space
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "#888",
                          lineHeight: 1.6,
                          maxWidth: 420,
                        }}
                      >
                        A Space represents teams, departments, or groups, each
                        with its own folders, workflows, and settings.
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
                        fontSize: 16,
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
                  {/* Icon + Name row */}
                  <div style={{ marginBottom: 24 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#555",
                        marginBottom: 10,
                        letterSpacing: ".02em",
                      }}
                    >
                      ICON & NAME
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
                        title="Click to change icon"
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 10,
                          background: newSpace.color,
                          border: "none",
                          fontSize: 22,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                          flexShrink: 0,
                          transition: "transform 0.1s",
                        }}
                      >
                        {newSpace.icon}
                      </button>
                      <input
                        autoFocus
                        placeholder="e.g. Marketing, Engineering, HR"
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
                          transition: "border-color 0.15s",
                        }}
                        onFocus={(e) =>
                          (e.target.style.borderColor = "#1d4ed8")
                        }
                        onBlur={(e) => (e.target.style.borderColor = "#e0e0e0")}
                      />
                    </div>
                  </div>

                  {/* Color */}
                  <div style={{ marginBottom: 24 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#555",
                        marginBottom: 10,
                        letterSpacing: ".02em",
                      }}
                    >
                      COLOR
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
                                ? "3px solid #1a1a1a"
                                : "2px solid transparent",
                            cursor: "pointer",
                            boxShadow:
                              newSpace.color === color
                                ? "0 0 0 2px #fff, 0 0 0 4px " + color
                                : "none",
                            transition: "all 0.15s",
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
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#555",
                        marginBottom: 10,
                        letterSpacing: ".02em",
                      }}
                    >
                      DESCRIPTION{" "}
                      <span
                        style={{ color: "#bbb", fontWeight: 400, fontSize: 11 }}
                      >
                        optional
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
                        minHeight: 80,
                        outline: "none",
                        boxSizing: "border-box",
                        fontFamily: "inherit",
                        color: "#333",
                        lineHeight: 1.6,
                        transition: "border-color 0.15s",
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
                      transition: "all 0.15s",
                    }}
                  >
                    Continue →
                  </button>
                </div>
              </>
            )}

            {/* ── STEP 2 — Workflow ── */}
            {spaceStep === 2 && (
              <>
                <div style={{ padding: "28px 32px 0" }}>
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
                          marginBottom: 6,
                        }}
                      >
                        Define your workflow
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "#888",
                          lineHeight: 1.6,
                          maxWidth: 400,
                        }}
                      >
                        Choose a pre-configured solution or customise to your
                        liking with task statuses and views.
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
                        fontSize: 16,
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
                  {/* Template grid */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                      marginBottom: 24,
                    }}
                  >
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setSelectedTemplate(t.key)}
                        style={{
                          padding: "16px 18px",
                          borderRadius: 12,
                          textAlign: "left",
                          border:
                            selectedTemplate === t.key
                              ? "2px solid #1a1a1a"
                              : "1.5px solid #e8e8e8",
                          background:
                            selectedTemplate === t.key ? "#f5f5f4" : "#fff",
                          cursor: "pointer",
                          transition: "all 0.15s",
                          boxShadow:
                            selectedTemplate === t.key
                              ? "0 2px 8px rgba(0,0,0,0.08)"
                              : "none",
                        }}
                      >
                        <div style={{ fontSize: 18, marginBottom: 6 }}>
                          {t.icon}
                        </div>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: "#1a1a1a",
                            marginBottom: 3,
                          }}
                        >
                          {t.label}
                        </div>
                        <div style={{ fontSize: 12, color: "#888" }}>
                          {t.desc}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Customize section */}
                  <div
                    style={{ borderTop: "1px solid #f0f0f0", paddingTop: 20 }}
                  >
                    <div
                      style={{ fontSize: 13, color: "#555", marginBottom: 12 }}
                    >
                      Customise defaults for{" "}
                      <strong>{selectedTmpl.label}</strong>
                    </div>

                    {/* Default views card */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "14px 16px",
                        borderRadius: 12,
                        border: "1px solid #e8e8e8",
                        marginBottom: 10,
                        background: "#fafaf9",
                      }}
                    >
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          background: "#f0f0ef",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 18,
                          flexShrink: 0,
                        }}
                      >
                        ☰
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#1a1a1a",
                            marginBottom: 2,
                          }}
                        >
                          Default views
                        </div>
                        <div style={{ fontSize: 12, color: "#888" }}>
                          List, Board
                        </div>
                      </div>
                    </div>

                    {/* Task statuses card */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "14px 16px",
                        borderRadius: 12,
                        border: "1px solid #e8e8e8",
                        marginBottom: 10,
                        background: "#fafaf9",
                      }}
                    >
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          background: "#f0f0ef",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 18,
                          flexShrink: 0,
                        }}
                      >
                        ◎
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#1a1a1a",
                            marginBottom: 4,
                          }}
                        >
                          Task statuses
                        </div>
                        {selectedTmpl.statuses.length === 0 ? (
                          <div style={{ fontSize: 12, color: "#bbb" }}>
                            No default statuses — add your own after creating
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              flexWrap: "wrap",
                            }}
                          >
                            {selectedTmpl.statuses.map((s, i) => (
                              <div
                                key={s.name}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <span
                                  style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: "50%",
                                    background: s.color,
                                    display: "inline-block",
                                    flexShrink: 0,
                                  }}
                                />
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "#555",
                                    fontWeight: 500,
                                  }}
                                >
                                  {s.name}
                                </span>
                                {i < selectedTmpl.statuses.length - 1 && (
                                  <span
                                    style={{
                                      color: "#ccc",
                                      fontSize: 11,
                                      marginLeft: 2,
                                    }}
                                  >
                                    →
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Custom fields card */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "14px 16px",
                        borderRadius: 12,
                        border: "1px solid #e8e8e8",
                        background: "#fafaf9",
                      }}
                    >
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          background: "#f0f0ef",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 18,
                          flexShrink: 0,
                        }}
                      >
                        ⊞
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#1a1a1a",
                            marginBottom: 2,
                          }}
                        >
                          Custom fields
                        </div>
                        <div style={{ fontSize: 12, color: "#888" }}>
                          Priority, Assignees, Due Date + add your own after
                          creating
                        </div>
                      </div>
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
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: spaceStep === 1 ? "#1a1a1a" : "#ddd",
                        }}
                      />
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: spaceStep === 2 ? "#1a1a1a" : "#ddd",
                        }}
                      />
                    </div>
                    <button
                      onClick={() => createSpace(selectedTemplate)}
                      style={{
                        padding: "10px 28px",
                        borderRadius: 8,
                        border: "none",
                        background: "#1a1a1a",
                        color: "#fff",
                        fontSize: 13,
                        cursor: "pointer",
                        fontWeight: 600,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
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
