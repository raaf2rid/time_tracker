const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("trackerApi", {
  getSnapshot: () => ipcRenderer.invoke("tracker:get-snapshot"),
  getDailySummary: (days) => ipcRenderer.invoke("tracker:get-daily-summary", days),
  getDashboard: (period, search) => ipcRenderer.invoke("tracker:get-dashboard", period, search),
  getHomeView: (day) => ipcRenderer.invoke("tracker:get-home-view", day),
  getDetailsView: (payload) => ipcRenderer.invoke("tracker:get-details-view", payload),
  exportData: (payload) => ipcRenderer.invoke("tracker:export", payload),
  getSettings: () => ipcRenderer.invoke("tracker:get-settings")
});
