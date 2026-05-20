import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const root = document.getElementById("root")!;
const app = <App />;
/* StrictMode double-mounts effects and was opening 3+ WebSockets → MOD ECONNRESET */
createRoot(root).render(import.meta.env.DEV ? app : <StrictMode>{app}</StrictMode>);
