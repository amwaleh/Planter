import React from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import App from "./App";
import CropKnowledgePage from "./pages/CropKnowledgePage";
import AssistantPage from "./pages/AssistantPage";
import FarmProjectsPage from "./pages/FarmProjectsPage";
import LandPage from "./pages/LandPage";
import LivestockPage from "./pages/LivestockPage";
import WaterPage from "./pages/WaterPage";
import { currentAppPath } from "./routing";
import { AuthProvider } from "./auth";

const path = currentAppPath();
const page =
  path === "/farm-projects" ? (
    <FarmProjectsPage />
  ) : path === "/crop-knowledge" ? (
    <CropKnowledgePage />
  ) : path === "/water" ? (
    <WaterPage />
  ) : path === "/land" ? (
    <LandPage />
  ) : path === "/livestock" ? (
    <LivestockPage />
  ) : path === "/assistant" ? (
    <AssistantPage />
  ) : (
    <App />
  );

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>{page}</AuthProvider>
  </React.StrictMode>,
);
