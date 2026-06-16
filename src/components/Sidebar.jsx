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
  "🎨",
  "🔧",
  "💻",
  "📝",
  "🌍",
  "🎪",
  "🏗️",
  "📦",
  "🔑",
  "💎",
  "🎓",
  "🏦",
  "⚙️",
  "🛡️",
  "🌿",
];

const STATUS_COLORS = [
  "#888780",
  "#7c3aed",
  "#d97706",
  "#16a34a",
  "#f59e0b",
  "#e11d48",
  "#0891b2",
  "#dc2626",
  "#9333ea",
  "#059669",
  "#1d4ed8",
  "#ea580c",
  "#475569",
  "#be185d",
  "#15803d",
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
  const [showIconPicker, setShowIconPicker] = useState(false);

  // Editable statuses for step 2
  const [editableStatuses, setEditableStatuses] = useState([]);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#378ADD");
  const [editingStatusIdx, setEditingStatusIdx] = useState(null);
  const [editingStatusName, setEditingStatusName] = useState("");
  const [showColorPickerFor, setShowColorPickerFor] = useState(null);

  const [expandedSpaces, setExpandedSpaces] = useState({});
  const [showAddFolder, setShowAddFolder] = useState(null);
  const [newFolder, setNewFolder] = useState("");

  function closeModal() {
    setShowAddSpace(false);
    setSpaceStep(1);
    setShowIconPicker(false);
    setEditingStatusIdx(null);
    setShowColorPickerFor(null);
    setNewStatusName("");
  }

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

  function startEditStatus(idx) {
    setEditingStatusIdx(idx);
    setEditingStatusName(editableStatuses[idx].name);
  }

  function saveEditStatus(idx) {
    if (editingStatusName.trim()) {
      setEditableStatuses((prev) =>
        prev.map((s, i) =>
          i === idx ? { ...s, name: editingStatusName.trim() } : s,
        ),
      );
    }
    setEditingStatusIdx(null);
  }

  function updateStatusColor(idx, color) {
    setEditableStatuses((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, color } : s)),
    );
    setShowColorPickerFor(null);
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
        style={{ padding: "16px 16px 12px", borderBottom: "1px solid #ebebeb" }}
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
            scrollbarColor: "#e0e0de transparent",
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
                    {(space.folders || []).map((folder) => (
                      <div
                        key={folder.id}
                        className={`folder-item ${activeFolder?.id === folder.id ? "active" : ""}`}
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
                    ))}
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
              setNewSpace({
                name: "",
                color: "#378ADD",
                icon: "💼",
                description: "",
              });
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
          borderTop: "1px solid #ebebeb",
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

      {/* ══════════════════════════════
          SPACE CREATION MODAL
          ══════════════════════════════ */}
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
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              width: "100%",
              maxWidth: spaceStep === 2 ? 680 : 560,
              maxHeight: "92vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
              transition: "max-width 0.25s ease",
            }}
          >
            {/* ── STEP 1 ── */}
            {spaceStep === 1 && (
              <>
                <div
                  style={{
                    padding: "26px 28px 18px",
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
                          fontSize: 19,
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
                      onClick={closeModal}
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
                  style={{ padding: "22px 28px", flex: 1, overflowY: "auto" }}
                >
                  {/* Icon + Name */}
                  <div style={{ marginBottom: 20 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#999",
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
                      {/* Icon button */}
                      <div style={{ position: "relative" }}>
                        <button
                          onClick={() => setShowIconPicker((v) => !v)}
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
                            position: "relative",
                          }}
                          title="Click to change icon"
                        >
                          {newSpace.icon}
                          <span
                            style={{
                              position: "absolute",
                              bottom: -4,
                              right: -4,
                              background: "#fff",
                              borderRadius: "50%",
                              width: 16,
                              height: 16,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 9,
                              border: "1px solid #e0e0e0",
                              color: "#555",
                            }}
                          >
                            ✎
                          </span>
                        </button>

                        {/* Icon picker dropdown */}
                        {showIconPicker && (
                          <div
                            style={{
                              position: "absolute",
                              top: "110%",
                              left: 0,
                              zIndex: 100,
                              background: "#fff",
                              borderRadius: 12,
                              padding: 14,
                              boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
                              border: "1px solid #e8e8e8",
                              width: 220,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#999",
                                marginBottom: 10,
                                textTransform: "uppercase",
                                letterSpacing: ".06em",
                              }}
                            >
                              Choose icon
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(6,1fr)",
                                gap: 4,
                              }}
                            >
                              {SPACE_ICONS.map((icon) => (
                                <button
                                  key={icon}
                                  onClick={() => {
                                    setNewSpace((prev) => ({ ...prev, icon }));
                                    setShowIconPicker(false);
                                  }}
                                  style={{
                                    width: 32,
                                    height: 32,
                                    fontSize: 18,
                                    cursor: "pointer",
                                    border: "none",
                                    borderRadius: 7,
                                    background:
                                      newSpace.icon === icon
                                        ? newSpace.color + "22"
                                        : "transparent",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    transition: "background 0.1s",
                                  }}
                                  onMouseEnter={(e) => {
                                    if (newSpace.icon !== icon)
                                      e.target.style.background = "#f5f5f4";
                                  }}
                                  onMouseLeave={(e) => {
                                    if (newSpace.icon !== icon)
                                      e.target.style.background = "transparent";
                                  }}
                                >
                                  {icon}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

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
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setShowIconPicker(false);
                          if (e.key === "Enter" && newSpace.name.trim())
                            setSpaceStep(2);
                        }}
                        onClick={() => setShowIconPicker(false)}
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
                        onFocus={(e) => {
                          e.target.style.borderColor = "#1d4ed8";
                          setShowIconPicker(false);
                        }}
                        onBlur={(e) => (e.target.style.borderColor = "#e0e0e0")}
                      />
                    </div>
                  </div>

                  {/* Color */}
                  <div style={{ marginBottom: 20 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#999",
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
                        color: "#999",
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
                      onClick={() => setShowIconPicker(false)}
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
                      onFocus={(e) => {
                        e.target.style.borderColor = "#1d4ed8";
                        setShowIconPicker(false);
                      }}
                      onBlur={(e) => (e.target.style.borderColor = "#e0e0e0")}
                    />
                  </div>
                </div>

                <div
                  style={{
                    padding: "16px 28px",
                    borderTop: "1px solid #f0f0f0",
                    display: "flex",
                    justifyContent: "space-between",
                    background: "#fafaf9",
                    borderRadius: "0 0 16px 16px",
                  }}
                >
                  <button
                    onClick={closeModal}
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

            {/* ── STEP 2 — two-panel layout like ClickUp ── */}
            {spaceStep === 2 && (
              <>
                {/* Header */}
                <div
                  style={{
                    padding: "22px 28px 18px",
                    borderBottom: "1px solid #f0f0f0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <button
                      onClick={() => setSpaceStep(1)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#888",
                        fontSize: 18,
                        padding: 4,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      ←
                    </button>
                    <div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: "#1a1a1a",
                        }}
                      >
                        Define your workflow
                      </div>
                      <div
                        style={{ fontSize: 12, color: "#999", marginTop: 2 }}
                      >
                        Choose a template, then customise statuses as needed
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={closeModal}
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

                {/* Two-panel body */}
                <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                  {/* LEFT — Template picker */}
                  <div
                    style={{
                      width: 220,
                      flexShrink: 0,
                      borderRight: "1px solid #f0f0f0",
                      padding: "16px 12px",
                      overflowY: "auto",
                      background: "#fafaf9",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#999",
                        textTransform: "uppercase",
                        letterSpacing: ".06em",
                        marginBottom: 10,
                        paddingLeft: 8,
                      }}
                    >
                      Status template
                    </div>
                    {BASE_TEMPLATES.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => selectTemplate(t.key)}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 8,
                          textAlign: "left",
                          border: "none",
                          marginBottom: 4,
                          background:
                            selectedTemplate === t.key ? "#fff" : "transparent",
                          boxShadow:
                            selectedTemplate === t.key
                              ? "0 1px 4px rgba(0,0,0,0.08)"
                              : "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          transition: "all 0.12s",
                        }}
                      >
                        <span style={{ fontSize: 16 }}>{t.icon}</span>
                        <div>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight:
                                selectedTemplate === t.key ? 600 : 400,
                              color:
                                selectedTemplate === t.key ? "#1a1a1a" : "#555",
                            }}
                          >
                            {t.label}
                          </div>
                          <div style={{ fontSize: 11, color: "#aaa" }}>
                            {t.desc}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* RIGHT — Status editor */}
                  <div
                    style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 16,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "#1a1a1a",
                        }}
                      >
                        Edit statuses
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 400,
                            color: "#aaa",
                            marginLeft: 8,
                          }}
                        >
                          for {selectedTmpl.label}
                        </span>
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
                    {editableStatuses.length === 0 && (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "24px 0",
                          color: "#ccc",
                          fontSize: 13,
                        }}
                      >
                        No statuses yet — add one below
                      </div>
                    )}

                    {editableStatuses.map((s, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "10px 12px",
                          borderRadius: 8,
                          marginBottom: 6,
                          background: "#fafaf9",
                          border: "1px solid #ebebeb",
                          position: "relative",
                        }}
                      >
                        {/* Drag handle */}
                        <span
                          style={{
                            color: "#ccc",
                            fontSize: 14,
                            cursor: "grab",
                            flexShrink: 0,
                          }}
                        >
                          ⠿
                        </span>

                        {/* Color dot — click to change */}
                        <div style={{ position: "relative", flexShrink: 0 }}>
                          <button
                            onClick={() =>
                              setShowColorPickerFor(
                                showColorPickerFor === idx ? null : idx,
                              )
                            }
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              background: s.color,
                              border: "2px solid #fff",
                              cursor: "pointer",
                              boxShadow: "0 0 0 1px #ddd",
                              outline: "none",
                            }}
                          />
                          {showColorPickerFor === idx && (
                            <div
                              style={{
                                position: "absolute",
                                top: "110%",
                                left: 0,
                                zIndex: 200,
                                background: "#fff",
                                borderRadius: 10,
                                padding: 10,
                                boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
                                border: "1px solid #e8e8e8",
                                display: "grid",
                                gridTemplateColumns: "repeat(5,1fr)",
                                gap: 5,
                                width: 160,
                              }}
                            >
                              {STATUS_COLORS.map((c) => (
                                <button
                                  key={c}
                                  onClick={() => updateStatusColor(idx, c)}
                                  style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: "50%",
                                    background: c,
                                    border:
                                      s.color === c
                                        ? "2.5px solid #1a1a1a"
                                        : "none",
                                    cursor: "pointer",
                                    transition: "transform 0.1s",
                                  }}
                                  onMouseEnter={(e) =>
                                    (e.target.style.transform = "scale(1.2)")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.target.style.transform = "scale(1)")
                                  }
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Name — click to edit inline */}
                        {editingStatusIdx === idx ? (
                          <input
                            autoFocus
                            value={editingStatusName}
                            onChange={(e) =>
                              setEditingStatusName(e.target.value)
                            }
                            onBlur={() => saveEditStatus(idx)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEditStatus(idx);
                              if (e.key === "Escape") setEditingStatusIdx(null);
                            }}
                            style={{
                              flex: 1,
                              fontSize: 13,
                              fontWeight: 500,
                              padding: "3px 8px",
                              border: "1.5px solid #1d4ed8",
                              borderRadius: 6,
                              outline: "none",
                            }}
                          />
                        ) : (
                          <span
                            onClick={() => startEditStatus(idx)}
                            style={{
                              flex: 1,
                              fontSize: 13,
                              fontWeight: 500,
                              color: "#fff",
                              background: s.color,
                              borderRadius: 20,
                              padding: "3px 12px",
                              display: "inline-block",
                              cursor: "text",
                              maxWidth: "fit-content",
                            }}
                          >
                            {s.name}
                          </span>
                        )}

                        {/* Delete */}
                        <button
                          onClick={() => deleteStatus(idx)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#ccc",
                            fontSize: 16,
                            padding: "2px 4px",
                            borderRadius: 4,
                            lineHeight: 1,
                            flexShrink: 0,
                          }}
                          onMouseEnter={(e) =>
                            (e.target.style.color = "#ef4444")
                          }
                          onMouseLeave={(e) => (e.target.style.color = "#ccc")}
                        >
                          ×
                        </button>
                      </div>
                    ))}

                    {/* Add status row */}
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1.5px dashed #ddd",
                        background: "#fafaf9",
                        marginTop: 8,
                      }}
                    >
                      <input
                        type="color"
                        value={newStatusColor}
                        onChange={(e) => setNewStatusColor(e.target.value)}
                        style={{
                          width: 26,
                          height: 26,
                          padding: 2,
                          cursor: "pointer",
                          border: "none",
                          borderRadius: "50%",
                          flexShrink: 0,
                        }}
                      />
                      <input
                        placeholder="+ Add a status name..."
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
                          fontWeight: 600,
                          cursor: newStatusName.trim()
                            ? "pointer"
                            : "not-allowed",
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div
                  style={{
                    padding: "14px 28px",
                    borderTop: "1px solid #f0f0f0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#fafaf9",
                    borderRadius: "0 0 16px 16px",
                  }}
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
                          transition: "background 0.2s",
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
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    Create Space ✓
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
