/// <reference types="vite/client" />

interface Window {
  config: {
    HOST_URL: string;
  };
  __RUNTIME_CONFIG__?: {
    API_BASE_URL?: string;
    WS_BASE_URL?: string;
    APP_TITLE?: string;
  };
}
