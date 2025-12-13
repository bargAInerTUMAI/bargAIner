import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// Custom APIs for renderer
const api = {
  send: (channel: string, ...args: unknown[]): void => ipcRenderer.send(channel, ...args),
  on: (channel: string, listener: (...args: unknown[]) => void): void => {
    // Wrap to hide the IpcRendererEvent and forward only the args
    const wrapped = (_event: IpcRendererEvent, ...args: unknown[]): void => listener(...args)
    // Store reference so it can be removed if needed
    // @ts-ignore - attachMap: attaching a Map on ipcRenderer for wrapped listeners cleanup
    if (!ipcRenderer.__wrappedListeners) ipcRenderer.__wrappedListeners = new Map()
    // @ts-ignore - setMap: store wrapped listener reference for later removal
    ipcRenderer.__wrappedListeners.set(listener, wrapped)
    ipcRenderer.on(channel, wrapped)
  },
  off: (channel: string, listener: (...args: unknown[]) => void): void => {
    // Remove the wrapped listener if we created one
    // @ts-ignore - getMap: retrieve wrapped listener reference if created
    const wrapped = ipcRenderer.__wrappedListeners?.get(listener)
    if (wrapped) {
      ipcRenderer.removeListener(channel, wrapped)
      // @ts-ignore - deleteMap: remove stored wrapped listener
      ipcRenderer.__wrappedListeners.delete(listener)
    } else {
      ipcRenderer.removeListener(channel, listener as unknown as (...args: unknown[]) => void)
    }
  },
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(channel, ...args),
  process: {
    versions: process.versions
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = api
}
