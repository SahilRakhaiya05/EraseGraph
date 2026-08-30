import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionDock } from "./components/ActionDock";
import { ActivityRail } from "./components/ActivityRail";
import { AgentConsole } from "./components/AgentConsole";
import { AppHeader } from "./components/AppHeader";
import { DataGraph } from "./components/DataGraph";
import { LandingPage } from "./components/LandingPage";
import { RequestRail } from "./components/RequestRail";
import { WorkspaceCommandBar } from "./components/WorkspaceCommandBar";
import { useMissionState } from "./hooks/useMissionState";

export default function App() {
  const { state, connection, error, isResetting, refresh, reset } = useMissionState();
  const [workspaceOpen, setWorkspaceOpen] = useState(() => window.location.hash === "#workspace");
  const [agentOpen, setAgentOpen] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  useEffect(() => {
    const syncView = () => {
      const nextWorkspaceOpen = window.location.hash === "#workspace";
      setWorkspaceOpen(nextWorkspaceOpen);
      if (!nextWorkspaceOpen) setAgentOpen(false);
    };
    window.addEventListener("hashchange", syncView);
    window.addEventListener("popstate", syncView);
    return () => {
      window.removeEventListener("hashchange", syncView);
      window.removeEventListener("popstate", syncView);
    };
  }, []);

  const openWorkspace = () => {
    if (window.location.hash !== "#workspace") window.history.pushState(null, "", "#workspace");
    setWorkspaceOpen(true);
  };

  const openAgent = () => {
    openWorkspace();
    setAgentOpen(true);
  };

  const openLanding = () => {
    setAgentOpen(false);
    window.history.pushState(null, "", "#top");
    setWorkspaceOpen(false);
  };

  if (!workspaceOpen) {
    return (
      <LandingPage
        state={state}
        connection={connection}
        error={error}
        onLaunch={openWorkspace}
        onLaunchAgent={openAgent}
        onRefresh={refresh}
      />
    );
  }

  return (
    <div className="app-shell">
      <AppHeader
        connection={connection}
        isResetting={isResetting}
        onBack={openLanding}
        onReset={() => void reset()}
      />
      <WorkspaceCommandBar
        state={state}
        onOpenAgent={openAgent}
        onRefresh={refresh}
      />
      <main className="mission-layout">
        <RequestRail state={state} />
        <div className="mission-main">
          <DataGraph state={state} />
          <ActionDock state={state} onOpenAgent={() => setAgentOpen(true)} />
        </div>
        <ActivityRail state={state} />
      </main>

      {(connection === "preview" || connection === "stale") && error && !noticeDismissed && (
        <div className="preview-notice" role="status">
          <AlertTriangle size={16} />
          <span>
            <strong>{connection === "stale" ? "Showing the last confirmed live snapshot." : "Showing the safe preview seed."}</strong>{" "}
            Reconnect the control plane on port 8787 before making a decision.
          </span>
          <button type="button" onClick={() => setNoticeDismissed(true)} aria-label="Dismiss preview notice"><X size={15} /></button>
        </div>
      )}

      {agentOpen && <AgentConsole open onClose={() => setAgentOpen(false)} />}
    </div>
  );
}
