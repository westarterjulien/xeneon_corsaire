import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Studio from "./studio/Studio";
import "@fontsource-variable/inter";
import "./styles.css";
import "./studio/studio.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Studio />
  </StrictMode>,
);
