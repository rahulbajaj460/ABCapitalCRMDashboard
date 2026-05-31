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
      await supabase
        .from("wiki_categories")
        .update(payload)
        .eq("id", editingCat.id);
    } else {
      await supabase.from("wiki_categories").insert(payload);
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
    <div
      style={{
        display: "flex",
        height: "calc(100vh - 0px)",
        overflow: "hidden",
      }}
    >
      {/* LEFT SIDEBAR — category tree */}
      <div
        style={{
          width: 260,
          flexShrink: 0,
          background: "#fff",
          borderRight: "1px solid #e8e8e8",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid #e8e8e8",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600 }}>Wiki</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="btn btn-sm"
              onClick={() => openNewCat()}
              title="Add category"
            >
              + Category
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => openNewArticle()}
              title="New article"
            >
              + Page
            </button>
          </div>
        </div>

        {/* Search */}
        <div
          style={{ padding: "10px 12px", borderBottom: "1px solid #e8e8e8" }}
        >
          <div className="search-wrap" style={{ width: "100%" }}>
            <span style={{ color: "#aaa" }}>🔍</span>
            <input
              placeholder="Search pages..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
        </div>

        {/* Category tree */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {/* Search results */}
          {searchResults && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "#aaa",
                  padding: "4px 14px 6px",
                  textTransform: "uppercase",
                  letterSpacing: ".04em",
                }}
              >
                Results ({searchResults.length})
              </div>
              {searchResults.map((a) => (
                <div
                  key={a.id}
                  onClick={() => {
                    setActiveArticle(a);
                    setSearch("");
                  }}
                  style={{
                    padding: "6px 14px 6px 20px",
                    fontSize: 13,
                    cursor: "pointer",
                    color: activeArticle?.id === a.id ? "#1d4ed8" : "#444",
                    background:
                      activeArticle?.id === a.id ? "#eff6ff" : "transparent",
                  }}
                >
                  📄 {a.title}
                </div>
              ))}
            </div>
          )}

          {/* Normal tree */}
          {!searchResults && (
            <>
              {getTopCats().map((cat) => (
                <CategoryNode
                  key={cat.id}
                  cat={cat}
                  categories={categories}
                  articles={articles}
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

              {/* Uncategorised */}
              {getUncategorised().length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#aaa",
                      padding: "8px 14px 4px",
                      textTransform: "uppercase",
                      letterSpacing: ".04em",
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
            </>
          )}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {activeArticle ? (
          <div
            style={{
              flex: 1,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Article header */}
            <div
              style={{
                padding: "14px 24px",
                borderBottom: "1px solid #e8e8e8",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
              }}
            >
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {activeArticle.title}
                </div>
                <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>
                  Updated {formatDate(activeArticle.updated_at)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
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

            {/* Article body */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "24px 32px",
                background: "#fafaf9",
              }}
            >
              <div
                className="wiki-content"
                dangerouslySetInnerHTML={{ __html: activeArticle.content }}
              />
            </div>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 12,
              color: "#aaa",
            }}
          >
            <div style={{ fontSize: 40 }}>📚</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#555" }}>
              Select a page to view
            </div>
            <div style={{ fontSize: 13 }}>
              or click "+ Page" to create a new one
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 8 }}
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
                      {categories.find((p) => p.id === c.parent_id)
                        ? "  ↳ "
                        : ""}
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
  categories,
  articles,
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

  return (
    <div>
      {/* Category header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: `6px 12px 6px ${14 + depth * 12}px`,
          cursor: "pointer",
          gap: 6,
        }}
        className="wiki-cat-row"
        onClick={() => onToggle(cat.id)}
      >
        <span style={{ fontSize: 10, color: "#aaa", width: 12, flexShrink: 0 }}>
          {hasChildren ? (isExpanded ? "▾" : "▸") : ""}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: "#333" }}>
          📂 {cat.name}
        </span>
        <div className="wiki-cat-actions" style={{ display: "flex", gap: 2 }}>
          <button
            className="btn btn-sm"
            style={{ padding: "1px 6px", fontSize: 11 }}
            onClick={(e) => {
              e.stopPropagation();
              onNewArticle(cat.id);
            }}
            title="Add page"
          >
            + Page
          </button>
          <button
            className="btn btn-sm"
            style={{ padding: "1px 6px", fontSize: 11 }}
            onClick={(e) => {
              e.stopPropagation();
              onNewSubCat(cat.id);
            }}
            title="Add subcategory"
          >
            + Sub
          </button>
          <button
            className="btn btn-sm"
            style={{ padding: "1px 6px", fontSize: 11 }}
            onClick={(e) => {
              e.stopPropagation();
              onEditCat(cat);
            }}
            title="Edit"
          >
            ✏️
          </button>
          <button
            className="btn btn-sm btn-danger"
            style={{ padding: "1px 6px", fontSize: 11 }}
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

      {/* Expanded content */}
      {isExpanded && (
        <div>
          {subCats.map((sub) => (
            <CategoryNode
              key={sub.id}
              cat={sub}
              categories={categories}
              articles={articles}
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
  return (
    <div
      onClick={() => onSelect(article)}
      style={{
        padding: `5px 12px 5px ${26 + depth * 12}px`,
        fontSize: 13,
        cursor: "pointer",
        color: active ? "#1d4ed8" : "#555",
        background: active ? "#eff6ff" : "transparent",
        borderRadius: 4,
        margin: "1px 6px",
      }}
    >
      📄 {article.title}
    </div>
  );
}
