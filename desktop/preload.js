// Marks the page as the desktop app (turns off the browser service worker).
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('imenuDesktop', true);
