import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import IslandApp from "./island/IslandApp";
import "@fontsource-variable/geist";
import "@fontsource/ubuntu-mono/400.css";
import "@fontsource/ubuntu-mono/700.css";
import "./styles.css";

// 同一 bundle 按窗口 URL hash 分流：island 窗口渲染刘海通知
const isIsland = window.location.hash.startsWith("#/island");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isIsland ? <IslandApp /> : <App />}</React.StrictMode>,
);
