import { ElectronAPI } from '@electron-toolkit/preload'

interface DesktopSource {
  id: string
  name: string
  displayId: string
}

declare global {
  interface Window {
    electron: ElectronAPI & {
      env?: {
        BACKEND_URL?: string
      }
      invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>
      getDesktopSources?: () => Promise<DesktopSource[]>
    }
    api: unknown
  }
}
