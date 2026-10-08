const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clodik', {
  onState: (cb) => ipcRenderer.on('pet-state', (_e, data) => cb(data)),
  onCursor: (cb) => ipcRenderer.on('cursor-state', (_e, data) => cb(data)),
  onTrick: (cb) => ipcRenderer.on('do-trick', () => cb()),
  onFed: (cb) => ipcRenderer.on('fed', () => cb()),
  statInc: (key) => ipcRenderer.send('stat-inc', key),
  moveWindow: (x, y) => ipcRenderer.send('move-window', { x, y }),
  updateBubble: (data) => ipcRenderer.send('bubble-update', data),
  getInit: () => ipcRenderer.sendSync('get-init'),
});
