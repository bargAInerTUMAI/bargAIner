# Troubleshooting Guide

## Issue: Electron App Won't Stay Open on MacBook Air M4

If the Electron app appears briefly in the dock but immediately disappears, follow these steps:

### Step 1: Check for Console Errors

When running `npm run dev`, look at the terminal output for any error messages. The app now has enhanced logging that will show:
- App initialization status
- Window creation status
- Any crash or load failures

### Step 2: Clear Node Modules and Rebuild

```bash
# Navigate to the fe folder
cd fe

# Remove node_modules and lock file
rm -rf node_modules package-lock.json

# Clean npm cache (optional but recommended)
npm cache clean --force

# Reinstall dependencies
npm install

# Try running again
npm run dev
```

### Step 3: Check Electron Binary for M4 Mac

The M4 MacBook Air uses ARM64 architecture. Make sure Electron is installed correctly:

```bash
# Check your architecture
arch

# Should output: arm64

# Rebuild electron for your architecture
npm rebuild electron
```

### Step 4: Try Building and Running the Built App

Sometimes dev mode has issues that don't appear in production builds:

```bash
# Build the app
npm run build

# Run the built app (macOS)
npm run build:mac

# Or build without packaging
npm run build:unpack
```

### Step 5: Check macOS Permissions

The app requires certain permissions on macOS:

1. **Screen Recording Permission** (for system audio capture)
   - Go to System Settings > Privacy & Security > Screen Recording
   - Make sure Electron or the app is allowed

2. **Microphone Permission**
   - Go to System Settings > Privacy & Security > Microphone
   - Make sure Electron or the app is allowed

3. **Accessibility** (sometimes needed for always-on-top windows)
   - Go to System Settings > Privacy & Security > Accessibility
   - Add the app if prompted

### Step 6: Check for Rosetta 2 Issues

If you're having compatibility issues, you might need Rosetta 2:

```bash
# Check if Rosetta is installed
/usr/bin/pgrep -q oahd && echo "Rosetta is installed" || echo "Rosetta is not installed"

# Install Rosetta if needed (though usually not necessary for ARM-native Electron)
softwareupdate --install-rosetta
```

### Step 7: Inspect DevTools Console

The app now automatically opens DevTools in development mode. Look for:
- Red errors in the console
- Failed network requests
- JavaScript exceptions

### Step 8: Check for Port Conflicts

The Vite dev server runs on a specific port. If another app is using it:

```bash
# Kill any process using port 5173 (default Vite port)
lsof -ti:5173 | xargs kill -9

# Then try running again
npm run dev
```

### Step 9: Try Running with Verbose Logging

```bash
# Enable verbose Electron logging
DEBUG=* npm run dev

# Or just Electron-specific logs
ELECTRON_ENABLE_LOGGING=1 npm run dev
```

### Step 10: Check Electron Version Compatibility

If all else fails, try using a different Electron version:

```bash
# Current version is ^39.2.6
# Try downgrading to a more stable version
npm install electron@^32.0.0 --save-dev

# Then rebuild
npm run build
npm run dev
```

## Common Issues and Solutions

### Issue: "App quit unexpectedly"

**Symptoms**: App closes immediately after launch with no window appearing.

**Solutions**:
1. Check for JavaScript errors in the main process (look at terminal output)
2. Try removing `transparent: true` temporarily from window options
3. Check if `alwaysOnTop` is causing issues with macOS window management

### Issue: Window appears but is invisible

**Symptoms**: App stays running but you can't see the window.

**Solutions**:
1. The window might be positioned off-screen. Try:
   ```typescript
   // Temporarily change window position in src/main/index.ts
   x: 100,
   y: 100,
   ```
2. Try removing `transparent: true` to see if transparency is the issue
3. Check if the window is hidden behind other windows (it should be `alwaysOnTop`)

### Issue: "Failed to load" error

**Symptoms**: Window appears but shows error page.

**Solutions**:
1. Make sure the Vite dev server is running (you should see two processes)
2. Check if `ELECTRON_RENDERER_URL` environment variable is set correctly
3. Try accessing the URL shown in terminal directly in a browser

### Issue: App works on your machine but not on M4 Mac

**Symptoms**: Different behavior on different machines.

**Possible causes**:
1. **Architecture difference**: Make sure electron is installed for arm64
2. **macOS version difference**: Check macOS version compatibility
3. **Permissions**: M4 Macs might have stricter security settings
4. **Node version**: Ensure both machines use the same Node version

```bash
# Check Node version
node --version

# Recommended: Use Node 18+ or 20+
# Consider using nvm to manage Node versions
```

## Debug Mode Testing

To get maximum debugging information:

1. Open `src/main/index.ts`
2. The app now has extensive logging enabled
3. Check terminal for messages like:
   - "Creating window..."
   - "BrowserWindow created successfully"
   - "Window ready to show"
   - "Window shown"

If any of these messages are missing, that's where the problem is occurring.

## Getting Help

If none of these solutions work, please provide:

1. **Full terminal output** from `npm run dev`
2. **DevTools console errors** (if window opens)
3. **macOS version**: Run `sw_vers`
4. **Node version**: Run `node --version`
5. **Architecture**: Run `arch`
6. **Electron version**: Run `npm list electron`

## Quick Test: Simplified Window

If nothing works, try this simplified test in `src/main/index.ts`:

```typescript
function createWindow(): void {
  // Simplest possible window
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: true,  // Show immediately
    frame: true,  // With frame
    transparent: false,  // Not transparent
    alwaysOnTop: false,  // Not always on top
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] || 'http://localhost:5173')
  mainWindow.webContents.openDevTools()
}
```

If this works, gradually add back the original options one by one to find the problematic setting.

## Known M4 Mac Issues

1. **Metal Graphics**: Some transparency effects might not work correctly with Metal backend
2. **Window Management**: `alwaysOnTop` + `transparent` + `frame: false` combination can be problematic
3. **Permissions**: Screen Recording permission is required for system audio capture

## Success Checklist

When the app runs correctly, you should see:
- ✅ Terminal shows "App ready, platform: darwin, arch: arm64"
- ✅ Terminal shows "BrowserWindow created successfully"
- ✅ Terminal shows "Window ready to show"
- ✅ Terminal shows "Window shown"
- ✅ DevTools window opens automatically
- ✅ Floating frosted glass card appears at the top center of screen
- ✅ Card shows "Listening..." or rotating suggestions
- ✅ Microphone button visible in bottom-right corner of card
