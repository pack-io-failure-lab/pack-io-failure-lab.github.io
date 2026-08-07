import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PackIoFailureLab from "../app/page";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("GitHub Pages root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <PackIoFailureLab />
  </StrictMode>,
);
