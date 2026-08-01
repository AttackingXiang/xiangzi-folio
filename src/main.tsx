import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./styles/themes.css";
import "./styles/design-system.css";

const DesignSystemDemo = lazy(() => import("./components/DesignSystemDemo").then(({ DesignSystemDemo: Demo }) => ({ default: Demo })));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {window.location.pathname === "/design-system" ? <Suspense fallback={<div className="design-demo-loading">Loading design system…</div>}><DesignSystemDemo /></Suspense> : <App />}
  </StrictMode>,
);
