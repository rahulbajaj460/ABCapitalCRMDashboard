import { useState, useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { supabase } from "../supabase";

// Toolbar button component
function ToolbarBtn({ onClick, active, title, children }) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      style={{
        padding: "4px 8px",
        borderRadius: 4,
        border: "none",
        background: active ? "#dbeafe" : "transparent",
        color: active ? "#1d4ed8" : "#444",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        minWidth: 28,
      }}
    >
      {children}
    </button>
  );
}

// Rich text editor component
function RichEditor({ content, onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.configure({ inline: false, allowBase64: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({
        placeholder:
          "Start writing your article...\n\nTip: Use the toolbar above to format text, add images, tables, and more.",
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: content || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  const addImage = useCallback(() => {
    const url = window.prompt("Enter image URL:");
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const setLink = useCallback(() => {
    const url = window.prompt("Enter URL:");
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  const addTable = useCallback(() => {
    if (editor) {
      editor
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      style={{
        border: "1px solid #e8e8e8",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 2,
          padding: "8px 10px",
          borderBottom: "1px solid #e8e8e8",
          background: "#fafaf9",
          alignItems: "center",
        }}
      >
        {/* Text style */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <b>B</b>
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <i>I</i>
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline"
        >
          <u>U</u>
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          title="Strikethrough"
        >
          <s>S</s>
        </ToolbarBtn>

        <div
          style={{
            width: 1,
            height: 20,
            background: "#e8e8e8",
            margin: "0 4px",
          }}
        />

        {/* Headings */}
        <ToolbarBtn
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          active={editor.isActive("heading", { level: 1 })}
          title="Heading 1"
        >
          H1
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          active={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
        >
          H2
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          active={editor.isActive("heading", { level: 3 })}
          title="Heading 3"
        >
          H3
        </ToolbarBtn>

        <div
          style={{
            width: 1,
            height: 20,
            background: "#e8e8e8",
            margin: "0 4px",
          }}
        />

        {/* Lists */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          • List
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Numbered list"
        >
          1. List
        </ToolbarBtn>

        <div
          style={{
            width: 1,
            height: 20,
            background: "#e8e8e8",
            margin: "0 4px",
          }}
        />

        {/* Alignment */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title="Align left"
        >
          ⬅
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          title="Center"
        >
          ↔
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          title="Align right"
        >
          ➡
        </ToolbarBtn>

        <div
          style={{
            width: 1,
            height: 20,
            background: "#e8e8e8",
            margin: "0 4px",
          }}
        />

        {/* Other */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="Blockquote"
        >
          "
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive("code")}
          title="Inline code"
        >{`</>`}</ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive("codeBlock")}
          title="Code block"
        >{`{ }`}</ToolbarBtn>
        <ToolbarBtn
          onClick={setLink}
          active={editor.isActive("link")}
          title="Add link"
        >
          🔗
        </ToolbarBtn>
        <ToolbarBtn onClick={addImage} active={false} title="Add image">
          🖼
        </ToolbarBtn>
        <ToolbarBtn onClick={addTable} active={false} title="Insert table">
          ⊞ Table
        </ToolbarBtn>

        <div
          style={{
            width: 1,
            height: 20,
            background: "#e8e8e8",
            margin: "0 4px",
          }}
        />

        {/* Undo/Redo */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().undo().run()}
          active={false}
          title="Undo"
        >
          ↩
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().redo().run()}
          active={false}
          title="Redo"
        >
          ↪
        </ToolbarBtn>
      </div>

      {/* Editor area */}
      <div style={{ padding: "16px 20px", minHeight: 300, background: "#fff" }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// Main Wiki component
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
  const [viewMode, setViewMode] = useState("view");

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
      content: newArticle.content,
      space_id: newArticle.space_id || null,
      updated_at: new Date().toISOString(),
    };
    if (editingArticle) {
      await supabase
        .from("wiki_articles")
        .update(payload)
        .eq("id", editingArticle.id);
      // Refresh active article
      setActiveArticle({ ...editingArticle, ...payload });
    } else {
      const { data } = await supabase
        .from("wiki_articles")
        .insert(payload)
        .select()
        .single();
      if (data) setActiveArticle(data);
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
    return spaces.find((s) => s.id === spaceId)?.name || "General";
  }

  function getSpaceColor(spaceId) {
    return spaces.find((s) => s.id === spaceId)?.color || "#888";
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
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
          <div className="page-subtitle">
            {articles.length} article{articles.length !== 1 ? "s" : ""} ·
            Knowledge base
          </div>
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

      {/* Main content */}
      <div className="content-area">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: activeArticle
              ? "280px 1fr"
              : "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* Article list */}
          <div
            style={
              activeArticle
                ? {
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    maxHeight: "calc(100vh - 180px)",
                    overflowY: "auto",
                  }
                : {}
            }
          >
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
                  Click "+ New article" to get started
                </div>
              </div>
            ) : (
              filteredArticles.map((article) => (
                <div
                  key={article.id}
                  className={`wiki-card ${activeArticle?.id === article.id ? "active" : ""}`}
                  onClick={() => {
                    setActiveArticle(
                      activeArticle?.id === article.id ? null : article,
                    );
                    setViewMode("view");
                  }}
                  style={activeArticle ? { marginBottom: 0 } : {}}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 4,
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
              ))
            )}
          </div>

          {/* Article viewer */}
          {activeArticle && (
            <div
              style={{
                background: "#fff",
                border: "1px solid #e8e8e8",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {/* Article header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 20px",
                  borderBottom: "1px solid #e8e8e8",
                  background: "#fafaf9",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 2,
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
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    {activeArticle.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
                    Updated {formatDate(activeArticle.updated_at)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
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

              {/* Article content */}
              <div
                style={{
                  padding: "20px 24px",
                  maxHeight: "calc(100vh - 280px)",
                  overflowY: "auto",
                }}
                className="wiki-content"
                dangerouslySetInnerHTML={{ __html: activeArticle.content }}
              />
            </div>
          )}
        </div>
      </div>

      {/* NEW / EDIT MODAL */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            className="modal"
            style={{
              maxWidth: 820,
              width: "95vw",
              maxHeight: "90vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div className="modal-title" style={{ margin: 0 }}>
                {editingArticle ? "Edit article" : "New article"}
              </div>
              <button className="btn btn-sm" onClick={closeModal}>
                ✕
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Title *</label>
                <input
                  autoFocus
                  placeholder="Article title..."
                  value={newArticle.title}
                  onChange={(e) =>
                    setNewArticle((prev) => ({
                      ...prev,
                      title: e.target.value,
                    }))
                  }
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ width: 200 }}>
                <label className="form-label">Space</label>
                <select
                  value={newArticle.space_id}
                  onChange={(e) =>
                    setNewArticle((prev) => ({
                      ...prev,
                      space_id: e.target.value,
                    }))
                  }
                  style={{ width: "100%" }}
                >
                  <option value="">General</option>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ flex: 1, overflow: "auto", marginBottom: 14 }}>
              <label className="form-label" style={{ marginBottom: 6 }}>
                Content *
              </label>
              <RichEditor
                content={newArticle.content}
                onChange={(content) =>
                  setNewArticle((prev) => ({ ...prev, content }))
                }
              />
            </div>

            <div className="modal-actions" style={{ marginTop: 0 }}>
              <button className="btn" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={saveArticle}
                disabled={
                  !newArticle.title.trim() || !newArticle.content.trim()
                }
              >
                {editingArticle ? "Save changes" : "Create article"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
