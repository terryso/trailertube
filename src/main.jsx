import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { api } from "./catalog.js";
import "./styles.css";

// Start the catalog manifest (every route) and, on playlist-backed routes,
// fast-lists.json too, before React mounts. Otherwise the first effect chain
// serializes both downloads behind hydration and delays the home swap.
api.warmHome(location.pathname === "/" || location.pathname === "/playlists" || location.pathname.startsWith("/p/"));

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
