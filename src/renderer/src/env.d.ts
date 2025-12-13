/// <reference types="vite/client" />

declare global {
  interface Window {
    electron: {
      send: (channel: string, ...args: unknown[]) => void
      on: (channel: string, listener: (...args: unknown[]) => void) => void
      off: (channel: string, listener: (...args: unknown[]) => void) => void
      process: {
        versions: NodeJS.ProcessVersions
      }
    }
  }
}

export {}
