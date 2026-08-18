/**
 * ============================================================================
 *  PRAMOCHAK MINECRAFT STUDIO LAUNCHER (TAURI RPC BACKEND WORKER)
 * ============================================================================
 *  @author    Maheshwar Hari Tripathi
 *  @copyright Copyright (c) 2026 Maheshwar Hari Tripathi. All rights reserved.
 *  @license   MIT License
 *  @website   https://github.com/maheshwarkibehan-hub/pramochak-mc-launcher
 *  @watermark PRAMOCHAK-SIDECAR-SECURE-ID: MHT-MC-SIDECAR-2026
 * ============================================================================
 */

const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { execSync } = require('child_process');

// 1. Mock Electron module
const handlers = {};
const onHandlers = {};

// Mock window object
const mockWindow = {
  webContents: {
    send: (channel, data) => {
      sendEvent(channel, data);
    },
    on: () => {},
    openDevTools: () => {}
  },
  on: () => {},
  once: () => {},
  loadFile: () => {},
  focus: () => {},
  minimize: () => {},
  isMaximized: () => false,
  unmaximize: () => {},
  maximize: () => {},
  close: () => {},
  show: () => {},
  hide: () => {}
};

function showOpenDialogWindows(title, filters) {
  let filterStr = "";
  if (filters && filters.length > 0) {
    filterStr = filters.map(f => `${f.name} (${f.extensions.map(e => '*.'+e).join(',')})|${f.extensions.map(e => '*.'+e).join(';')}`).join('|');
  }
  
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms;
    $dialog = New-Object System.Windows.Forms.OpenFileDialog;
    $dialog.Title = '${title}';
    ${filterStr ? `$dialog.Filter = '${filterStr}';` : ''}
    $dialog.ShowHelp = $false;
    $res = $dialog.ShowDialog();
    if ($res -eq 'OK') {
      Write-Output $dialog.FileName;
    }
  `.trim().replace(/\r?\n/g, ' ');
  
  try {
    const stdout = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"')}"`);
    const filePath = stdout.toString().trim();
    if (filePath) {
      return { canceled: false, filePaths: [filePath] };
    }
  } catch (err) {
    console.error('Failed to open powershell file dialog:', err);
  }
  return { canceled: true, filePaths: [] };
}

const electronMock = {
  app: {
    getPath: (name) => {
      if (name === 'userData') {
        return path.join(process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME), 'PramochakMC');
      }
      return '.';
    },
    whenReady: () => Promise.resolve(),
    on: () => {},
    quit: () => process.exit(0)
  },
  BrowserWindow: class {
    constructor() {
      return mockWindow;
    }
    static getAllWindows() {
      return [mockWindow];
    }
  },
  ipcMain: {
    handle: (channel, fn) => {
      handlers[channel] = fn;
    },
    on: (channel, fn) => {
      onHandlers[channel] = fn;
    }
  },
  shell: {
    openPath: async (dirPath) => {
      try {
        if (process.platform === 'win32') {
          execSync(`explorer "${dirPath}"`);
        } else if (process.platform === 'darwin') {
          execSync(`open "${dirPath}"`);
        } else {
          execSync(`xdg-open "${dirPath}"`);
        }
        return '';
      } catch (e) {
        return e.message;
      }
    }
  },
  dialog: {
    showOpenDialog: async (window, options) => {
      if (process.platform === 'win32') {
        return showOpenDialogWindows(options.title || 'Select File', options.filters);
      }
      return { canceled: true, filePaths: [] };
    }
  }
};

// Overwrite require for 'electron'
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'electron') {
    return electronMock;
  }
  return originalRequire.apply(this, arguments);
};

// 2. Load main.js
console.error('[BACKEND] Loading main.js...');

global.mainWindow = mockWindow;

require('../main.js');

// 3. Setup communication
const mockEvent = {
  sender: {
    send: (channel, data) => {
      sendEvent(channel, data);
    }
  }
};

function sendEvent(channel, data) {
  process.stdout.write(JSON.stringify({ type: 'event', event: channel, payload: data }) + '\n');
}

function sendResponse(id, success, result, error) {
  process.stdout.write(JSON.stringify({ type: 'response', id, success, result, error }) + '\n');
}

// 4. Start Readline loop
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    const { id, cmd, args = [] } = msg;
    
    if (handlers[cmd]) {
      try {
        const result = await handlers[cmd](mockEvent, ...args);
        sendResponse(id, true, result, null);
      } catch (err) {
        console.error(`[BACKEND] Error executing handler for ${cmd}:`, err);
        sendResponse(id, false, null, err.message);
      }
    } 
    else if (onHandlers[cmd]) {
      try {
        onHandlers[cmd](mockEvent, ...args);
        sendResponse(id, true, null, null);
      } catch (err) {
        console.error(`[BACKEND] Error executing listener for ${cmd}:`, err);
        sendResponse(id, false, null, err.message);
      }
    }
    else if (cmd === 'window-minimize' || cmd === 'window-maximize' || cmd === 'window-close') {
      sendResponse(id, true, null, null);
    }
    else {
      console.error(`[BACKEND] No handler registered for command: ${cmd}`);
      sendResponse(id, false, null, `Command not found: ${cmd}`);
    }
  } catch (e) {
    console.error('[BACKEND] Failed to parse input line:', e);
  }
});

console.error('[BACKEND] Sidecar is ready and listening on stdin.');
