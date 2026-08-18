const { app, BrowserWindow } = require('electron');

console.log('--- ELECTRON DIAGNOSTICS START ---');
console.log('Node version:', process.versions.node);
console.log('Electron version:', process.versions.electron);
console.log('Chrome version:', process.versions.chrome);
console.log('Platform:', process.platform);
console.log('Arch:', process.arch);

app.whenReady().then(() => {
  console.log('App ready: Event fired successfully!');
  
  const win = new BrowserWindow({
    width: 600,
    height: 400,
    show: true, // Show immediately
    title: 'Electron Diagnostic Test Window',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadURL('data:text/html,<body style="background:#1e1e2e;color:#cdd6f4;font-family:sans-serif;padding:30px"><h1>Electron is working!</h1><p>If you can see this window, Electron is rendering correctly on your system.</p><hr><pre>' + 
    'Node: ' + process.versions.node + '<br>' +
    'Electron: ' + process.versions.electron + '<br>' +
    'Chrome: ' + process.versions.chrome + '</pre></body>');

  console.log('Window created successfully!');
  
  win.on('closed', () => {
    console.log('Window closed by user.');
    app.quit();
  });
});

app.on('window-all-closed', () => {
  console.log('All windows closed.');
  app.quit();
});
