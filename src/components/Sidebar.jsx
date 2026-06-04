import { useState } from "react";
import { supabase } from "../supabase";

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
}) {
  const [expandedSpaces, setExpandedSpaces] = useState({});
  const [showAddSpace, setShowAddSpace] = useState(false);
  const [showAddFolder, setShowAddFolder] = useState(null);
  const [newSpace, setNewSpace] = useState({ name: "", color: "#378ADD" });
  const [newFolder, setNewFolder] = useState("");

  function toggleSpace(spaceId) {
    setExpandedSpaces((prev) => ({ ...prev, [spaceId]: !prev[spaceId] }));
  }

  async function createSpace() {
    if (!newSpace.name.trim()) return;
    const { data, error } = await supabase
      .from("spaces")
      .insert({ name: newSpace.name.trim(), color: newSpace.color })
      .select()
      .single();

    if (!error && data) {
      // Seed default statuses immediately
      await supabase.from("space_statuses").insert([
        { space_id: data.id, name: "To Do", color: "#888780", status_order: 1 },
        {
          space_id: data.id,
          name: "In Progress",
          color: "#d97706",
          status_order: 2,
        },
        {
          space_id: data.id,
          name: "In Review",
          color: "#7c3aed",
          status_order: 3,
        },
        { space_id: data.id, name: "Done", color: "#16a34a", status_order: 4 },
      ]);
      setNewSpace({ name: "", color: "#378ADD" });
      setShowAddSpace(false);
      onSpaceCreated();
    }
  }

  async function createFolder(spaceId) {
    if (!newFolder.trim()) return;
    const { error } = await supabase
      .from("folders")
      .insert({ space_id: spaceId, name: newFolder.trim() });
    if (!error) {
      setNewFolder("");
      setShowAddFolder(null);
      onSpaceCreated();
    }
  }

  async function deleteSpace(spaceId, e) {
    e.stopPropagation();
    if (
      !confirm(
        "Delete this space and all its tasks, folders and wiki articles?",
      )
    )
      return;
    await supabase.from("spaces").delete().eq("id", spaceId);
    onSpaceCreated();
  }

  async function deleteFolder(folderId, e) {
    e.stopPropagation();
    if (!confirm("Delete this folder and all its tasks?")) return;
    await supabase.from("folders").delete().eq("id", folderId);
    onSpaceCreated();
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">AB Capital</div>
        <div className="sidebar-sub">Internal workspace</div>
      </div>

      <div className="sidebar-section">Main</div>

      <div
        className={`nav-item ${view === "dashboard" ? "active" : ""}`}
        onClick={() => onNavigate("dashboard")}
      >
        <span>📊</span> Dashboard
      </div>

      <div
        className={`nav-item ${view === "wiki" ? "active" : ""}`}
        onClick={() => onNavigate("wiki")}
      >
        <span>📚</span> Wiki
      </div>

      <div
        className={`nav-item ${view === "mytasks" ? "active" : ""}`}
        onClick={() => onNavigate("mytasks")}
      >
        <span>👤</span> My Tasks
      </div>

      <div className="sidebar-section" style={{ marginTop: 8 }}>
        Spaces
      </div>

      {spaces.map((space) => (
        <div key={space.id}>
          {/* Space row */}
          <div
            className={`space-item ${activeSpace?.id === space.id && !activeFolder ? "active" : ""}`}
            onClick={() => {
              toggleSpace(space.id);
              onSpaceSelect(space);
            }}
          >
            <span style={{ fontSize: 10, color: "#aaa", width: 12 }}>
              {expandedSpaces[space.id] ? "▾" : "▸"}
            </span>
            <span className="space-dot" style={{ background: space.color }} />
            <span style={{ flex: 1, fontSize: 13 }}>{space.name}</span>
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
              onClick={(e) => deleteSpace(space.id, e)}
              style={{
                opacity: 0,
                fontSize: 12,
                color: "#aaa",
                padding: "0 4px",
                borderRadius: 4,
                lineHeight: 1,
              }}
              className="space-delete-btn"
            >
              ✕
            </span>
          </div>

          {/* Folders under space */}
          {expandedSpaces[space.id] && (
            <div>
              {(space.folders || []).map((folder) => (
                <div
                  key={folder.id}
                  className={`folder-item ${activeFolder?.id === folder.id ? "active" : ""}`}
                  onClick={() => onFolderSelect(space, folder)}
                >
                  <span style={{ fontSize: 12 }}>📁</span>
                  <span style={{ flex: 1 }}>{folder.name}</span>
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
                    onClick={(e) => deleteFolder(folder.id, e)}
                    className="space-delete-btn"
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

              {/* Add folder input */}
              {showAddFolder === space.id ? (
                <div
                  style={{
                    padding: "4px 14px 4px 30px",
                    display: "flex",
                    gap: 6,
                  }}
                >
                  <input
                    autoFocus
                    placeholder="Folder name"
                    value={newFolder}
                    onChange={(e) => setNewFolder(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createFolder(space.id);
                      if (e.key === "Escape") setShowAddFolder(null);
                    }}
                    style={{ flex: 1, padding: "4px 8px", fontSize: 12 }}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => createFolder(space.id)}
                  >
                    +
                  </button>
                </div>
              ) : (
                <button
                  className="add-btn-sidebar"
                  style={{ paddingLeft: 30 }}
                  onClick={() => setShowAddFolder(space.id)}
                >
                  + Add folder
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add space */}
      {showAddSpace ? (
        <div style={{ padding: "8px 12px" }}>
          <input
            autoFocus
            placeholder="Space name"
            value={newSpace.name}
            onChange={(e) =>
              setNewSpace((prev) => ({ ...prev, name: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") createSpace();
              if (e.key === "Escape") setShowAddSpace(false);
            }}
            style={{ width: "100%", marginBottom: 6, fontSize: 13 }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <label style={{ fontSize: 12, color: "#888" }}>Color</label>
            <input
              type="color"
              value={newSpace.color}
              onChange={(e) =>
                setNewSpace((prev) => ({ ...prev, color: e.target.value }))
              }
              style={{
                width: 36,
                height: 28,
                padding: 2,
                border: "1px solid #e0e0e0",
                borderRadius: 4,
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-primary btn-sm" onClick={createSpace}>
              Create
            </button>
            <button
              className="btn btn-sm"
              onClick={() => setShowAddSpace(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="add-btn-sidebar"
          onClick={() => setShowAddSpace(true)}
        >
          + Add space
        </button>
      )}
      {/* Bottom bar — user info + logout */}
      <div
        style={{
          marginTop: "auto",
          borderTop: "1px solid #e8e8e8",
          padding: "12px 8px",
        }}
      >
        {profile?.role === "admin" && (
          <div
            className={`nav-item ${view === "settings" ? "active" : ""}`}
            onClick={() => onNavigate("settings")}
          >
            <span>⚙️</span> Settings
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            marginTop: 4,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: profile?.avatar_color || "#378ADD",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {profile?.full_name
              ?.split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2) || "?"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {profile?.full_name || profile?.email}
            </div>
            <div style={{ fontSize: 10, color: "#aaa" }}>{profile?.role}</div>
          </div>
          <button
            onClick={onLogout}
            title="Sign out"
            style={{
              background: "none",
              border: "none",
              fontSize: 16,
              cursor: "pointer",
              color: "#aaa",
              padding: 4,
            }}
          >
            ↩
          </button>
        </div>
      </div>
    </aside>
  );
}
