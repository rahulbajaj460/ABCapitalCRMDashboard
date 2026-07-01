import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "../supabase";

const COLORS = ["#1a1a1a", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#ffffff"];
const WIDTHS = [2, 4, 8, 16];
const TOOLS = ["pen", "rect", "circle", "line", "text", "eraser", "select"];

function toolIcon(t) {
  switch (t) {
    case "pen":    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>;
    case "rect":   return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>;
    case "circle": return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/></svg>;
    case "line":   return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="19" x2="19" y2="5"/></svg>;
    case "text":   return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>;
    case "eraser": return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 20H7L3 16l13-13 6 6-2 11z"/></svg>;
    case "select": return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3l14 9-7 1-3 7L5 3z"/></svg>;
    default:       return t;
  }
}

export default function Whiteboard({ whiteboard, profile, onBack }) {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#1a1a1a");
  const [width, setWidth] = useState(3);
  const [elements, setElements] = useState([]);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [name, setName] = useState(whiteboard?.name || "Untitled Whiteboard");
  const [editingName, setEditingName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [textInput, setTextInput] = useState(null); // {x, y}
  const [textValue, setTextValue] = useState("");
  const drawing = useRef(false);
  const current = useRef(null); // element being drawn
  const saveTimeout = useRef(null);
  const lastPos = useRef(null);
  const canvasOffset = useRef({ x: 0, y: 0 });

  // Load saved data
  useEffect(() => {
    if (whiteboard?.data?.elements) {
      setElements(whiteboard.data.elements);
      setHistory([whiteboard.data.elements]);
    } else {
      setHistory([[]]);
    }
  }, [whiteboard?.id]);

  // Redraw canvas whenever elements change
  useEffect(() => {
    redraw();
  }, [elements]);

  // Track canvas offset for correct mouse coords
  useEffect(() => {
    function updateOffset() {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) canvasOffset.current = { x: rect.left, y: rect.top };
    }
    updateOffset();
    window.addEventListener("resize", updateOffset);
    window.addEventListener("scroll", updateOffset);
    return () => { window.removeEventListener("resize", updateOffset); window.removeEventListener("scroll", updateOffset); };
  }, []);

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function redraw(extraElement) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw grid
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < canvas.width; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }

    const all = extraElement ? [...elements, extraElement] : elements;
    all.forEach((el) => drawElement(ctx, el));
  }

  function drawElement(ctx, el) {
    ctx.save();
    ctx.strokeStyle = el.color;
    ctx.fillStyle = el.color;
    ctx.lineWidth = el.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (el.type === "pen") {
      if (!el.points || el.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(el.points[0].x, el.points[0].y);
      el.points.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    } else if (el.type === "eraser") {
      if (!el.points || el.points.length < 2) return;
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = el.width * 3;
      ctx.beginPath();
      ctx.moveTo(el.points[0].x, el.points[0].y);
      el.points.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    } else if (el.type === "rect") {
      ctx.strokeRect(el.x, el.y, el.w, el.h);
    } else if (el.type === "circle") {
      ctx.beginPath();
      ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, Math.abs(el.w / 2), Math.abs(el.h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (el.type === "line") {
      ctx.beginPath();
      ctx.moveTo(el.x1, el.y1);
      ctx.lineTo(el.x2, el.y2);
      ctx.stroke();
    } else if (el.type === "text") {
      ctx.font = `${el.fontSize || 16}px Inter, sans-serif`;
      ctx.fillText(el.text, el.x, el.y);
    } else if (el.type === "image" && el.src) {
      const img = new window.Image();
      img.onload = () => {
        ctx.drawImage(img, el.x, el.y, el.w, el.h);
        ctx.restore();
      };
      img.src = el.src;
      return; // restore called in onload
    }
    ctx.restore();
  }

  const fileInputRef = useRef(null);

  function importImage() {
    fileInputRef.current?.click();
  }

  function onImageFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target.result;
      const img = new window.Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        // Scale to fit nicely — max half the canvas width/height
        const maxW = canvas.width * 0.5;
        const maxH = canvas.height * 0.5;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;
        const el = { type: "image", src, x, y, w, h, id: Date.now() };
        commitElement(el);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // allow re-import of same file
  }

  function exportImage() {
    const canvas = canvasRef.current;
    const link = document.createElement("a");
    link.download = `${name || "whiteboard"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function onMouseDown(e) {
    if (tool === "text") {
      const pos = getPos(e);
      setTextInput(pos);
      setTextValue("");
      return;
    }
    drawing.current = true;
    const pos = getPos(e);
    lastPos.current = pos;
    if (tool === "pen" || tool === "eraser") {
      current.current = { type: tool, color, width, points: [pos] };
    } else if (tool === "rect" || tool === "circle") {
      current.current = { type: tool, color, width, x: pos.x, y: pos.y, w: 0, h: 0 };
    } else if (tool === "line") {
      current.current = { type: tool, color, width, x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
    }
  }

  function onMouseMove(e) {
    if (!drawing.current || !current.current) return;
    const pos = getPos(e);
    const el = current.current;
    if (el.type === "pen" || el.type === "eraser") {
      el.points.push(pos);
    } else if (el.type === "rect" || el.type === "circle") {
      el.w = pos.x - el.x;
      el.h = pos.y - el.y;
    } else if (el.type === "line") {
      el.x2 = pos.x; el.y2 = pos.y;
    }
    redraw({ ...el });
  }

  function onMouseUp() {
    if (!drawing.current || !current.current) return;
    drawing.current = false;
    const el = { ...current.current, id: Date.now() + Math.random() };
    current.current = null;
    commitElement(el);
  }

  function commitElement(el) {
    setElements((prev) => {
      const next = [...prev, el];
      setHistory((h) => [...h, next]);
      setFuture([]);
      scheduleSave(next);
      return next;
    });
  }

  function commitText() {
    if (!textValue.trim() || !textInput) { setTextInput(null); return; }
    const el = { type: "text", color, width, fontSize: 16, text: textValue, x: textInput.x, y: textInput.y, id: Date.now() };
    setTextInput(null);
    setTextValue("");
    commitElement(el);
  }

  function undo() {
    setHistory((h) => {
      if (h.length <= 1) return h;
      const prev = h[h.length - 2];
      const current = h[h.length - 1];
      setFuture((f) => [current, ...f]);
      setElements(prev);
      scheduleSave(prev);
      return h.slice(0, -1);
    });
  }

  function redo() {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setHistory((h) => [...h, next]);
      setElements(next);
      scheduleSave(next);
      return f.slice(1);
    });
  }

  function clearAll() {
    if (!confirm("Clear the whiteboard?")) return;
    setElements([]);
    setHistory([[]]);
    setFuture([]);
    scheduleSave([]);
  }

  function scheduleSave(els) {
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => saveToDb(els), 1200);
  }

  async function saveToDb(els) {
    setSaving(true);
    await supabase.from("whiteboards").update({ data: { elements: els }, updated_at: new Date().toISOString() }).eq("id", whiteboard.id);
    setSaving(false);
  }

  const nameInputRef = useRef(null);

  async function saveName() {
    const n = nameInputRef.current?.value ?? "";
    setEditingName(false);
    if (!n.trim()) return;
    setName(n.trim());
    await supabase.from("whiteboards").update({ name: n.trim() }).eq("id", whiteboard.id);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#fafafa", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: "1px solid #e5e7eb", background: "#fff", flexShrink: 0 }}>
        <button onClick={onBack} style={{ border: "none", background: "none", cursor: "pointer", color: "#6b7280", fontSize: 20, lineHeight: 1, padding: "2px 4px" }}>←</button>
        {editingName ? (
          <input
            ref={nameInputRef}
            autoFocus
            defaultValue={name}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); saveName(); }
              if (e.key === "Escape") { setEditingName(false); }
            }}
            style={{ fontSize: 14, fontWeight: 600, border: "1px solid #d1d5db", borderRadius: 4, padding: "2px 8px", outline: "none" }}
          />
        ) : (
          <span onClick={() => setEditingName(true)} style={{ fontSize: 14, fontWeight: 600, cursor: "text", color: "#111" }}>{name}</span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#9ca3af" }}>{saving ? "Saving…" : "Saved"}</span>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderBottom: "1px solid #e5e7eb", background: "#fff", flexShrink: 0, flexWrap: "wrap" }}>
        {/* Tools */}
        <div style={{ display: "flex", gap: 2, marginRight: 8 }}>
          {TOOLS.map((t) => (
            <button
              key={t}
              title={t}
              onClick={() => setTool(t)}
              style={{
                border: tool === t ? "2px solid #3b82f6" : "1px solid #e5e7eb",
                background: tool === t ? "#eff6ff" : "#fff",
                borderRadius: 6,
                padding: "5px 7px",
                cursor: "pointer",
                color: tool === t ? "#3b82f6" : "#374151",
                display: "flex", alignItems: "center",
              }}
            >
              {toolIcon(t)}
            </button>
          ))}
        </div>

        {/* Colors */}
        <div style={{ display: "flex", gap: 4, marginRight: 8 }}>
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 20, height: 20,
                borderRadius: "50%",
                background: c,
                border: color === c ? "2px solid #3b82f6" : "2px solid #d1d5db",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            />
          ))}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
            style={{ width: 22, height: 22, border: "none", padding: 0, borderRadius: "50%", cursor: "pointer", background: "none" }} />
        </div>

        {/* Widths */}
        <div style={{ display: "flex", gap: 4, alignItems: "center", marginRight: 8 }}>
          {WIDTHS.map((w) => (
            <button
              key={w}
              onClick={() => setWidth(w)}
              title={`${w}px`}
              style={{
                border: width === w ? "2px solid #3b82f6" : "1px solid #e5e7eb",
                background: width === w ? "#eff6ff" : "#fff",
                borderRadius: 4,
                padding: "4px 6px",
                cursor: "pointer",
                display: "flex", alignItems: "center",
              }}
            >
              <div style={{ width: Math.min(w * 2 + 4, 20), height: w, background: color, borderRadius: 99 }} />
            </button>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          <button onClick={undo} disabled={history.length <= 1} title="Undo"
            style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, color: "#374151" }}>
            ↩ Undo
          </button>
          <button onClick={redo} disabled={future.length === 0} title="Redo"
            style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, color: "#374151" }}>
            ↪ Redo
          </button>
          <button onClick={importImage} title="Import image"
            style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, color: "#374151" }}>
            ↑ Import Image
          </button>
          <button onClick={exportImage} title="Export as PNG"
            style={{ border: "1px solid #e5e7eb", background: "#fff", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, color: "#374151" }}>
            ↓ Export PNG
          </button>
          <button onClick={clearAll}
            style={{ border: "1px solid #fca5a5", background: "#fff", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, color: "#dc2626" }}>
            Clear
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={onImageFileChange} style={{ display: "none" }} />
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative", cursor: tool === "text" ? "text" : tool === "eraser" ? "cell" : "crosshair" }}>
        <canvas
          ref={canvasRef}
          width={window.innerWidth - 240}
          height={window.innerHeight - 110}
          style={{ display: "block", touchAction: "none" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        />
        {/* Text input overlay */}
        {textInput && (
          <input
            autoFocus
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commitText(); if (e.key === "Escape") setTextInput(null); }}
            onBlur={commitText}
            style={{
              position: "absolute",
              left: textInput.x,
              top: textInput.y - 16,
              fontSize: 16,
              color,
              border: "1px dashed #3b82f6",
              background: "transparent",
              outline: "none",
              minWidth: 80,
              padding: "2px 4px",
              fontFamily: "Inter, sans-serif",
            }}
          />
        )}
      </div>
    </div>
  );
}
