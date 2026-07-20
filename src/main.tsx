import { createRoot } from "react-dom/client";
import { migrateAllLegacyStorage } from "@/lib/storageMigrate";
import App from "./App.tsx";
import "./index.css";

migrateAllLegacyStorage();

if (typeof window !== "undefined") {
  createRoot(document.getElementById("root")!).render(<App />);
} else {
  createRoot(document.getElementById("root")!).render(<App />);
}
