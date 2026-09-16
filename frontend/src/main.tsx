import React from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import App from "./App";
import CropKnowledgePage from "./pages/CropKnowledgePage";
import FarmProjectsPage from "./pages/FarmProjectsPage";

const path = window.location.pathname.replace(/\/+$/, "") || "/";
const page =
  path === "/farm-projects" ? (
    <FarmProjectsPage />
  ) : path === "/crop-knowledge" ? (
    <CropKnowledgePage />
  ) : (
    <App />
  );

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {page}
  </React.StrictMode>,
);
