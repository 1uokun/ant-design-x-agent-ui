import "normalize.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import { XProvider } from "@ant-design/x";
import App from "./App";
import locale from "./_utils/local";
import { ensureChatRootPath } from "./utils/route";

ensureChatRootPath();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <XProvider locale={locale}>
      <ConfigProvider locale={locale}>
        <App />
      </ConfigProvider>
    </XProvider>
  </React.StrictMode>,
);
