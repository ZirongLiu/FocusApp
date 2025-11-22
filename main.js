const { app, BrowserWindow, Tray, screen, nativeImage, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// 生产环境判断
const isDev = !app.isPackaged;

let tray = null;
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 250, // ✅ 修改：更小巧的宽度 (原360)
    height: 350, // ✅ 修改：更小巧的高度 (原480)
    show: false, 
    frame: false, 
    fullscreenable: false,
    resizable: false,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true, 
      contextIsolation: false,
      devTools: isDev,
      backgroundThrottling: false 
    }
  });

  // 允许窗口显示在全屏应用之上
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const startURL = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, 'dist/index.html')}`;

  win.loadURL(startURL);

  // 失去焦点自动隐藏
  win.on('blur', () => {
    if (!win.webContents.isDevToolsOpened()) {
      win.hide();
    }
  });

  win.on('closed', () => {
    win = null;
  });
}

const toggleWindow = () => {
  if (!win) {
    createWindow();
    return; 
  }

  if (win.isVisible()) {
    win.hide();
  } else {
    const windowBounds = win.getBounds();
    const trayBounds = tray.getBounds();
    const x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));
    const y = Math.round(trayBounds.y + trayBounds.height + 4);
    win.setPosition(x, y, false);
    win.show();
    win.focus();
  }
};

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();

  createWindow();

  let iconPath = path.join(__dirname, 'public/TrayIcon.png');
  if (!isDev) iconPath = path.join(process.resourcesPath, 'public/TrayIcon.png');

  try {
      let icon = nativeImage.createFromPath(iconPath);
      icon = icon.resize({ width: 16, height: 16 });
      icon.setTemplateImage(true);
      
      tray = new Tray(icon);
      tray.setToolTip('Focus App');
      tray.on('click', toggleWindow);
  } catch (error) {
      console.log("图标加载失败", error);
      tray = new Tray(nativeImage.createEmpty());
      tray.on('click', toggleWindow);
  }
});

ipcMain.on('quit-app', () => {
  app.quit(); 
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});