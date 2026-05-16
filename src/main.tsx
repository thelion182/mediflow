import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { hasBackend, hydrateFromSupabase } from "./lib/sync";
import "./styles/theme.css";
import "./ui/ui.css";

function Root() {
  // Sin backend → listo de inmediato. Con backend → esperar hidratación.
  const [ready, setReady] = useState(!hasBackend);

  useEffect(() => {
    if (!hasBackend) return;
    hydrateFromSupabase().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div style={{
        display: "grid", placeItems: "center", height: "100vh",
        fontFamily: "system-ui, sans-serif", background: "var(--bg, #f8fafc)",
      }}>
        <div style={{ textAlign: "center", color: "#64748b" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚕</div>
          <div style={{ fontWeight: 700, fontSize: 17, color: "#1e293b", marginBottom: 6 }}>
            Mediflow
          </div>
          <div style={{ fontSize: 13 }}>Sincronizando datos...</div>
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
