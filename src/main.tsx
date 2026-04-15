import { createRoot } from "react-dom/client";
import { migrateAllLegacyStorage } from "@/lib/storageMigrate";
import App from "./App.tsx";
import "./index.css";

migrateAllLegacyStorage();

createRoot(document.getElementById("root")!).render(<App />);
