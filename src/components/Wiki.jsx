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

function RichEditor({ content, onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.configure({ inline: false, allowBase64: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Start writing your article..." }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: content || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  const addImage = useCallback(() => {
    const url = window.prompt("Enter image URL:");
    if (url && editor) editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  const setLink = useCallback(() => {
    const url = window.prompt("Enter URL:");
    if (url && editor) editor.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  const addTable = useCallback(() => {
    if (editor)
      editor
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
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
          title="Strike"
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
        <ToolbarBtn
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          active={editor.isActive("heading", { level: 1 })}
          title="H1"
        >
          H1
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          active={editor.isActive("heading", { level: 2 })}
          title="H2"
        >
          H2
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          active={editor.isActive("heading", { level: 3 })}
          title="H3"
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
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title="Left"
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
          title="Right"
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
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="Blockquote"
        >
          "
        </ToolbarBtn>
        <ToolbarBtn
          onClick={setLink}
          active={editor.isActive("link")}
          title="Link"
        >
          🔗
        </ToolbarBtn>
        <ToolbarBtn onClick={addImage} active={false} title="Image">
          🖼
        </ToolbarBtn>
        <ToolbarBtn onClick={addTable} active={false} title="Table">
          ⊞
        </ToolbarBtn>
        <div
          style={{
            width: 1,
            height: 20,
            background: "#e8e8e8",
            margin: "0 4px",
          }}
        />
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
      <div style={{ padding: "16px 20px", minHeight: 300, background: "#fff" }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export default function Wiki() {
  const [categories, setCategories] = useState([]);
  const [articles, setArticles] = useState([]);
  const [activeArticle, setActiveArticle] = useState(null);
  const [expandedCats, setExpandedCats] = useState({});
  const [search, setSearch] = useState("");

  // Modals
  const [showArticleModal, setShowArticleModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingArticle, setEditingArticle] = useState(null);
  const [editingCat, setEditingCat] = useState(null);

  // Forms
  const [newArticle, setNewArticle] = useState({
    title: "",
    content: "",
    category_id: "",
  });
  const [newCat, setNewCat] = useState({ name: "", parent_id: "" });

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    const [catsRes, artsRes] = await Promise.all([
      supabase.from("wiki_categories").select("*").order("category_order"),
      supabase
        .from("wiki_articles")
        .select("*")
        .order("updated_at", { ascending: false }),
    ]);
    if (catsRes.data) setCategories(catsRes.data);
    if (artsRes.data) setArticles(artsRes.data);
  }

  async function saveArticle() {
    if (!newArticle.title.trim() || !newArticle.content.trim()) return;
    const payload = {
      title: newArticle.title.trim(),
      content: newArticle.content,
      category_id: newArticle.category_id || null,
      updated_at: new Date().toISOString(),
    };
    if (editingArticle) {
      const { data } = await supabase
        .from("wiki_articles")
        .update(payload)
        .eq("id", editingArticle.id)
        .select()
        .single();
      if (data) setActiveArticle(data);
    } else {
      const { data } = await supabase
        .from("wiki_articles")
        .insert(payload)
        .select()
        .single();
      if (data) setActiveArticle(data);
    }
    closeArticleModal();
    fetchAll();
  }

  async function deleteArticle(id) {
    if (!confirm("Delete this article?")) return;
    await supabase.from("wiki_articles").delete().eq("id", id);
    if (activeArticle?.id === id) setActiveArticle(null);
    fetchAll();
  }

  async function saveCategory() {
    if (!newCat.name.trim()) return;
    const payload = {
      name: newCat.name.trim(),
      parent_id: newCat.parent_id || null,
      category_order: categories.length + 1,
    };
    if (editingCat) {
      const { error } = await supabase
        .from("wiki_categories")
        .update(payload)
        .eq("id", editingCat.id);
      if (error) {
        alert("Error: " + error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("wiki_categories").insert(payload);
      if (error) {
        alert("Error: " + error.message);
        return;
      }
    }
    closeCatModal();
    fetchAll();
  }

  async function deleteCategory(id, name) {
    if (
      !confirm(
        `Delete category "${name}"? Articles inside will become uncategorised.`,
      )
    )
      return;
    await supabase.from("wiki_categories").delete().eq("id", id);
    fetchAll();
  }

  function openNewArticle(categoryId = "") {
    setEditingArticle(null);
    setNewArticle({ title: "", content: "", category_id: categoryId });
    setShowArticleModal(true);
  }

  function openEditArticle(article) {
    setEditingArticle(article);
    setNewArticle({
      title: article.title,
      content: article.content || "",
      category_id: article.category_id || "",
    });
    setShowArticleModal(true);
  }

  function closeArticleModal() {
    setShowArticleModal(false);
    setEditingArticle(null);
  }

  function openNewCat(parentId = "") {
    setEditingCat(null);
    setNewCat({ name: "", parent_id: parentId });
    setShowCatModal(true);
  }

  function openEditCat(cat) {
    setEditingCat(cat);
    setNewCat({ name: cat.name, parent_id: cat.parent_id || "" });
    setShowCatModal(true);
  }

  function closeCatModal() {
    setShowCatModal(false);
    setEditingCat(null);
  }

  function toggleCat(id) {
    setExpandedCats((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Get top-level categories
  function getTopCats() {
    return categories
      .filter((c) => !c.parent_id)
      .sort((a, b) => a.category_order - b.category_order);
  }

  // Get subcategories of a category
  function getSubCats(parentId) {
    return categories
      .filter((c) => c.parent_id === parentId)
      .sort((a, b) => a.category_order - b.category_order);
  }

  // Get articles in a category
  function getCatArticles(categoryId) {
    return articles.filter((a) => a.category_id === categoryId);
  }

  // Get uncategorised articles
  function getUncategorised() {
    return articles.filter((a) => !a.category_id);
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  // Filter for search
  const searchResults = search.trim()
    ? articles.filter((a) =>
        a.title.toLowerCase().includes(search.toLowerCase()),
      )
    : null;

  return (
    <div className="wiki-layout">
      {/* LEFT SIDEBAR */}
      <div className="wiki-sidebar">
        <div className="wiki-sidebar-header">
          <span className="wiki-sidebar-title">📚 Knowledge Base</span>
          <div className="wiki-sidebar-actions">
            <button
              className="btn btn-sm"
              style={{ fontSize: 11, padding: "3px 8px" }}
              onClick={() => openNewCat()}
            >
              + Category
            </button>
            <button
              className="btn btn-primary btn-sm"
              style={{ fontSize: 11, padding: "3px 8px" }}
              onClick={() => openNewArticle()}
            >
              + Page
            </button>
          </div>
        </div>

        <div className="wiki-search-wrap">
          <div className="wiki-search-input">
            <span style={{ color: "#aaa", fontSize: 13 }}>🔍</span>
            <input
              placeholder="Search pages..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <span
                style={{ color: "#aaa", cursor: "pointer", fontSize: 13 }}
                onClick={() => setSearch("")}
              >
                ✕
              </span>
            )}
          </div>
        </div>

        <div className="wiki-tree">
          {searchResults ? (
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "#aaa",
                  padding: "6px 12px 4px",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                }}
              >
                {searchResults.length} result
                {searchResults.length !== 1 ? "s" : ""}
              </div>
              {searchResults.length === 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "#ccc",
                    padding: "12px",
                    textAlign: "center",
                  }}
                >
                  No pages found
                </div>
              ) : (
                searchResults.map((a) => (
                  <div
                    key={a.id}
                    className={`wiki-page-row ${activeArticle?.id === a.id ? "active" : ""}`}
                    style={{ paddingLeft: 12 }}
                    onClick={() => {
                      setActiveArticle(a);
                      setSearch("");
                    }}
                  >
                    <span className="wiki-page-icon">📄</span>
                    <span className="wiki-page-name">{a.title}</span>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              {getTopCats().map((cat) => (
                <CategoryNode
                  key={cat.id}
                  cat={cat}
                  activeArticle={activeArticle}
                  expandedCats={expandedCats}
                  onToggle={toggleCat}
                  onSelectArticle={setActiveArticle}
                  onNewArticle={openNewArticle}
                  onNewSubCat={openNewCat}
                  onEditCat={openEditCat}
                  onDeleteCat={deleteCategory}
                  getSubCats={getSubCats}
                  getCatArticles={getCatArticles}
                  depth={0}
                />
              ))}

              {getUncategorised().length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#bbb",
                      padding: "8px 12px 4px",
                      textTransform: "uppercase",
                      letterSpacing: ".06em",
                    }}
                  >
                    Uncategorised
                  </div>
                  {getUncategorised().map((a) => (
                    <ArticleTreeItem
                      key={a.id}
                      article={a}
                      active={activeArticle?.id === a.id}
                      onSelect={setActiveArticle}
                      depth={0}
                    />
                  ))}
                </div>
              )}

              {categories.length === 0 && articles.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "30px 16px",
                    color: "#ccc",
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 6 }}>📂</div>
                  <div style={{ fontSize: 12 }}>No categories yet</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>
                    Click "+ Category" to get started
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="wiki-main">
        {activeArticle ? (
          <>
            <div className="wiki-article-header">
              <div>
                <div className="wiki-article-title">{activeArticle.title}</div>
                <div className="wiki-article-meta">
                  Updated {formatDate(activeArticle.updated_at)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  className="btn btn-sm"
                  onClick={() => openEditArticle(activeArticle)}
                >
                  ✏️ Edit
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => deleteArticle(activeArticle.id)}
                >
                  🗑 Delete
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => setActiveArticle(null)}
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="wiki-article-body">
              <div
                className="wiki-content"
                dangerouslySetInnerHTML={{ __html: activeArticle.content }}
              />
            </div>
          </>
        ) : (
          <div className="wiki-empty-state">
            <div style={{ fontSize: 48 }}>📄</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#555" }}>
              Select a page to view
            </div>
            <div style={{ fontSize: 13 }}>
              or create a new one from the sidebar
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 12 }}
              onClick={() => openNewArticle()}
            >
              + New page
            </button>
          </div>
        )}
      </div>

      {/* ARTICLE MODAL */}
      {showArticleModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && closeArticleModal()}
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
                {editingArticle ? "Edit page" : "New page"}
              </div>
              <button className="btn btn-sm" onClick={closeArticleModal}>
                ✕
              </button>
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Title *</label>
                <input
                  autoFocus
                  placeholder="Page title..."
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
              <div style={{ width: 220 }}>
                <label className="form-label">Category</label>
                <select
                  value={newArticle.category_id}
                  onChange={(e) =>
                    setNewArticle((prev) => ({
                      ...prev,
                      category_id: e.target.value,
                    }))
                  }
                  style={{ width: "100%" }}
                >
                  <option value="">Uncategorised</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.parent_id ? "  ↳ " : ""}
                      {c.name}
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
              <button className="btn" onClick={closeArticleModal}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={saveArticle}
                disabled={
                  !newArticle.title.trim() || !newArticle.content.trim()
                }
              >
                {editingArticle ? "Save changes" : "Create page"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORY MODAL */}
      {showCatModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && closeCatModal()}
        >
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-title">
              {editingCat ? "Edit category" : "New category"}
            </div>
            <div className="form-group">
              <label className="form-label">Category name</label>
              <input
                autoFocus
                placeholder="e.g. Business Set Up"
                value={newCat.name}
                onChange={(e) =>
                  setNewCat((prev) => ({ ...prev, name: e.target.value }))
                }
                onKeyDown={(e) => e.key === "Enter" && saveCategory()}
                style={{ width: "100%" }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Parent category (optional)</label>
              <select
                value={newCat.parent_id}
                onChange={(e) =>
                  setNewCat((prev) => ({ ...prev, parent_id: e.target.value }))
                }
                style={{ width: "100%" }}
              >
                <option value="">None (top level)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={closeCatModal}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveCategory}>
                {editingCat ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Category node component (recursive for nested categories)
function CategoryNode({
  cat,
  activeArticle,
  expandedCats,
  onToggle,
  onSelectArticle,
  onNewArticle,
  onNewSubCat,
  onEditCat,
  onDeleteCat,
  getSubCats,
  getCatArticles,
  depth,
}) {
  const isExpanded = expandedCats[cat.id] !== false;
  const subCats = getSubCats(cat.id);
  const catArticles = getCatArticles(cat.id);
  const hasChildren = subCats.length > 0 || catArticles.length > 0;
  const indent = depth * 14;

  return (
    <div>
      <div className="wiki-cat-row" style={{ paddingLeft: 8 + indent }}>
        <span className="wiki-cat-toggle" onClick={() => onToggle(cat.id)}>
          {hasChildren ? (isExpanded ? "▾" : "▸") : ""}
        </span>
        <span className="wiki-cat-icon" onClick={() => onToggle(cat.id)}>
          📂
        </span>
        <span className="wiki-cat-name" onClick={() => onToggle(cat.id)}>
          {cat.name}
        </span>
        <div className="wiki-cat-actions">
          <button
            className="wiki-cat-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onNewArticle(cat.id);
            }}
            title="Add page"
          >
            + Page
          </button>
          <button
            className="wiki-cat-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onNewSubCat(cat.id);
            }}
            title="Add subcategory"
          >
            + Sub
          </button>
          <button
            className="wiki-cat-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onEditCat(cat);
            }}
            title="Rename"
          >
            ✏️
          </button>
          <button
            className="wiki-cat-action-btn danger"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteCat(cat.id, cat.name);
            }}
            title="Delete"
          >
            🗑
          </button>
        </div>
      </div>

      {isExpanded && (
        <div>
          {subCats.map((sub) => (
            <CategoryNode
              key={sub.id}
              cat={sub}
              activeArticle={activeArticle}
              expandedCats={expandedCats}
              onToggle={onToggle}
              onSelectArticle={onSelectArticle}
              onNewArticle={onNewArticle}
              onNewSubCat={onNewSubCat}
              onEditCat={onEditCat}
              onDeleteCat={onDeleteCat}
              getSubCats={getSubCats}
              getCatArticles={getCatArticles}
              depth={depth + 1}
            />
          ))}
          {catArticles.map((a) => (
            <ArticleTreeItem
              key={a.id}
              article={a}
              active={activeArticle?.id === a.id}
              onSelect={onSelectArticle}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ArticleTreeItem({ article, active, onSelect, depth }) {
  const indent = 8 + depth * 14;
  return (
    <div
      className={`wiki-page-row ${active ? "active" : ""}`}
      style={{ paddingLeft: 8 + indent }}
      onClick={() => onSelect(article)}
    >
      <span style={{ width: 16, flexShrink: 0 }} />
      <span className="wiki-page-icon">📄</span>
      <span className="wiki-page-name">{article.title}</span>
    </div>
  );
}
