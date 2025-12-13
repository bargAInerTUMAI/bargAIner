import { app, shell, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

const USE_MOCK_MODE = true

function createWindow(): void {
  const { width } = screen.getPrimaryDisplay().workAreaSize

  // Create the browser window.
  const WIN_W = 420
  const WIN_H = 120
  // Build single options object (no platform-specific visuals)
  const baseOptions: Electron.BrowserWindowConstructorOptions = {
    width: WIN_W,
    height: WIN_H,
    // center horizontally and sit near the top (under webcam)
    x: Math.round((width - WIN_W) / 2),
    y: 10,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    hasShadow: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  }
  const mainWindow = new BrowserWindow(baseOptions)

  // Keep window visible across macOS spaces/desktops
  if (process.platform === 'darwin') {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    // Ensure the window is click-through by default; renderer will toggle when hovered
    // forward:true allows the window to still receive mousemove/hover events
    try {
      mainWindow.setIgnoreMouseEvents(true, { forward: true })
    } catch {
      // ignore if the platform or electron version doesn't support options
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Handle set-ignore-mouse IPC
  ipcMain.on('set-ignore-mouse', (event, ignore) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.setIgnoreMouseEvents(ignore, { forward: true })
    }
  })

  // Provide window bounds to renderer on request
  ipcMain.handle('get-window-bounds', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    return win.getBounds()
  })

  // Resize window to given width/height
  ipcMain.on('set-window-size', (event, width: number, height: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && typeof width === 'number' && typeof height === 'number') {
      // enforce minimum sizes
      const w = Math.max(200, Math.round(width))
      const h = Math.max(60, Math.round(height))
      win.setSize(w, h)
    }
  })

  // Mock mode: simulate AI suggestions
  if (USE_MOCK_MODE) {
    const fakeObjections = [
      "It's too expensive",
      'Send me an email',
      'I need to think about it',
      'Can you give me a discount?',
      "I'm not interested right now"
    ]
    let index = 0
    setInterval(() => {
      mainWindow.webContents.send('ai-suggestion', fakeObjections[index])
      index = (index + 1) % fakeObjections.length
    }, 5000)
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
