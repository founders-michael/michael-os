export default function WorkspaceLoading() {
  return (
    <main className="workspace-route-loading" aria-busy="true" aria-label="Loading workspace page">
      <div className="workspace-loading-content" role="status" aria-live="polite">
        <span className="workspace-loading-kicker">MICHAELOS</span>
        <span className="workspace-loading-title" />
        <span className="workspace-loading-line" />
        <span className="workspace-loading-card" />
      </div>
    </main>
  );
}
