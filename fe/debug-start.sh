#!/bin/bash

# Debug startup script for BargAIner
# This script helps diagnose why the app won't start

echo "=========================================="
echo "BargAIner Debug Startup Script"
echo "=========================================="
echo ""

# Check system info
echo "1. System Information:"
echo "   Platform: $(uname -s)"
echo "   Architecture: $(arch)"
echo "   macOS Version: $(sw_vers -productVersion)"
echo ""

# Check Node and npm
echo "2. Node & npm:"
echo "   Node version: $(node --version)"
echo "   npm version: $(npm --version)"
echo ""

# Check if node_modules exists
echo "3. Dependencies:"
if [ -d "node_modules" ]; then
    echo "   ✓ node_modules exists"

    # Check electron
    if [ -d "node_modules/electron" ]; then
        echo "   ✓ electron installed"
        ELECTRON_VERSION=$(npm list electron --depth=0 2>/dev/null | grep electron@ | cut -d@ -f2)
        echo "   Electron version: $ELECTRON_VERSION"
    else
        echo "   ✗ electron NOT found"
        echo "   Run: npm install"
        exit 1
    fi
else
    echo "   ✗ node_modules NOT found"
    echo "   Run: npm install"
    exit 1
fi
echo ""

# Check for port conflicts
echo "4. Checking for port conflicts:"
PORT_5173=$(lsof -ti:5173 2>/dev/null)
if [ -n "$PORT_5173" ]; then
    echo "   ⚠ Port 5173 is in use by process: $PORT_5173"
    echo "   You may need to kill it: kill -9 $PORT_5173"
else
    echo "   ✓ Port 5173 is available"
fi
echo ""

# Check permissions
echo "5. Checking macOS Permissions:"
echo "   Note: You may need to grant permissions manually in System Settings"
echo "   - Screen Recording (for system audio)"
echo "   - Microphone (for mic audio)"
echo "   - Accessibility (for always-on-top window)"
echo ""

# Run the app with enhanced logging
echo "6. Starting Electron app with enhanced logging..."
echo "   Press Ctrl+C to stop"
echo "=========================================="
echo ""

# Set environment variables for more verbose output
export ELECTRON_ENABLE_LOGGING=1
export DEBUG=electron*

# Run the app
npm run dev
