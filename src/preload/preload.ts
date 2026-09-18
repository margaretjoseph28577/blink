import { contextBridge, ipcRenderer } from 'electron';

// Single generic bridge; typing lives in the renderer client (src/renderer/api/client.ts).
contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, payload: unknown) => ipcRenderer.invoke(channel, payload),
});
