import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import Tasks from "./components/Tasks";
import Wiki from "./components/Wiki";
import Login from "./components/Login";
import Settings from "./components/Settings";
import MyTasks from "./components/MyTasks";
import "./App.css";

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState(
    () => localStorage.getItem("abc_view") || "dashboard",
  );
  const [activeSpace, setActiveSpace] = useState(null);
  const [activeFolder, setActiveFolder] = useState(null);
  const [openArticleId, setOpenArticleId] = useState(null);
  const [spaces, setSpaces] = useState([]);
  const [pendingSpaceId, setPendingSpaceId] = useState(
    () => localStorage.getItem("abc_space_id") || null,
  );
  const [pendingFolderId, setPendingFolderId] = useState(
    () => localStorage.getItem("abc_folder_id") || null,
  );
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    return parseInt(localStorage.getItem("abc_sidebar_width") || "240");
  });
  const isSidebarResizing = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      }
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) fetchSpaces();
  }, [user]);

  // Restore active space and folder after spaces are loaded
  useEffect(() => {
    if (spaces.length === 0) return;
    if (pendingSpaceId) {
      const space = spaces.find((s) => s.id === pendingSpaceId);
      if (space) {
        setActiveSpace(space);
        if (pendingFolderId) {
          const folder = space.folders?.find((f) => f.id === pendingFolderId);
          if (folder) setActiveFolder(folder);
        }
      }
      setPendingSpaceId(null);
      setPendingFolderId(null);
    }
  }, [spaces]);

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (data) setProfile(data);
  }

  async function fetchSpaces() {
    // Exclude soft-deleted spaces and folders so trashed items disappear
    // from the sidebar immediately, without waiting for a hard delete.
    const { data, error } = await supabase
      .from("spaces")
      .select(
        `
      *,
      space_statuses(*),
      space_fields(*),
      folders!folders_space_id_fkey(
        *,
        space_statuses(*),
        space_fields(*)
      )
    `,
      )
      .is("deleted_at", null)
      .order("created_at");

    if (data) {
      // Also filter out any soft-deleted folders that came through the
      // nested select (belt-and-braces in case the FK filter above doesn't
      // apply server-side depending on your Postgres/PostgREST version).
      const cleaned = data.map((space) => ({
        ...space,
        folders: (space.folders || []).filter((f) => !f.deleted_at),
      }));
      setSpaces(cleaned);
      if (activeSpace) {
        const updated = cleaned.find((s) => s.id === activeSpace.id);
        if (updated) setActiveSpace(updated);
        else {
          // The active space was just trashed — back out to dashboard
          setActiveSpace(null);
          setActiveFolder(null);
        }
      }
      if (activeFolder) {
        const stillExists = cleaned
          .find((s) => s.id === activeSpace?.id)
          ?.folders?.find((f) => f.id === activeFolder.id);
        if (!stillExists) setActiveFolder(null);
      }
    }
  }

  const [taskCounts, setTaskCounts] = useState({});

  useEffect(() => {
    if (user) fetchTaskCounts();
  }, [user, spaces]);

  async function fetchTaskCounts() {
    const { data } = await supabase
      .from("tasks")
      .select("space_id, folder_id")
      .is("deleted_at", null);
    if (!data) return;
    const counts = {};
    data.forEach((t) => {
      counts[t.space_id] = (counts[t.space_id] || 0) + 1;
      if (t.folder_id) {
        counts[t.folder_id] = (counts[t.folder_id] || 0) + 1;
      }
    });
    setTaskCounts(counts);
  }

  function startSidebarResize(e) {
    isSidebarResizing.current = true;
    document.addEventListener("mousemove", onSidebarMouseMove);
    document.addEventListener("mouseup", stopSidebarResize);
    e.preventDefault();
  }

  function onSidebarMouseMove(e) {
    if (!isSidebarResizing.current) return;
    const newWidth = e.clientX;
    if (newWidth >= 180 && newWidth <= 400) {
      setSidebarWidth(newWidth);
      localStorage.setItem("abc_sidebar_width", newWidth);
    }
  }

  function stopSidebarResize() {
    isSidebarResizing.current = false;
    document.removeEventListener("mousemove", onSidebarMouseMove);
    document.removeEventListener("mouseup", stopSidebarResize);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    localStorage.removeItem("abc_view");
    localStorage.removeItem("abc_space_id");
    localStorage.removeItem("abc_folder_id");
    setUser(null);
    setProfile(null);
    setView("dashboard");
    setActiveSpace(null);
    setActiveFolder(null);
  }

  function handleSpaceSelect(space) {
    setActiveSpace(space);
    setActiveFolder(null);
    setView("tasks");
    localStorage.setItem("abc_view", "tasks");
    localStorage.setItem("abc_space_id", space.id);
    localStorage.removeItem("abc_folder_id");
  }

  function handleFolderSelect(space, folder) {
    setActiveSpace(space);
    setActiveFolder(folder);
    setView("tasks");
    localStorage.setItem("abc_view", "tasks");
    localStorage.setItem("abc_space_id", space.id);
    localStorage.setItem("abc_folder_id", folder.id);
  }

  function handleNavigate(v) {
    // Support "wiki:articleId" to open a specific article
    if (typeof v === "string" && v.startsWith("wiki:")) {
      const articleId = v.slice(5);
      setOpenArticleId(articleId);
      setView("wiki");
      localStorage.setItem("abc_view", "wiki");
      setActiveSpace(null);
      setActiveFolder(null);
      return;
    }
    setOpenArticleId(null);
    setView(v);
    localStorage.setItem("abc_view", v);
    if (v !== "tasks") {
      localStorage.removeItem("abc_space_id");
      localStorage.removeItem("abc_folder_id");
      setActiveSpace(null);
      setActiveFolder(null);
    }
  }

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f5f4",
        }}
      >
        <div style={{ fontSize: 14, color: "#888" }}>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return (
    <div className="app-layout">
      <Sidebar
        spaces={spaces}
        activeSpace={activeSpace}
        activeFolder={activeFolder}
        view={view}
        profile={profile}
        onNavigate={handleNavigate}
        onSpaceSelect={handleSpaceSelect}
        onFolderSelect={handleFolderSelect}
        taskCounts={taskCounts}
        onSpaceCreated={fetchSpaces}
        onLogout={handleLogout}
        width={sidebarWidth}
      />
      {/* Resize handle */}
      <div
        onMouseDown={startSidebarResize}
        style={{
          width: 4,
          flexShrink: 0,
          background: "transparent",
          cursor: "col-resize",
          transition: "background 0.15s",
          zIndex: 10,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#bfdbfe")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        title="Drag to resize sidebar"
      />
      <main className="app-main">
        {view === "dashboard" && (
          <Dashboard
            spaces={spaces}
            profile={profile}
            onNavigate={handleNavigate}
            onSpaceSelect={handleSpaceSelect}
          />
        )}
        {view === "tasks" && (
          <Tasks
            spaces={spaces}
            activeSpace={activeSpace}
            activeFolder={activeFolder}
            profile={profile}
            onRefreshSpaces={fetchSpaces}
          />
        )}
        {view === "wiki" && <Wiki profile={profile} openArticleId={openArticleId} />}
        {view === "mytasks" && <MyTasks profile={profile} />}
        {view === "settings" && profile?.role === "admin" && (
          <Settings currentUser={user} profile={profile} />
        )}
      </main>
    </div>
  );
}
