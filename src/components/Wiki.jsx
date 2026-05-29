import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export default function Wiki({ spaces }) {
  const [articles, setArticles] = useState([]);
  const [activeArticle, setActiveArticle] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingArticle, setEditingArticle] = useState(null);
  const [filterSpace, setFilterSpace] = useState("all");
  const [search, setSearch] = useState("");
  const [newArticle, setNewArticle] = useState({
    title: "",
    content: "",
    space_id: "",
  });

  useEffect(() => {
    fetchArticles();
  }, []);

  async function fetchArticles() {
    const { data } = await supabase
      .from("wiki_articles")
      .select("*")
      .order("updated_at", { ascending: false });
    if (data) setArticles(data);
  }

  async function saveArticle() {
    if (!newArticle.title.trim() || !newArticle.content.trim()) return;

    const payload = {
      title: newArticle.title.trim(),
      content: newArticle.content.trim(),
      space_id: newArticle.space_id || null,
      updated_at: new Date().toISOString(),
    };

    if (editingArticle) {
      await supabase
        .from("wiki_articles")
        .update(payload)
        .eq("id", editingArticle.id);
    } else {
      await supabase.from("wiki_articles").insert(payload);
    }

    closeModal();
    fetchArticles();
  }

  async function deleteArticle(id) {
    if (!confirm("Delete this article?")) return;
    await supabase.from("wiki_articles").delete().eq("id", id);
    if (activeArticle?.id === id) setActiveArticle(null);
    fetchArticles();
  }

  function openNew() {
    setEditingArticle(null);
    setNewArticle({ title: "", content: "", space_id: "" });
    setShowModal(true);
  }

  function openEdit(article) {
    setEditingArticle(article);
    setNewArticle({
      title: article.title,
      content: article.content || "",
      space_id: article.space_id || "",
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingArticle(null);
  }

  function getSpaceName(spaceId) {
    const space = spaces.find((s) => s.id === spaceId);
    return space?.name || "General";
  }

  function getSpaceColor(spaceId) {
    const space = spaces.find((s) => s.id === spaceId);
    return space?.color || "#888";
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  // Format content — each line starting with - becomes a checklist item
  function renderContent(content) {
    if (!content) return null;
    const lines = content.split("\n");
    return lines.map((line, i) => {
      if (line.startsWith("- ")) {
        return (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 10,
              padding: "6px 0",
              borderBottom: "1px solid #f0f0f0",
              alignItems: "flex-start",
            }}
          >
            <span style={{ color: "#16a34a", flexShrink: 0, marginTop: 1 }}>
              ✓
            </span>
            <span style={{ fontSize: 14, color: "#333" }}>{line.slice(2)}</span>
          </div>
        );
      }
      if (line.startsWith("# ")) {
        return (
          <div
            key={i}
            style={{ fontSize: 16, fontWeight: 600, margin: "16px 0 8px" }}
          >
            {line.slice(2)}
          </div>
        );
      }
      if (line.startsWith("## ")) {
        return (
          <div
            key={i}
            style={{
              fontSize: 14,
              fontWeight: 600,
              margin: "12px 0 6px",
              color: "#555",
            }}
          >
            {line.slice(3)}
          </div>
        );
      }
      if (line.trim() === "") return <div key={i} style={{ height: 8 }} />;
      return (
        <div key={i} style={{ fontSize: 14, color: "#444", lineHeight: 1.7 }}>
          {line}
        </div>
      );
    });
  }

  const filteredArticles = articles.filter((a) => {
    if (filterSpace !== "all" && a.space_id !== filterSpace) return false;
    if (search && !a.title.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Wiki</div>
          <div className="page-subtitle">Knowledge base for your team</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          + New article
        </button>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 10,
          padding: "12px 24px",
          borderBottom: "1px solid #e8e8e8",
          background: "#fff",
          alignItems: "center",
        }}
      >
        <div className="search-wrap">
          <span style={{ color: "#aaa" }}>🔍</span>
          <input
            placeholder="Search articles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={filterSpace}
          onChange={(e) => setFilterSpace(e.target.value)}
          style={{ fontSize: 13 }}
        >
          <option value="all">All spaces</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="content-area">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: activeArticle ? "1fr 1.6fr" : "1fr",
            gap: 20,
          }}
        >
          {/* Article list */}
          <div>
            {filteredArticles.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 20px",
                  color: "#aaa",
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>📚</div>
                <div style={{ fontSize: 14, marginBottom: 4 }}>
                  No articles yet
                </div>
                <div style={{ fontSize: 12 }}>
                  Click "+ New article" to create your first wiki page
                </div>
                <div style={{ fontSize: 12, marginTop: 8, color: "#bbb" }}>
                  Tip: use{" "}
                  <code
                    style={{
                      background: "#f5f5f4",
                      padding: "1px 4px",
                      borderRadius: 3,
                    }}
                  >
                    - item
                  </code>{" "}
                  for checklists,
                  <code
                    style={{
                      background: "#f5f5f4",
                      padding: "1px 4px",
                      borderRadius: 3,
                      marginLeft: 4,
                    }}
                  >
                    # Heading
                  </code>{" "}
                  for headings
                </div>
              </div>
            ) : (
              <div
                className="wiki-grid"
                style={{
                  gridTemplateColumns: activeArticle
                    ? "1fr"
                    : "repeat(auto-fill, minmax(200px, 1fr))",
                }}
              >
                {filteredArticles.map((article) => (
                  <div
                    key={article.id}
                    className={`wiki-card ${activeArticle?.id === article.id ? "active" : ""}`}
                    onClick={() =>
                      setActiveArticle(
                        activeArticle?.id === article.id ? null : article,
                      )
                    }
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: getSpaceColor(article.space_id),
                          flexShrink: 0,
                        }}
                      />
                      <div className="wiki-card-space">
                        {getSpaceName(article.space_id)}
                      </div>
                    </div>
                    <div className="wiki-card-title">{article.title}</div>
                    <div className="wiki-card-meta">
                      Updated {formatDate(article.updated_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Article viewer */}
          {activeArticle && (
            <div className="wiki-article">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 16,
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: getSpaceColor(activeArticle.space_id),
                      }}
                    />
                    <span
                      style={{
                        fontSize: 11,
                        color: "#aaa",
                        textTransform: "uppercase",
                        letterSpacing: ".05em",
                      }}
                    >
                      {getSpaceName(activeArticle.space_id)}
                    </span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>
                    {activeArticle.title}
                  </div>
                  <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>
                    Updated {formatDate(activeArticle.updated_at)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => openEdit(activeArticle)}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => deleteArticle(activeArticle.id)}
                  >
                    🗑
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => setActiveArticle(null)}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div style={{ borderTop: "1px solid #e8e8e8", paddingTop: 16 }}>
                {renderContent(activeArticle.content)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* NEW / EDIT ARTICLE MODAL */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-title">
              {editingArticle ? "Edit article" : "New article"}
            </div>

            <div className="form-group">
              <label className="form-label">Title *</label>
              <input
                autoFocus
                placeholder="e.g. VAT registration – document checklist"
                value={newArticle.title}
                onChange={(e) =>
                  setNewArticle((prev) => ({ ...prev, title: e.target.value }))
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Space</label>
              <select
                value={newArticle.space_id}
                onChange={(e) =>
                  setNewArticle((prev) => ({
                    ...prev,
                    space_id: e.target.value,
                  }))
                }
              >
                <option value="">General (no space)</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Content *</label>
              <textarea
                placeholder={`Write your content here...\n\nTips:\n- Start a line with "- " for a checklist item\n- Start with "# " for a heading\n- Start with "## " for a subheading`}
                value={newArticle.content}
                onChange={(e) =>
                  setNewArticle((prev) => ({
                    ...prev,
                    content: e.target.value,
                  }))
                }
                style={{
                  minHeight: 240,
                  fontFamily: "monospace",
                  fontSize: 13,
                }}
              />
            </div>

            <div
              style={{
                background: "#f5f5f4",
                borderRadius: 6,
                padding: "10px 14px",
                fontSize: 12,
                color: "#888",
                marginBottom: 4,
              }}
            >
              <strong>Formatting tips:</strong> &nbsp;
              <code
                style={{
                  background: "#e8e8e8",
                  padding: "1px 4px",
                  borderRadius: 3,
                }}
              >
                - item
              </code>{" "}
              checklist &nbsp;
              <code
                style={{
                  background: "#e8e8e8",
                  padding: "1px 4px",
                  borderRadius: 3,
                }}
              >
                # Heading
              </code>{" "}
              heading &nbsp;
              <code
                style={{
                  background: "#e8e8e8",
                  padding: "1px 4px",
                  borderRadius: 3,
                }}
              >
                ## Sub
              </code>{" "}
              subheading
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={closeModal}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveArticle}>
                {editingArticle ? "Save changes" : "Create article"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
