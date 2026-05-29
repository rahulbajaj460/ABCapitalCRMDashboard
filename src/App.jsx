import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import Tasks from "./components/Tasks";
import Wiki from "./components/Wiki";
import Login from "./components/Login";
import Settings from "./components/Settings";
import "./App.css";

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState("dashboard");
  const [activeSpace, setActiveSpace] = useState(null);
  const [activeFolder, setActiveFolder] = useState(null);
  const [spaces, setSpaces] = useState([]);

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

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (data) setProfile(data);
  }

  async function fetchSpaces() {
    const { data } = await supabase
      .from("spaces")
      .select("*, folders(*), space_statuses(*), space_fields(*)")
      .order("created_at");
    if (data) {
      setSpaces(data);
      if (activeSpace) {
        const updated = data.find((s) => s.id === activeSpace.id);
        if (updated) setActiveSpace(updated);
      }
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
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
  }

  function handleFolderSelect(space, folder) {
    setActiveSpace(space);
    setActiveFolder(folder);
    setView("tasks");
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
        onNavigate={setView}
        onSpaceSelect={handleSpaceSelect}
        onFolderSelect={handleFolderSelect}
        onSpaceCreated={fetchSpaces}
        onLogout={handleLogout}
      />
      <main className="app-main">
        {view === "dashboard" && (
          <Dashboard
            spaces={spaces}
            profile={profile}
            onNavigate={setView}
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
        {view === "wiki" && <Wiki spaces={spaces} />}
        {view === "settings" && profile?.role === "admin" && (
          <Settings currentUser={user} profile={profile} />
        )}
      </main>
    </div>
  );
}
