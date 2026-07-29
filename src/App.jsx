import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import Tasks from "./components/Tasks";
import Wiki from "./components/Wiki";
import WhiteboardView from "./components/Whiteboard";
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
  const [activeList, setActiveList] = useState(null);
  const [openArticleId, setOpenArticleId] = useState(null);
  const [activeWhiteboard, setActiveWhiteboard] = useState(null);
  const [newDocFolderId, setNewDocFolderId] = useState(null);
  const [newDocSpaceId, setNewDocSpaceId] = useState(null);
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
      // Order by sort_order client-side (falls back to created_at) so a
      // missing sort_order column can never break loading.
      const byOrder = (a, b) =>
        (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity) ||
        new Date(a.created_at) - new Date(b.created_at);
      const cleaned = data
        .map((space) => ({
          ...space,
          folders: (space.folders || []).filter((f) => !f.deleted_at).sort(byOrder),
        }))
        .sort(byOrder);
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
  const [accessRules, setAccessRules] = useState({
    restrictedSpaces: new Set(), allowedSpaces: new Set(),
    restrictedFolders: new Set(), allowedFolders: new Set(),
  });

  useEffect(() => {
    if (user) fetchTaskCounts();
  }, [user, spaces]);

  useEffect(() => {
    if (profile && profile.role !== "admin") fetchAccessRules(profile);
    else if (profile?.role === "admin") setAccessRules({ restrictedSpaces: new Set(), allowedSpaces: new Set(), restrictedFolders: new Set(), allowedFolders: new Set() });
  }, [profile?.id]);

  async function fetchAccessRules(currentProfile) {
    const [{ data: spaceRules }, { data: folderRules }] = await Promise.all([
      supabase.from("space_access").select("space_id, profile_id"),
      supabase.from("folder_access").select("folder_id, profile_id"),
    ]);
    const pid = currentProfile?.id;
    setAccessRules({
      restrictedSpaces: new Set((spaceRules || []).map((r) => r.space_id)),
      allowedSpaces: new Set((spaceRules || []).filter((r) => r.profile_id === pid).map((r) => r.space_id)),
      restrictedFolders: new Set((folderRules || []).map((r) => r.folder_id)),
      allowedFolders: new Set((folderRules || []).filter((r) => r.profile_id === pid).map((r) => r.folder_id)),
    });
  }

  async function fetchTaskCounts() {
    if (!spaces.length) return;

    const { data: listsData } = await supabase
      .from("lists")
      .select("id, folder_id, space_id")
      .is("deleted_at", null);
    const allLists = listsData || [];

    const allFolders = spaces.flatMap((s) => (s.folders || []).map((f) => ({ id: f.id, space_id: s.id })));

    // Run count queries per list, per folder (direct tasks only), per space (direct tasks only)
    const [listResults, folderResults, spaceResults] = await Promise.all([
      Promise.all(
        allLists.map((l) =>
          supabase.from("tasks").select("*", { count: "exact", head: true })
            .eq("list_id", l.id).is("deleted_at", null)
            .then(({ count }) => ({ ...l, count: count || 0 }))
        )
      ),
      Promise.all(
        allFolders.map((f) =>
          supabase.from("tasks").select("*", { count: "exact", head: true })
            .eq("folder_id", f.id).is("list_id", null).is("deleted_at", null)
            .then(({ count }) => ({ ...f, count: count || 0 }))
        )
      ),
      Promise.all(
        spaces.map((s) =>
          supabase.from("tasks").select("*", { count: "exact", head: true })
            .eq("space_id", s.id).is("folder_id", null).is("list_id", null).is("deleted_at", null)
            .then(({ count }) => ({ id: s.id, count: count || 0 }))
        )
      ),
    ]);

    const counts = {};
    // Lists: count directly, roll up to folder and space
    listResults.forEach(({ id, folder_id, space_id, count }) => {
      if (!count) return;
      counts[id] = (counts[id] || 0) + count;
      if (folder_id) counts[folder_id] = (counts[folder_id] || 0) + count;
      if (space_id) counts[space_id] = (counts[space_id] || 0) + count;
    });
    // Folders: direct tasks (no list), roll up to space
    folderResults.forEach(({ id, space_id, count }) => {
      if (!count) return;
      counts[id] = (counts[id] || 0) + count;
      if (space_id) counts[space_id] = (counts[space_id] || 0) + count;
    });
    // Spaces: direct tasks (no folder, no list)
    spaceResults.forEach(({ id, count }) => {
      if (count) counts[id] = (counts[id] || 0) + count;
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
    setActiveList(null);
    setView("tasks");
    localStorage.setItem("abc_view", "tasks");
    localStorage.setItem("abc_space_id", space.id);
    localStorage.removeItem("abc_folder_id");
  }

  function handleFolderSelect(space, folder) {
    setActiveSpace(space);
    setActiveFolder(folder);
    setActiveList(null);
    setView("tasks");
    localStorage.setItem("abc_view", "tasks");
    localStorage.setItem("abc_space_id", space.id);
    localStorage.setItem("abc_folder_id", folder.id);
  }

  function handleListSelect(space, folder, list) {
    setActiveSpace(space);
    setActiveFolder(folder);
    setActiveList(list);
    setView("tasks");
    localStorage.setItem("abc_view", "tasks");
    localStorage.setItem("abc_space_id", space.id);
    localStorage.setItem("abc_folder_id", folder.id);
  }

  function handleNavigate(v) {
    if (typeof v === "string" && v.startsWith("wiki:")) {
      const articleId = v.slice(5);
      setOpenArticleId(articleId);
      setNewDocFolderId(null);
      setActiveWhiteboard(null);
      setView("wiki");
      localStorage.setItem("abc_view", "wiki");
      setActiveSpace(null);
      setActiveFolder(null);
      return;
    }
    // "doc-new:folderId:spaceId" — open Wiki in create mode linked to folder
    if (typeof v === "string" && v.startsWith("doc-new:")) {
      const [, fid, sid] = v.split(":");
      setNewDocFolderId(fid);
      setNewDocSpaceId(sid);
      setOpenArticleId(null);
      setActiveWhiteboard(null);
      setView("wiki");
      localStorage.setItem("abc_view", "wiki");
      setActiveSpace(null);
      setActiveFolder(null);
      return;
    }
    setOpenArticleId(null);
    setNewDocFolderId(null);
    setActiveWhiteboard(null);
    setView(v);
    localStorage.setItem("abc_view", v);
    if (v !== "tasks") {
      localStorage.removeItem("abc_space_id");
      localStorage.removeItem("abc_folder_id");
      setActiveSpace(null);
      setActiveFolder(null);
      setActiveList(null);
    }
  }

  function handleWhiteboardSelect(wb) {
    setActiveWhiteboard(wb);
    setView("whiteboard");
    setActiveSpace(null);
    setActiveFolder(null);
    setActiveList(null);
    setOpenArticleId(null);
    setNewDocFolderId(null);
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
        activeList={activeList}
        activeWhiteboard={activeWhiteboard}
        view={view}
        profile={profile}
        onNavigate={handleNavigate}
        onSpaceSelect={handleSpaceSelect}
        onFolderSelect={handleFolderSelect}
        onListSelect={handleListSelect}
        onWhiteboardSelect={handleWhiteboardSelect}
        taskCounts={taskCounts}
        onRefreshTaskCounts={fetchTaskCounts}
        accessRules={accessRules}
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
            activeList={activeList}
            profile={profile}
            onRefreshSpaces={fetchSpaces}
          />
        )}
        {view === "wiki" && (
          <Wiki
            profile={profile}
            openArticleId={openArticleId}
            newDocFolderId={newDocFolderId}
            newDocSpaceId={newDocSpaceId}
            spaces={spaces}
            onDocCreated={() => { setNewDocFolderId(null); setNewDocSpaceId(null); }}
          />
        )}
        {view === "whiteboard" && activeWhiteboard && (
          <WhiteboardView
            whiteboard={activeWhiteboard}
            profile={profile}
            onBack={() => { setView("tasks"); setActiveWhiteboard(null); }}
          />
        )}
        {view === "mytasks" && <MyTasks profile={profile} />}
        {view === "settings" && profile?.role === "admin" && (
          <Settings currentUser={user} profile={profile} spaces={spaces} onAccessChanged={() => fetchAccessRules(profile)} />
        )}
      </main>
    </div>
  );
}
