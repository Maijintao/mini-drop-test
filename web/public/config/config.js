// 运行时配置注入 — 在容器部署时由 envsubst 或启动脚本替换占位符
// 使用方式: 在 index.html 中于 main.tsx 之前加载本文件
// 代码中通过 window.__RUNTIME_CONFIG__.XXX 读取
window.__RUNTIME_CONFIG__ = {
  API_BASE_URL: '__API_BASE_URL__',   // 例如 /api/v1 或 https://api.example.com/api/v1
  WS_BASE_URL:  '__WS_BASE_URL__',    // 例如 wss://api.example.com/ws
  APP_TITLE:    '__APP_TITLE__',       // 自定义页面标题
};
