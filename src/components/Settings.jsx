import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export default function Settings({ currentUser }) {
  const [members, setMembers] = useState([]);
  const [msg, setMsg] = useState("");

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

  async function updateRole(userId, newRole) {
    if (userId === currentUser.id) return;
    await supabase.from("profiles").update({ role: newRole }).eq("id", userId);
    setMsg("✅ Role updated.");
    fetchMembers();
    setTimeout(() => setMsg(""), 3000);
  }

  function getInitials(name) {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">Manage your team</div>
        </div>
      </div>

      <div className="content-area">
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 8,
            padding: "14px 18px",
            marginBottom: 24,
            fontSize: 13,
            color: "#1e40af",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            ℹ️ How to add a new team member
          </div>
          <ol style={{ paddingLeft: 18, lineHeight: 2.2 }}>
            <li>
              Go to <strong>supabase.com</strong> → your project →{" "}
              <strong>Authentication → Users → Add user</strong>
            </li>
            <li>
              Enter their email and a temporary password, tick{" "}
              <strong>Auto Confirm User</strong>
            </li>
            <li>
              Run in SQL Editor:
              <div
                style={{
                  background: "#dbeafe",
                  padding: "6px 10px",
                  borderRadius: 4,
                  marginTop: 4,
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
              >
                update profiles set full_name = 'Their Name', role = 'member'
                where email = 'their@email.com';
              </div>
            </li>
            <li>Share their email + password via WhatsApp</li>
          </ol>
        </div>

        {msg && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 6,
              marginBottom: 16,
              fontSize: 13,
              background: "#f0fdf4",
              color: "#15803d",
              border: "1px solid #bbf7d0",
            }}
          >
            {msg}
          </div>
        )}

        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          Team members ({members.length})
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e8e8e8",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <table className="task-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: member.avatar_color || "#378ADD",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {getInitials(member.full_name)}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                          {member.full_name || "—"}
                        </div>
                        {member.id === currentUser.id && (
                          <div style={{ fontSize: 11, color: "#888" }}>You</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 13, color: "#555" }}>
                    {member.email}
                  </td>
                  <td>
                    {member.id === currentUser.id ? (
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          fontWeight: 500,
                        }}
                      >
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
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
