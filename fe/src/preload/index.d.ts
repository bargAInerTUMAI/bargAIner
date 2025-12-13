import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI & {
      env?: {
        BACKEND_URL?: string
      }
    }
    api: unknown
  }
}
