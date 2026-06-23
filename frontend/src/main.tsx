import React from "react";
import ReactDOM from "react-dom/client";
import { XProvider } from "@ant-design/x";
import App from "./App";
import locale from "./_utils/local";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <XProvider locale={locale}>
      <App />
    </XProvider>
  </React.StrictMode>,
);
