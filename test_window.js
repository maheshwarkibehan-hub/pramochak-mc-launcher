const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
  console.log('APP READY');
  const win = new BrowserWindow({ width: 400, height: 300 });
  win.loadURL('data:text/html,<h1 style="color:white;background:black;padding:50px">ELECTRON WORKS!</h1>');
  console.log('WINDOW CREATED');
  win.on('closed', () => app.quit());
});

app.on('window-all-closed', () => app.quit());
