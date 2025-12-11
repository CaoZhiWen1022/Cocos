const { contextBridge, ipcRenderer } = require('electron');

function registerIpcListener(channel, callback) {
  if (typeof callback !== 'function') {
    return () => {};
  }
  const subscription = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, subscription);
  return () => ipcRenderer.removeListener(channel, subscription);
}

contextBridge.exposeInMainWorld('electronAPI', {
  getProjects: () => ipcRenderer.invoke('get-projects'),
  saveProject: (projectData) => ipcRenderer.invoke('save-project', projectData),
  deleteProject: (projectName) => ipcRenderer.invoke('delete-project', projectName),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectProjectDirectory: () => ipcRenderer.invoke('select-project-directory'),
  getConfigStructure: (configDir) => ipcRenderer.invoke('get-config-structure', configDir),
  openCreateProjectWindow: () => ipcRenderer.send('open-create-project-window'),
  closeCreateProjectWindow: () => ipcRenderer.send('close-create-project-window'),
  notifyProjectCreated: (projectData) => ipcRenderer.send('project-created', projectData),
  openProject: (projectData) => ipcRenderer.send('open-project', projectData),
  backToLauncher: () => ipcRenderer.send('back-to-launcher'),
  refreshProjects: () => ipcRenderer.send('refresh-projects'),
  loadSheetAnnotation: (payload) => ipcRenderer.invoke('load-sheet-annotation', payload),
  saveSheetAnnotation: (payload) => ipcRenderer.invoke('save-sheet-annotation', payload),
  getSheetFields: (payload) => ipcRenderer.invoke('get-sheet-fields', payload),
  validateAnnotations: (payload) => ipcRenderer.invoke('validate-annotations', payload),
  exportProject: (payload) => ipcRenderer.invoke('export-project', payload),
  showMessageBox: (payload) => ipcRenderer.invoke('show-message-box', payload),
  onProjectsUpdated: (callback) => registerIpcListener('projects-updated', callback),
  onLoadProject: (callback) => registerIpcListener('load-project', callback),
  onShowMessage: (callback) => registerIpcListener('show-message', callback),
  sendMessageResult: (confirmed) => ipcRenderer.send('message-result', { confirmed }),
  resizeMessageBox: (width, height) => ipcRenderer.send('resize-message-box', { width, height })
});

