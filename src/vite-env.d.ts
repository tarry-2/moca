/// <reference types="vite/client" />

// electron/preload.ts 가 contextBridge 로 노출하는 API 타입.
interface ElectronAPI {
  getBotStatus: () => Promise<"online" | "offline">;
  getAllBotStatus: () => Promise<Record<string, "online" | "offline">>;
  restartBots: (name?: string) => Promise<unknown>;
  getBotSecret: () => Promise<string>;
  registerUser: (userId: string) => Promise<unknown>;
  unregisterUser: (userId: string) => Promise<unknown>;
  openPreview: (html: string) => Promise<unknown>;
  saveReportPdf: (html: string, filename: string) => Promise<unknown>;
  flowLaunchChrome: (slot?: number) => Promise<unknown>;
  flowStatus: (slot?: number) => Promise<unknown>;
  checkAppUpdate: () => Promise<unknown>;
  openAppUpdate: (url: string) => Promise<unknown>;
  openLogFolder: () => Promise<unknown>;
  readBotLog: () => Promise<string>;
  getAppVersion: () => Promise<string>;
  keepAwake: (on: boolean) => Promise<unknown>;
  focusApp: () => Promise<unknown>;
}

interface Window {
  electron?: ElectronAPI;
}
