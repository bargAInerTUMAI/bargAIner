import { app, shell, BrowserWindow, ipcMain, screen, desktopCapturer, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

function createWindow(): void {
  console.log('Creating window...')
  const { width } = screen.getPrimaryDisplay().workAreaSize
  console.log('Screen width:', width)

  // Create the browser window - fullscreen with transparent background
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  const baseOptions: Electron.BrowserWindowConstructorOptions = {
    width: screenWidth,
    height: screenHeight,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  }

  console.log('Creating BrowserWindow with options:', baseOptions)
  const mainWindow = new BrowserWindow(baseOptions)
  console.log('BrowserWindow created successfully')

  // Keep window visible across macOS spaces/desktops
  if (process.platform === 'darwin') {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  mainWindow.on('ready-to-show', () => {
    console.log('Window ready to show')
    mainWindow.show()
    console.log('Window shown')
    // Ensure the window is click-through by default; renderer will toggle when hovered
    // forward:true allows the window to still receive mousemove/hover events
    try {
      mainWindow.setIgnoreMouseEvents(true, { forward: true })
      console.log('Set ignore mouse events')
    } catch (error) {
      console.error('Failed to set ignore mouse events:', error)
    }
  })

  // Add error handlers
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone. Reason:', details.reason, 'Exit code:', details.exitCode)
  })

  mainWindow.on('unresponsive', () => {
    console.error('Window became unresponsive')
  })

  mainWindow.on('close', () => {
    console.log('Window closing')
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    console.log('Loading dev URL:', process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']).catch((err) => {
      console.error('Failed to load URL:', err)
    })
  } else {
    const htmlPath = join(__dirname, '../renderer/index.html')
    console.log('Loading HTML file:', htmlPath)
    mainWindow.loadFile(htmlPath).catch((err) => {
      console.error('Failed to load file:', err)
    })
  }

  // Open DevTools in development
  if (is.dev) {
    console.log('Opening DevTools...')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  // Handle set-ignore-mouse IPC
  ipcMain.on('set-ignore-mouse', (event, ignore) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.setIgnoreMouseEvents(ignore, { forward: true })
    }
  })

}

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason)
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app
  .whenReady()
  .then(() => {
    console.log('App ready, platform:', process.platform, 'arch:', process.arch)

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

    // Handle desktop capturer request for system audio
    ipcMain.handle('get-desktop-sources', async () => {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 0, height: 0 }
      })
      return sources.map((source) => ({
        id: source.id,
        name: source.name,
        displayId: source.display_id
      }))
    })

    // Set up display media request handler for system audio capture
    session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 0, height: 0 }
        })
        // Use the first screen source for audio capture
        if (sources.length > 0) {
          // Pass the DesktopCapturerSource directly (not a plain object)
          callback({ video: sources[0] as Electron.Video, audio: 'loopback' })
        } else {
          console.warn('No screen sources found for system audio capture')
          callback({})
        }
      } catch (error) {
        console.error('Error getting desktop sources:', error)
        callback({})
      }
    })

    createWindow()

    app.on('activate', function () {
      console.log('App activated')
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  }).catch((error) => {
    console.error('Failed to initialize app:', error)
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
