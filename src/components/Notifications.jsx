import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";

function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function Notifications({ profile, onOpenTask }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const unread = items.filter((n) => !n.read).length;

  async function fetchNotifications() {
    if (!profile?.id) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setItems(data || []);
  }

  useEffect(() => {
    fetchNotifications();
    if (!profile?.id) return;
    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` },
        (payload) => setItems((prev) => [payload.new, ...prev]),
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [profile?.id]);

  useEffect(() => {
    function h(e) {
      if (open && wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  async function markRead(id) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }
  async function markAllRead() {
    const ids = items.filter((n) => !n.read).map((n) => n.id);
    if (!ids.length) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from("notifications").update({ read: true }).in("id", ids);
  }

  function clickItem(n) {
    if (!n.read) markRead(n.id);
    if (n.task_id && onOpenTask) onOpenTask(n);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        style={{
          position: "relative", width: 38, height: 38, borderRadius: "50%",
          border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, padding: "0 4px",
            borderRadius: 9, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700,
            display: "inline-flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff",
          }}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "115%", left: 0, width: 360, maxHeight: 440, overflowY: "auto",
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
          boxShadow: "0 12px 32px rgba(0,0,0,0.16)", padding: 8, zIndex: 9000,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px 10px" }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ fontSize: 12, color: "#1d4ed8", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 && (
            <div style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "28px 12px" }}>
              You're all caught up.
            </div>
          )}
          {items.map((n) => (
            <div
              key={n.id}
              onClick={() => clickItem(n)}
              style={{
                display: "flex", gap: 10, padding: "9px 10px", borderRadius: 8, cursor: "pointer",
                background: n.read ? "transparent" : "#eff6ff",
              }}
              onMouseEnter={(e) => { if (n.read) e.currentTarget.style.background = "#f5f5f4"; }}
              onMouseLeave={(e) => { if (n.read) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: n.read ? "transparent" : "#3b82f6", marginTop: 6, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 2 }}>{n.title}</div>
                {n.body && <div style={{ fontSize: 12, color: "#555", lineHeight: 1.4 }}>{n.body}</div>}
                <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>{timeAgo(n.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
