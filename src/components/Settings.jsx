import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { supabaseAdmin } from "../supabaseAdmin";

export default function Settings({ currentUser, profile }) {
  const [members, setMembers] = useState([]);
  const [msg, setMsg] = useState({ text: "", type: "success" });
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [invite, setInvite] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "member",
  });
  const [removeConfirm, setRemoveConfirm] = useState(null);

  useEffect(() => {
    fetchMembers();
  }, []);

  async function fetchMembers() {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at");
    if (data) setMembers(data);
  }

  function showMsg(text, type = "success") {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "success" }), 4000);
  }

  async function updateRole(userId, newRole) {
    if (userId === currentUser.id) return;
    await supabase.from("profiles").update({ role: newRole }).eq("id", userId);
    showMsg("Role updated.");
    fetchMembers();
  }

  async function handleInvite(e) {
    e.preventDefault();
    if (!supabaseAdmin) {
      showMsg("Service role key not configured. See setup instructions below.", "error");
      return;
    }
    if (!invite.full_name.trim() || !invite.email.trim() || !invite.password.trim()) {
      showMsg("Please fill all fields.", "error");
      return;
    }
    setInviting(true);
    try {
      // Create auth user
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: invite.email.trim(),
        password: invite.password,
        email_confirm: true,
        user_metadata: { full_name: invite.full_name.trim() },
      });

      if (authErr) {
        showMsg(authErr.message, "error");
        setInviting(false);
        return;
      }

      // Upsert profile
      await supabaseAdmin.from("profiles").upsert({
        id: authData.user.id,
        email: invite.email.trim(),
        full_name: invite.full_name.trim(),
        role: invite.role,
      });

      showMsg(`${invite.full_name} has been added. Share their email and password with them.`);
      setInvite({ full_name: "", email: "", password: "", role: "member" });
      setShowInvite(false);
      fetchMembers();
    } catch (err) {
      showMsg(err.message || "Failed to create user.", "error");
    }
    setInviting(false);
  }

  async function handleRemove(member) {
    if (!supabaseAdmin) {
      showMsg("Service role key not configured.", "error");
      return;
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(member.id);
    if (error) {
      showMsg(error.message, "error");
    } else {
      showMsg(`${member.full_name || member.email} removed.`);
      fetchMembers();
    }
    setRemoveConfirm(null);
  }

  function getInitials(name) {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  }

  const adminConfigured = !!supabaseAdmin;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Manage your workspace and team</div>
        </div>
      </div>

      <div className="content-area">
        {/* Setup notice if admin not configured */}
        {!adminConfigured && (
          <div style={{
            background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8,
            padding: "14px 18px", marginBottom: 24, fontSize: 13, color: "#92400e",
          }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>⚠️ One-time setup to enable in-app user management</div>
            <div style={{ marginBottom: 8 }}>
              Add your Supabase service role key to <code style={{ background: "#fef3c7", padding: "1px 5px", borderRadius: 3 }}>.env</code>:
            </div>
            <div style={{
              background: "#fef3c7", padding: "8px 12px", borderRadius: 4,
              fontFamily: "monospace", fontSize: 12, marginBottom: 8,
            }}>
              VITE_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
            </div>
            <div style={{ fontSize: 12, color: "#b45309" }}>
              Find it in Supabase → Project Settings → API → service_role secret. Then restart the dev server.
            </div>
          </div>
        )}

        {/* Toast message */}
        {msg.text && (
          <div style={{
            padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13,
            background: msg.type === "error" ? "#fef2f2" : "#f0fdf4",
            color: msg.type === "error" ? "#dc2626" : "#15803d",
            border: `1px solid ${msg.type === "error" ? "#fecaca" : "#bbf7d0"}`,
          }}>
            {msg.text}
          </div>
        )}

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            Team members ({members.length})
          </div>
          <button
            onClick={() => setShowInvite(true)}
            style={{
              background: "#2563eb", color: "#fff", border: "none",
              borderRadius: 6, padding: "7px 16px", fontSize: 13,
              fontWeight: 500, cursor: "pointer", display: "flex",
              alignItems: "center", gap: 6,
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Member
          </button>
        </div>

        {/* Members table */}
        <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: 8, overflow: "hidden" }}>
          <table className="task-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: member.avatar_color || "#378ADD",
                        color: "#fff", display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: 12, fontWeight: 600, flexShrink: 0,
                      }}>
                        {getInitials(member.full_name)}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{member.full_name || "—"}</div>
                        {member.id === currentUser.id && (
                          <div style={{ fontSize: 11, color: "#888" }}>You</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 13, color: "#555" }}>{member.email}</td>
                  <td>
                    {member.id === currentUser.id ? (
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 20,
                        background: "#eff6ff", color: "#1d4ed8", fontWeight: 500,
                      }}>
                        admin
                      </span>
                    ) : (
                      <select
                        value={member.role}
                        onChange={(e) => updateRole(member.id, e.target.value)}
                        style={{ fontSize: 12, padding: "3px 8px" }}
                      >
                        <option value="member">member</option>
                        <option value="admin">admin</option>
                      </select>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: "#aaa" }}>
                    {new Date(member.created_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </td>
                  <td>
                    {member.id !== currentUser.id && (
                      <button
                        onClick={() => setRemoveConfirm(member)}
                        title="Remove member"
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: "#f87171", padding: "4px 6px", borderRadius: 4,
                          fontSize: 12,
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "#fef2f2"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowInvite(false); }}
        >
          <div style={{
            background: "#fff", borderRadius: 12, padding: 28,
            width: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Add New Member</div>

            {!adminConfigured && (
              <div style={{
                background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6,
                padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#dc2626",
              }}>
                Service role key not configured. Close this and follow the setup instructions.
              </div>
            )}

            <form onSubmit={handleInvite} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: "#555", display: "block", marginBottom: 5 }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ahmed Al Mansoori"
                  value={invite.full_name}
                  onChange={(e) => setInvite({ ...invite, full_name: e.target.value })}
                  style={{
                    width: "100%", border: "1px solid #e0e0e0", borderRadius: 6,
                    padding: "8px 11px", fontSize: 13, boxSizing: "border-box",
                  }}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: "#555", display: "block", marginBottom: 5 }}>
                  Email *
                </label>
                <input
                  type="email"
                  placeholder="ahmed@example.com"
                  value={invite.email}
                  onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                  style={{
                    width: "100%", border: "1px solid #e0e0e0", borderRadius: 6,
                    padding: "8px 11px", fontSize: 13, boxSizing: "border-box",
                  }}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: "#555", display: "block", marginBottom: 5 }}>
                  Temporary Password *
                </label>
                <input
                  type="password"
                  placeholder="They can change it after logging in"
                  value={invite.password}
                  onChange={(e) => setInvite({ ...invite, password: e.target.value })}
                  style={{
                    width: "100%", border: "1px solid #e0e0e0", borderRadius: 6,
                    padding: "8px 11px", fontSize: 13, boxSizing: "border-box",
                  }}
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: "#555", display: "block", marginBottom: 5 }}>
                  Role
                </label>
                <select
                  value={invite.role}
                  onChange={(e) => setInvite({ ...invite, role: e.target.value })}
                  style={{
                    width: "100%", border: "1px solid #e0e0e0", borderRadius: 6,
                    padding: "8px 11px", fontSize: 13, boxSizing: "border-box",
                  }}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  style={{
                    flex: 1, padding: "9px 0", borderRadius: 6, border: "1px solid #e0e0e0",
                    background: "#fff", fontSize: 13, cursor: "pointer", color: "#555",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting || !adminConfigured}
                  style={{
                    flex: 1, padding: "9px 0", borderRadius: 6, border: "none",
                    background: adminConfigured ? "#2563eb" : "#93c5fd",
                    color: "#fff", fontSize: 13, fontWeight: 500,
                    cursor: adminConfigured ? "pointer" : "not-allowed",
                  }}
                >
                  {inviting ? "Adding..." : "Add Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove confirm modal */}
      {removeConfirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{
            background: "#fff", borderRadius: 12, padding: 28,
            width: 360, boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Remove Member?</div>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>
              <strong>{removeConfirm.full_name || removeConfirm.email}</strong> will lose access to the workspace immediately.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setRemoveConfirm(null)}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: 6, border: "1px solid #e0e0e0",
                  background: "#fff", fontSize: 13, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemove(removeConfirm)}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: 6, border: "none",
                  background: "#dc2626", color: "#fff", fontSize: 13,
                  fontWeight: 500, cursor: "pointer",
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
