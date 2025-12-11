const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const XLSX = require('xlsx');
const zlib = require('zlib');

let launcherWindow;
let workspaceWindow;
let createProjectWindowRef;
let pendingWorkspaceProject = null;
let messageBoxWindow = null;
let messageBoxResolve = null;

// 确保数据目录存在
const dataDir = path.join(app.getPath('userData'), 'projects');
fs.ensureDirSync(dataDir);

// 历史工程列表文件路径
const projectsFile = path.join(dataDir, 'projects.json');

function sanitizeNameSegment(name = '') {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

function isValidVariableName(name) {
  // JS 标识符简易规则：字母、_、$ 开头，后续可跟数字
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}

function getAnnotationFilePath(annotationDir, fileName, sheetName) {
  const safeFile = sanitizeNameSegment(fileName || 'unknown');
  const safeSheet = sanitizeNameSegment(sheetName || 'sheet');
  return path.join(annotationDir, `${safeFile}__${safeSheet}.json`);
}

async function readAnnotationFile(annotationDir, fileName, sheetName, defaultData) {
  await fs.ensureDir(annotationDir);
  const filePath = getAnnotationFilePath(annotationDir, fileName, sheetName);
  if (await fs.pathExists(filePath)) {
    return await fs.readJson(filePath);
  }
  return defaultData;
}

async function writeAnnotationFile(annotationDir, fileName, sheetName, data) {
  await fs.ensureDir(annotationDir);
  const filePath = getAnnotationFilePath(annotationDir, fileName, sheetName);
  // 如果文件存在，先删除，确保完全覆盖（虽然 writeJson 默认会覆盖，但这样更明确）
  // 也可以直接 writeJson，它会覆盖内容
  await fs.writeJson(filePath, data, { spaces: 2 });
}

function extractFieldNames(sheet, tableType) {
  if (!sheet || !sheet['!ref']) {
    return [];
  }
  const range = XLSX.utils.decode_range(sheet['!ref']);
  // 表头或字段名提取
  const fieldSet = new Set();
  const firstCol = range.s.c;
  if (tableType === 'constant') {
    for (let row = range.s.r; row <= range.e.r; row++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: firstCol });
      const cell = sheet[cellAddress];
      const value = cell ? String(cell.v).trim() : '';
      if (value && !value.startsWith('#')) {
        fieldSet.add(value);
      }
    }
  } else {
    const headerRow = range.s.r;
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: headerRow, c: col });
      const cell = sheet[cellAddress];
      const value = cell ? String(cell.v).trim() : '';
      if (value && !value.startsWith('#')) {
        fieldSet.add(value);
      }
    }
  }
  return Array.from(fieldSet);
}

/**
 * 对「列表表」的数据进行校验：
 * - 类型检查（string / number）
 * - 数值范围检查（min / max）
 * - 空值检查（nullable）
 * - ID字段检查（必须存在且为小写 "id"）
 * - ID重复检查
 * 返回问题描述字符串数组
 */

/**
 * 对「常数表」的数据进行校验：
 * - 假设第一列为字段名，第二列为值
 * - 使用字段标注中的 type / min / max / nullable 规则
 */
function validateConstantTableData(sheet, annotationData) {
  const issues = [];
  if (!sheet || !sheet['!ref']) {
    return issues;
  }

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const firstCol = range.s.c;
  const valueCol = firstCol + 1;

  const fieldMap = new Map();
  const fields = Array.isArray(annotationData.fields) ? annotationData.fields : [];
  for (const field of fields) {
    if (field && field.name) {
      fieldMap.set(field.name, field);
    }
  }

  for (let row = range.s.r; row <= range.e.r; row++) {
    const nameAddr = XLSX.utils.encode_cell({ r: row, c: firstCol });
    const nameCell = sheet[nameAddr];
    const name = nameCell ? String(nameCell.v).trim() : '';
    if (!name || name.startsWith('#')) {
      continue;
    }

    const field = fieldMap.get(name);
    if (!field) {
      // 未配置该字段的校验规则，跳过
      continue;
    }

    const valueAddr = XLSX.utils.encode_cell({ r: row, c: valueCol });
    const valueCell = sheet[valueAddr];
    const rawValue = valueCell == null ? '' : valueCell.v;
    const displayRow = row + 1;
    const type = field.type === 'number' ? 'number' : 'string';
    const nullable = field.nullable === true;
    const min = typeof field.min === 'number' ? field.min : null;
    const max = typeof field.max === 'number' ? field.max : null;

    const isEmpty =
      rawValue === undefined ||
      rawValue === null ||
      (typeof rawValue === 'string' && rawValue.trim() === '');

    if (isEmpty) {
      if (!nullable) {
        issues.push(`第 ${displayRow} 行 字段「${name}」不允许为空`);
      }
      continue;
    }

    if (type === 'number') {
      const num = Number(rawValue);
      if (Number.isNaN(num)) {
        issues.push(`第 ${displayRow} 行 字段「${name}」的值「${rawValue}」不是数值`);
        continue;
      }
      if (min !== null && num < min) {
        issues.push(`第 ${displayRow} 行 字段「${name}」的值 ${num} 小于最小值 ${min}`);
      }
      if (max !== null && num > max) {
        issues.push(`第 ${displayRow} 行 字段「${name}」的值 ${num} 大于最大值 ${max}`);
      }
    }
  }

  return issues;
}

const XLSX_EXTENSIONS = new Set(['.xlsx']);

async function collectXlsxFiles(targetDir) {
  const result = [];

  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      console.warn(`读取目录失败: ${dir}`, error);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (XLSX_EXTENSIONS.has(ext)) {
          result.push(fullPath);
        }
      }
    }
  }

  await walk(targetDir);
  return result;
}

async function buildConfigStructure(configDir) {
  const files = await collectXlsxFiles(configDir);
  const structures = [];
  for (const filePath of files) {
    try {
      const workbook = XLSX.readFile(filePath, { cellDates: true });
      structures.push({
        absolutePath: filePath,
        relativePath: path.relative(configDir, filePath) || path.basename(filePath),
        fileName: path.basename(filePath),
        sheets: Array.isArray(workbook.SheetNames) ? workbook.SheetNames : []
      });
    } catch (error) {
      console.warn(`读取工作簿失败: ${filePath}`, error);
      structures.push({
        absolutePath: filePath,
        relativePath: path.relative(configDir, filePath) || path.basename(filePath),
        fileName: path.basename(filePath),
        sheets: [],
        error: error.message || '读取失败'
      });
    }
  }

  return structures;
}

function isEmptyValue(value) {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  return false;
}

function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeHeaderValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function validateListTableData(sheet, annotationData) {
  const issues = [];
  if (!sheet || !sheet['!ref']) {
    issues.push('页签没有可用数据');
    return issues;
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true
  });

  if (!rows.length) {
    issues.push('页签没有可用数据');
    return issues;
  }

  const headerRow = rows[0].map(normalizeHeaderValue);
  const headerMap = new Map();
  headerRow.forEach((name, index) => {
    if (!name) {
      return;
    }
    if (!headerMap.has(name)) {
      headerMap.set(name, index);
    }
  });

  const dataRows = rows.slice(1);
  const fields = Array.isArray(annotationData.fields) ? annotationData.fields : [];

  const addIssue = (message) => {
    if (issues.length >= 50) {
      return;
    }
    issues.push(message);
  };

  if (!fields.length) {
    addIssue('列表表缺少字段标注');
    return issues;
  }

  // 检查ID字段是否存在（区分大小写，必须为 "id"）
  let hasIdField = false;
  const idSet = new Set();

  // 第一遍：检查字段是否在表头中存在，并检查ID字段
  for (const field of fields) {
    if (!field || !field.name) {
      continue;
    }

    const fieldName = normalizeHeaderValue(field.name);
    if (!fieldName) {
      addIssue('存在未命名的字段标注');
      continue;
    }

    // 检查字段是否在表头中存在
    if (!headerMap.has(fieldName)) {
      addIssue(`字段 ${fieldName} 在表头中不存在`);
      continue;
    }

    // 检查ID字段：最终导出的字段名必须为 'id' (区分大小写)
    const aliasStr = field.alias
    if (aliasStr === 'id') {
      hasIdField = true;
    }
  }

  // 如果没有找到合法的ID字段，报错
  if (!hasIdField) {
    addIssue('列表标注必须包含 "id" 字段');
  }

  // 第二遍：校验每一行数据
  for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
    const row = dataRows[rowIndex];
    const rowNumber = rowIndex + 2; // 数据从第 2 行开始
    let rowHasValue = false; // 用于标记该行是否有有效数据
    const rowData = {}; // 收集当前行的数据，用于后续ID重复检查

    for (const field of fields) {
      if (!field || !field.name) {
        continue;
      }

      const fieldName = normalizeHeaderValue(field.name);
      if (!fieldName || !headerMap.has(fieldName)) {
        continue;
      }

      const colIndex = headerMap.get(fieldName);
      const cellValue = Array.isArray(row) ? row[colIndex] : undefined;
      const alias = field.alias ? String(field.alias) : fieldName;
      const nullable = field?.nullable === true;

      // 记录数据以备后用（用于ID检查）
      rowData[alias] = cellValue;

      if (!isEmptyValue(cellValue)) {
        rowHasValue = true;
      }

      // 空值检查
      if (isEmptyValue(cellValue)) {
        if (!nullable) {
          addIssue(`字段 ${fieldName} 第 ${rowNumber} 行为空，但未允许空值`);
        }
        continue;
      }

      // 类型检查 & 数值范围
      if (field?.type === 'number') {
        const numericValue = toNumber(cellValue);
        if (numericValue === null) {
          addIssue(`字段 ${fieldName} 第 ${rowNumber} 行应为数值，实际为 "${cellValue}"`);
          continue;
        }

        if (typeof field.min === 'number' && numericValue < field.min) {
          addIssue(`字段 ${fieldName} 第 ${rowNumber} 行小于最小值 ${field.min}`);
        }

        if (typeof field.max === 'number' && numericValue > field.max) {
          addIssue(`字段 ${fieldName} 第 ${rowNumber} 行大于最大值 ${field.max}`);
        }
      } else if (field?.type && field.type !== 'string') {
        addIssue(`字段 ${fieldName} 使用了未知类型 ${field.type}`);
        break;
      }
    }

    // 检查 ID 重复（只对有效行且存在ID字段时检查）
    if (hasIdField && rowHasValue) {
      const idValue = rowData['id'];
      // 确保 ID 不为空且有效
      if (idValue !== undefined && idValue !== null && String(idValue).trim() !== '') {
        const strId = String(idValue).trim();
        if (idSet.has(strId)) {
          addIssue(`第 ${rowNumber} 行 ID "${strId}" 重复`);
        } else {
          idSet.add(strId);
        }
      }
    }
  }

  return issues;
}

function createLauncherWindow() {
  if (launcherWindow) {
    launcherWindow.focus();
    return;
  }

  launcherWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    },
    show: false
  });

  launcherWindow.loadFile(path.join(__dirname, '../renderer/launcher.html'));

  launcherWindow.once('ready-to-show', () => {
    launcherWindow.show();
  });

  launcherWindow.on('closed', () => {
    launcherWindow = null;
  });

  if (process.argv.includes('--dev')) {
    launcherWindow.webContents.openDevTools();
  }
}

function createWorkspaceWindow(projectData) {
  pendingWorkspaceProject = projectData || null;

  if (workspaceWindow) {
    workspaceWindow.focus();
    if (pendingWorkspaceProject) {
      workspaceWindow.webContents.send('load-project', pendingWorkspaceProject);
      pendingWorkspaceProject = null;
    }
    if (launcherWindow) {
      launcherWindow.hide();
    }
    return;
  }

  workspaceWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    },
    show: false
  });

  workspaceWindow.loadFile(path.join(__dirname, '../renderer/workspace.html'));

  workspaceWindow.once('ready-to-show', () => {
    workspaceWindow.show();
    if (pendingWorkspaceProject) {
      workspaceWindow.webContents.send('load-project', pendingWorkspaceProject);
      pendingWorkspaceProject = null;
    }
  });

  workspaceWindow.on('closed', () => {
    workspaceWindow = null;
    pendingWorkspaceProject = null;
    if (launcherWindow) {
      launcherWindow.show();
    }
  });

  workspaceWindow.webContents.once('did-finish-load', () => {
    if (pendingWorkspaceProject) {
      workspaceWindow.webContents.send('load-project', pendingWorkspaceProject);
      pendingWorkspaceProject = null;
    }
  });

  if (launcherWindow) {
    launcherWindow.hide();
  }
}

function openCreateProjectWindow() {
  if (createProjectWindowRef) {
    createProjectWindowRef.focus();
    return;
  }

  createProjectWindowRef = new BrowserWindow({
    width: 720,
    height: 820,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    },
    parent: launcherWindow || workspaceWindow || null,
    modal: false,
    show: false
  });

  createProjectWindowRef.loadFile(path.join(__dirname, '../renderer/create-project.html'));

  createProjectWindowRef.once('ready-to-show', () => {
    createProjectWindowRef.show();
  });

  createProjectWindowRef.on('closed', () => {
    createProjectWindowRef = null;
  });
}

function createMessageBoxWindow(parentWindow) {
  // 如果已有消息框，先关闭
  if (messageBoxWindow) {
    messageBoxWindow.close();
  }

  const defaultWidth = 520; // 稍微加宽
  const defaultHeight = 400; // 初始高度减小

  messageBoxWindow = new BrowserWindow({
    width: defaultWidth,
    height: defaultHeight,
    frame: true, // 启用系统标题栏和边框
    resizable: false,
    alwaysOnTop: true,
    modal: true, // 模态窗口，父窗口不可操作
    parent: parentWindow || null,
    autoHideMenuBar: true, // 隐藏菜单栏
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    },
    show: false,
    backgroundColor: '#ffffff', // 白色背景
    transparent: false, // 不透明
    center: true,
    useContentSize: true // 宽高指内容区域大小
  });

  // 移除菜单
  messageBoxWindow.setMenu(null);

  // 监听渲染进程调整窗口大小的请求
  ipcMain.on('resize-message-box', (event, { width, height }) => {
    if (messageBoxWindow && !messageBoxWindow.isDestroyed()) {
      // 限制最大高度，防止超出屏幕
      const maxHeight = 600;
      const newHeight = Math.min(height, maxHeight);
      messageBoxWindow.setSize(defaultWidth, newHeight);
      messageBoxWindow.center(); // 重新居中
    }
  });

  messageBoxWindow.loadFile(path.join(__dirname, '../renderer/message-box.html'));

  // 如果存在父窗口，相对于父窗口居中
  if (parentWindow) {
    const parentBounds = parentWindow.getBounds();
    const parentCenterX = parentBounds.x + parentBounds.width / 2;
    const parentCenterY = parentBounds.y + parentBounds.height / 2;
    messageBoxWindow.setPosition(
      Math.round(parentCenterX - defaultWidth / 2),
      Math.round(parentCenterY - defaultHeight / 2)
    );
  }

  messageBoxWindow.loadFile(path.join(__dirname, '../renderer/message-box.html'));

  messageBoxWindow.on('closed', () => {
    if (messageBoxResolve) {
      messageBoxResolve(false);
      messageBoxResolve = null;
    }
    messageBoxWindow = null;
  });

  return messageBoxWindow;
}

async function showMessageBox(parentWindow, type, message, isConfirmDialog = false) {
  return new Promise((resolve) => {
    const boxWindow = createMessageBoxWindow(parentWindow);
    messageBoxResolve = resolve;

    // 监听消息结果（每次显示都需要重新监听）
    const resultHandler = (event, data) => {
      if (messageBoxResolve) {
        messageBoxResolve(data.confirmed);
        messageBoxResolve = null;
      }
      ipcMain.removeListener('message-result', resultHandler);
      if (boxWindow && !boxWindow.isDestroyed()) {
        boxWindow.close();
      }
    };

    ipcMain.once('message-result', resultHandler);

    boxWindow.once('ready-to-show', () => {
      boxWindow.show();
      boxWindow.webContents.send('show-message', {
        type,
        message,
        isConfirmDialog
      });
    });
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createLauncherWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createLauncherWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC 处理：获取历史工程列表
ipcMain.handle('get-projects', async () => {
  try {
    if (await fs.pathExists(projectsFile)) {
      const data = await fs.readJson(projectsFile);
      return data.projects || [];
    }
    return [];
  } catch (error) {
    console.error('读取历史工程列表失败:', error);
    return [];
  }
});

// IPC 处理：保存历史工程
ipcMain.handle('save-project', async (event, projectData) => {
  try {
    let projects = [];
    if (await fs.pathExists(projectsFile)) {
      const data = await fs.readJson(projectsFile);
      projects = data.projects || [];
    }

    // 检查是否已存在同名工程
    const existingIndex = projects.findIndex(p => p.name === projectData.name);
    if (existingIndex >= 0) {
      projects[existingIndex] = projectData;
    } else {
      projects.unshift(projectData); // 新工程添加到最前面
    }

    // 限制历史记录数量
    if (projects.length > 20) {
      projects = projects.slice(0, 20);
    }

    await fs.writeJson(projectsFile, { projects }, { spaces: 2 });
    return { success: true };
  } catch (error) {
    console.error('保存工程失败:', error);
    return { success: false, error: error.message };
  }
});

// IPC 处理：删除历史工程
ipcMain.handle('delete-project', async (event, projectName) => {
  try {
    if (await fs.pathExists(projectsFile)) {
      const data = await fs.readJson(projectsFile);
      let projects = data.projects || [];
      projects = projects.filter(p => p.name !== projectName);
      await fs.writeJson(projectsFile, { projects }, { spaces: 2 });
      return { success: true };
    }
    return { success: true };
  } catch (error) {
    console.error('删除工程失败:', error);
    return { success: false, error: error.message };
  }
});

// IPC 处理：选择目录（通用）
ipcMain.handle('select-directory', async (event) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(browserWindow, {
    properties: ['openDirectory'],
    title: '选择目录'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, path: result.filePaths[0] };
  }
  return { success: false };
});

// IPC 处理：选择工程目录（保留兼容性）
ipcMain.handle('select-project-directory', async (event) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(browserWindow, {
    properties: ['openDirectory'],
    title: '选择工程目录'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, path: result.filePaths[0] };
  }
  return { success: false };
});

ipcMain.on('open-create-project-window', () => {
  openCreateProjectWindow();
});

ipcMain.on('close-create-project-window', () => {
  if (createProjectWindowRef) {
    createProjectWindowRef.close();
    createProjectWindowRef = null;
  }
});

ipcMain.on('open-project', (event, projectData) => {
  if (!projectData) {
    return;
  }
  createWorkspaceWindow(projectData);
});

ipcMain.on('project-created', (event, projectData) => {
  if (launcherWindow) {
    launcherWindow.webContents.send('projects-updated');
  }
  if (createProjectWindowRef) {
    createProjectWindowRef.close();
    createProjectWindowRef = null;
  }
  createWorkspaceWindow(projectData);
});

ipcMain.on('back-to-launcher', () => {
  if (workspaceWindow) {
    workspaceWindow.close();
    workspaceWindow = null;
  }
  if (launcherWindow) {
    launcherWindow.show();
    launcherWindow.focus();
  }
});

ipcMain.on('refresh-projects', () => {
  if (launcherWindow) {
    launcherWindow.webContents.send('projects-updated');
  }
});

ipcMain.handle('get-config-structure', async (_event, configDir) => {
  if (!configDir) {
    return { success: false, error: '未提供配置目录' };
  }

  try {
    const exists = await fs.pathExists(configDir);
    if (!exists) {
      return { success: false, error: '配置目录不存在' };
    }

    const entries = await fs.readdir(configDir);
    const files = [];

    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      const baseName = path.basename(entry, ext);
      if (ext !== '.xlsx' || baseName.startsWith('#') || entry.startsWith('~$')) {
        continue;
      }

      const filePath = path.join(configDir, entry);
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        continue;
      }

      try {
        const workbook = XLSX.readFile(filePath, { sheetStubs: true });
        const sheets = Array.isArray(workbook.SheetNames)
          ? workbook.SheetNames.filter(sheetName => sheetName && !sheetName.startsWith('#'))
          : [];
        files.push({
          fileName: entry,
          sheets
        });
      } catch (error) {
        files.push({
          fileName: entry,
          sheets: [],
          error: error.message || '读取失败'
        });
      }
    }

    return { success: true, files };
  } catch (error) {
    console.error('读取配置目录失败:', error);
    return { success: false, error: error.message || '读取配置目录失败' };
  }
});

ipcMain.handle('load-sheet-annotation', async (_event, payload = {}) => {
  const { annotationDir, fileName, sheetName, defaultTableName } = payload;
  const baseData = {
    tableName: defaultTableName || sheetName || '',
    tableType: '',
    fields: []
  };

  if (!annotationDir) {
    return { success: true, data: baseData, writable: false, reason: '未配置标注目录' };
  }

  try {
    // 1. 读取现有标注（如果存在）
    let existingData = await readAnnotationFile(annotationDir, fileName, sheetName, baseData);

    // 2. 读取 Excel 表头，进行比对清理
    const configPath = path.join(path.dirname(annotationDir), 'xlsx'); // 假设结构，或者需要传入 configDir。
    // 注意：load-sheet-annotation 接口目前入参没有 configDir。
    // 为了实现“打开/加载标注时自动清理”，我们需要读取 Excel。
    // 但如果不想在这里引入读取 Excel 的开销（可能很大），
    // 我们维持 `validate-annotations` 中的自动清理逻辑即可，
    // 因为 `validate-annotations` 是打开工程后必然会执行的步骤。
    // 而这里 `load-sheet-annotation` 是在用户点击编辑时调用的。
    // 
    // 如果用户只想在保存时覆盖：
    // `writeAnnotationFile` 已经是完全覆盖写入了（writeJson 默认行为）。
    // 所以只要前端传过来的 data 是干净的（不包含已删除字段），保存就没问题。
    // 前端编辑器加载时，如果也通过 `validate-annotations` 类似的逻辑获取了最新字段列表，
    // 那么前端展示的就是干净的。

    // 鉴于 `validate-annotations` 已经加了自动清理并回写，
    // 只要用户打开工程，幽灵字段就会被清除。
    // 这里直接返回读取到的数据即可。

    return { success: true, data: { ...baseData, ...existingData }, writable: true };
  } catch (error) {
    console.error('读取标注失败:', error);
    return { success: false, error: error.message || '读取标注失败' };
  }
});

ipcMain.handle('save-sheet-annotation', async (_event, payload = {}) => {
  const { annotationDir, fileName, sheetName, data } = payload;
  if (!annotationDir) {
    return { success: false, error: '未配置标注目录' };
  }
  if (!fileName || !sheetName || !data) {
    return { success: false, error: '保存标注缺少必要信息' };
  }
  try {
    await writeAnnotationFile(annotationDir, fileName, sheetName, data);
    return { success: true };
  } catch (error) {
    console.error('保存标注失败:', error);
    return { success: false, error: error.message || '保存标注失败' };
  }
});

ipcMain.handle('get-sheet-fields', async (_event, payload = {}) => {
  const { configDir, fileName, sheetName, tableType } = payload;
  if (!configDir || !fileName || !sheetName) {
    return { success: false, error: '缺少必要参数' };
  }
  if (!tableType) {
    return { success: false, error: '请先选择表类型' };
  }

  try {
    const filePath = path.join(configDir, fileName);
    const exists = await fs.pathExists(filePath);
    if (!exists) {
      return { success: false, error: '配置文件不存在' };
    }
    const workbook = XLSX.readFile(filePath, { sheetStubs: true });
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return { success: false, error: '页签不存在' };
    }
    const fields = extractFieldNames(sheet, tableType);
    return { success: true, fields };
  } catch (error) {
    console.error('读取字段失败:', error);
    return { success: false, error: error.message || '读取字段失败' };
  }
});

// IPC 处理：校验所有配置表的标注完成情况
ipcMain.handle('validate-annotations', async (_event, payload = {}) => {
  const { configDir, annotationDir } = payload;
  if (!configDir) {
    return { success: false, error: '未提供配置目录' };
  }
  if (!annotationDir) {
    return { success: false, error: '未提供标注目录' };
  }

  try {
    const exists = await fs.pathExists(configDir);
    if (!exists) {
      return { success: false, error: '配置目录不存在' };
    }

    // 获取所有配置表结构
    const configResult = await buildConfigStructure(configDir);
    const missingAnnotations = [];
    const incompleteAnnotations = [];
    const validAnnotations = [];
    const workbookCache = new Map();

    // 检查每个文件的每个页签
    for (const fileStruct of configResult) {
      const { fileName, sheets, absolutePath, error } = fileStruct;

      if (error) {
        incompleteAnnotations.push({
          fileName,
          sheetName: '*',
          reason: `配置文件读取失败：${error}`
        });
        continue;
      }

      // 跳过以 # 开头的文件
      if (fileName.startsWith('#') || fileName.startsWith('~$')) {
        continue;
      }

      for (const sheetName of sheets) {
        // 跳过以 # 开头的页签
        if (sheetName.startsWith('#')) {
          continue;
        }

        const annotationPath = getAnnotationFilePath(annotationDir, fileName, sheetName);
        const annotationExists = await fs.pathExists(annotationPath);

        if (!annotationExists) {
          missingAnnotations.push({
            fileName,
            sheetName,
            reason: '未创建标注文件'
          });
          continue;
        }

        // 读取标注文件并检查完整性
        try {
          const annotationData = await fs.readJson(annotationPath);

          // 检查基本字段
          if (!annotationData.tableName || !annotationData.tableType) {
            incompleteAnnotations.push({
              fileName,
              sheetName,
              reason: '缺少表名或表类型'
            });
            continue;
          }

          if (!isValidVariableName(annotationData.tableName)) {
            incompleteAnnotations.push({
              fileName,
              sheetName,
              reason: `表名 "${annotationData.tableName}" 不是合法的变量名`
            });
            continue;
          }

          // 对于列表表 / 常数表，检查是否有字段标注
          if (annotationData.tableType === 'list' || annotationData.tableType === 'constant') {
            if (!Array.isArray(annotationData.fields) || annotationData.fields.length === 0) {
              incompleteAnnotations.push({
                fileName,
                sheetName,
                reason: '缺少字段标注'
              });
              continue;
            }

            // 检查字段名是否合法
            const invalidFields = [];
            for (const field of annotationData.fields) {
              // 优先检查 alias，如果没有 alias 则检查 name（虽然 name 通常是中文，但作为 JSON key 需要检查是否作为变量名使用，
              // 实际上导出逻辑中使用 alias || name 作为 key。
              // 如果设计意图是 JSON key 必须是合法变量名，那么应该检查最终使用的 key。
              const key = field.alias || field.name;
              if (!key || !isValidVariableName(key)) {
                invalidFields.push(key || '(空)');
              }
            }

            if (invalidFields.length > 0) {
              incompleteAnnotations.push({
                fileName,
                sheetName,
                reason: `存在不合法的字段名/别名: ${invalidFields.join(', ')}`
              });
              continue;
            }
          }

          let sheetIssues = [];

          // 进行数据校验（类型 / 范围 / 空值）
          try {
            if (!workbookCache.has(absolutePath)) {
              const workbook = XLSX.readFile(absolutePath, { sheetStubs: true });
              workbookCache.set(absolutePath, workbook);
            }
            const workbook = workbookCache.get(absolutePath);
            const sheet = workbook && workbook.Sheets ? workbook.Sheets[sheetName] : null;
            if (!sheet) {
              incompleteAnnotations.push({
                fileName,
                sheetName,
                reason: '配置文件中不存在该页签'
              });
              continue;
            }

            // -----------------------------------------------------------
            // 修复：检查标注字段是否在当前表中实际存在
            // 如果标注了某个字段，但表中已经删除了该字段，则视为无效标注（自动清理逻辑在保存时生效，这里先做过滤或报错）
            // 为了严格起见，如果发现“幽灵标注”（表里没这个字段了），应该提示用户或者在校验时忽略它但提示保存更新。
            // 现在的需求是：校验时发现多余标注，如果有则删除（自动修复？）或者在加载时修复？
            // 用户要求：“打开工程时检查标注中是否存在表中不存在的字段标注信息，有则删除”
            // 这里的逻辑是 `validate-annotations`，相当于“打开工程”或“刷新”时调用的检查。
            // 我们可以在这里检测并更新标注文件，但这会产生副作用（校验操作修改了文件）。
            // 更稳妥的做法：在 load-sheet-annotation 时做清理，或者在这里做清理。
            // 鉴于用户说“打开工程时检查...有则删除”，最合适的地方是在 buildConfigStructure 之后，
            // 或者在 validate 过程中如果发现不匹配，直接修改内存中的 annotationData 并回写文件。
            // -----------------------------------------------------------

            const currentFields = extractFieldNames(sheet, annotationData.tableType);
            const currentFieldSet = new Set(currentFields);

            // 过滤掉不存在的字段
            const validFields = annotationData.fields.filter(f => f && f.name && currentFieldSet.has(f.name));

            // 如果字段数量有变化，说明有“幽灵标注”，需要更新标注文件
            if (validFields.length !== annotationData.fields.length) {
              annotationData.fields = validFields;
              const annotationPath = getAnnotationFilePath(annotationDir, fileName, sheetName);
              // 回写修正后的标注
              try {
                await fs.writeJson(annotationPath, annotationData, { spaces: 2 });
                console.log(`已自动清理 ${fileName} - ${sheetName} 中不存在的字段标注`);
              } catch (writeErr) {
                console.warn('自动清理标注失败', writeErr);
              }
            }

            if (annotationData.tableType === 'list') {
              sheetIssues = validateListTableData(sheet, annotationData);
            } else if (annotationData.tableType === 'constant') {
              sheetIssues = validateConstantTableData(sheet, annotationData);
            }
          } catch (sheetError) {
            incompleteAnnotations.push({
              fileName,
              sheetName,
              reason: `读取配置数据失败：${sheetError.message || sheetError}`
            });
            continue;
          }

          if (sheetIssues.length > 0) {
            incompleteAnnotations.push({
              fileName,
              sheetName,
              reason: `字段校验失败（${sheetIssues.length} 项）`,
              details: sheetIssues
            });
            continue;
          }

          // 标注完整且数据通过校验
          validAnnotations.push({
            fileName,
            sheetName,
            tableName: annotationData.tableName,
            tableType: annotationData.tableType
          });
        } catch (error) {
          incompleteAnnotations.push({
            fileName,
            sheetName,
            reason: `标注文件格式错误: ${error.message}`
          });
        }
      }
    }

    const total = missingAnnotations.length + incompleteAnnotations.length + validAnnotations.length;
    const completed = validAnnotations.length;

    return {
      success: true,
      summary: {
        total,
        completed,
        missing: missingAnnotations.length,
        incomplete: incompleteAnnotations.length,
        allCompleted: missingAnnotations.length === 0 && incompleteAnnotations.length === 0
      },
      missingAnnotations,
      incompleteAnnotations,
      validAnnotations
    };
  } catch (error) {
    console.error('校验标注失败:', error);
    return { success: false, error: error.message || '校验标注失败' };
  }
});

// IPC 处理：导出工程配置
ipcMain.handle('export-project', async (_event, payload = {}) => {
  const { configDir, annotationDir, jsonDir, scriptDir } = payload;
  if (!configDir || !annotationDir || !jsonDir) {
    return { success: false, error: '导出配置缺少必要目录参数' };
  }

  try {
    await fs.ensureDir(jsonDir);

    // 复用校验逻辑获取所有有效的配置表
    // 这里可以优化为只获取 validAnnotations，但为了简单直接复用逻辑
    // 实际导出时，我们只处理 validAnnotations 中的项

    // 1. 获取结构
    const configResult = await buildConfigStructure(configDir);
    const exportTasks = [];
    const errors = [];

    for (const fileStruct of configResult) {
      const { fileName, sheets, absolutePath, error } = fileStruct;
      if (error || fileName.startsWith('#') || fileName.startsWith('~$')) continue;

      for (const sheetName of sheets) {
        if (sheetName.startsWith('#')) continue;

        const annotationPath = getAnnotationFilePath(annotationDir, fileName, sheetName);
        if (!(await fs.pathExists(annotationPath))) continue;

        try {
          const annotationData = await fs.readJson(annotationPath);
          // 简单校验：必须有表名、类型
          if (!annotationData.tableName || !annotationData.tableType) continue;
          // 必须有字段
          if (!Array.isArray(annotationData.fields) || annotationData.fields.length === 0) continue;

          exportTasks.push({
            fileName,
            sheetName,
            absolutePath,
            annotation: annotationData
          });
        } catch (e) {
          console.warn(`读取标注失败: ${fileName} - ${sheetName}`, e);
        }
      }
    }

    // 2. 执行导出并合并数据
    const allGameData = {};
    const tableNames = []; // 收集所有表名，用于生成枚举
    const tableInterfaces = []; // 收集所有表信息，用于生成接口

    for (const task of exportTasks) {
      try {
        const workbook = XLSX.readFile(task.absolutePath, { sheetStubs: true });
        const sheet = workbook.Sheets[task.sheetName];
        if (!sheet) {
          errors.push(`${task.fileName} - ${task.sheetName}: 页签不存在`);
          continue;
        }

        const { tableName, tableType, fields } = task.annotation;

        let exportData = null;

        if (tableType === 'list') {
          exportData = extractListTableData(sheet, fields);
        } else if (tableType === 'constant') {
          exportData = extractConstantTableData(sheet, fields);
        }

        if (exportData !== null) {
          allGameData[tableName] = exportData;
          // 收集页签名和标注名，用于生成枚举
          tableNames.push({
            sheetName: task.sheetName,
            tableName: tableName
          });
          // 收集表信息，用于生成接口
          tableInterfaces.push({
            fileName: task.fileName,
            sheetName: task.sheetName,
            tableName: tableName,
            tableType: tableType,
            fields: fields
          });
        }
      } catch (err) {
        errors.push(`${task.fileName} - ${task.sheetName}: 导出失败 - ${err.message}`);
      }
    }

    // 3. 压缩并写入二进制文件
    const jsonString = JSON.stringify(allGameData);
    const buffer = Buffer.from(jsonString, 'utf-8');
    const compressed = zlib.gzipSync(buffer);
    const binPath = path.join(jsonDir, 'gamedata.bin');
    await fs.writeFile(binPath, compressed);

    // 4. 生成解压脚本 (如果配置了 scriptDir)
    if (scriptDir) {
      await fs.ensureDir(scriptDir);

      // 生成配置表枚举
      // 枚举名：_ + 页签名，枚举值：标注名（tableName）
      const enumEntries = tableNames.map(({ sheetName, tableName }) => {
        // 枚举名：_ + 页签名（页签名可能包含中文，需要转换为合法的变量名）
        // 将中文字符转换为拼音或使用转义，这里简单处理：保留中文字符（TypeScript 支持 Unicode 标识符）
        const enumName = `_${sheetName}`;
        return `    ${enumName} = "${tableName}"`;
      });

      const enumContent = enumEntries.length > 0
        ? `/**
 * 配置表名称枚举
 */
export enum GameConfigName {
${enumEntries.join(',\n')}
}
`
        : `/**
 * 配置表名称枚举
 */
export enum GameConfigName {
}
`;

      const scriptContent = `
import { BufferAsset } from 'cc';
import * as pako from 'pako';

${enumContent}
/**
 * 游戏数据管理器
 * 单例模式，需外部加载数据后调用 init 初始化
 * 注意：需要在项目中安装 pako: npm install pako @types/pako
 */
export class GameConfigMgr {
    private static _ins: GameConfigMgr | null = null;
    private _data: any = null;

    private constructor() {}

    public static get ins(): GameConfigMgr {
        if (!this._ins) {
            this._ins = new GameConfigMgr();
        }
        return this._ins;
    }

    /**
     * 初始化数据
     * @param data 游戏配置数据 (支持 BufferAsset, ArrayBuffer 或已解析的对象)
     */
    public init(data: BufferAsset | ArrayBuffer | any) {
        if (!data) {
            console.error("GameConfigMgr: init data is null or undefined");
            return;
        }

        if (data instanceof BufferAsset) {
            this._parseBuffer(data.buffer());
        } else if (data instanceof ArrayBuffer) {
            this._parseBuffer(data);
        } else {
            // 假设是已经解析好的对象
            this._data = data;
        }
    }

    private _parseBuffer(buffer: ArrayBuffer) {
        const uint8Array = new Uint8Array(buffer);
        // 使用 pako 解压 gzip 数据
        const jsonStr = pako.ungzip(uint8Array, { to: 'string' });
        this._data = JSON.parse(jsonStr);
    }

    /**
     * 获取指定表的数据
     * @param cfgName 表名
     */
    public getConfig<T>(cfgName: GameConfigName): T {
        if (!this._data) {
            throw new Error("Game data not initialized. Call init() first.");
        }
        return this._data[cfgName];
    }

    /**
     * 获取指定表的数据
     * @param cfgName 表名
     * @param id 主键id
     */
    public getConfigById<T>(cfgName: GameConfigName, id: string): T {
        let cfg = this.getConfig<T[]>(cfgName);
        if (!cfg) {
            console.error("配置表"+cfgName+"不存在id:"+id);
            return null as any;
        }
        let cfgItem = cfg.find(item => item['id'] === id);
        if (!cfgItem) {
            console.error("配置表"+cfgName+"不存在id:"+id);
            return null as any;
        }
        return cfgItem;
    }

    /**
     * 根据模板筛选配置
     * @param cfgName 表名
     * @param template 模板对象，包含要匹配的字段值
     * @returns 匹配的配置项数组
     */
    public getConfigByTemplate<T>(cfgName: GameConfigName, template: Partial<T>): T[] {
        let cfg = this.getConfig<T[]>(cfgName);
        if (!cfg) {
            console.error("配置表"+cfgName+"不存在");
            return [];
        }
        
        if (!Array.isArray(cfg)) {
            console.error("配置表"+cfgName+"不是列表表，无法使用模板查询");
            return [];
        }

        // 筛选符合模板的配置项
        return cfg.filter(item => {
            // 检查模板中的每个字段是否匹配
            for (const key in template) {
                if (template.hasOwnProperty(key)) {
                    const templateValue = template[key];
                    const itemValue = item[key];
                    
                    // 如果模板值为 undefined 或 null，跳过该字段
                    if (templateValue === undefined || templateValue === null) {
                        continue;
                    }
                    
                    // 严格相等比较
                    if (itemValue !== templateValue) {
                        return false;
                    }
                }
            }
            return true;
        });
    }
}
`;
      await fs.writeFile(path.join(scriptDir, 'GameConfigMgr.ts'), scriptContent.trim());

      // 5. 生成配置表接口文件
      const interfaceContent = generateTableInterfaces(tableInterfaces);
      await fs.writeFile(path.join(scriptDir, 'GameConfigInterfaces.ts'), interfaceContent);
    }

    if (errors.length > 0) {
      return { success: false, error: `导出完成但有错误：\n${errors.join('\n')}` };
    }

    return { success: true };
  } catch (error) {
    console.error('导出工程失败:', error);
    return { success: false, error: error.message || '导出工程失败' };
  }
});

// IPC 处理：显示消息框
ipcMain.handle('show-message-box', async (event, payload = {}) => {
  const { type = 'info', message = '', isConfirm = false } = payload;
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const result = await showMessageBox(parentWindow, type, message, isConfirm);
  return { confirmed: result };
});

function extractListTableData(sheet, fields) {
  if (!sheet || !sheet['!ref']) return [];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true
  });

  if (rows.length < 2) return []; // 至少要有表头

  // 建立表头映射
  const headerRow = rows[0].map(normalizeHeaderValue);
  const headerMap = new Map();
  headerRow.forEach((name, index) => {
    if (name) headerMap.set(name, index);
  });

  const result = [];
  const dataRows = rows.slice(1);

  for (const row of dataRows) {
    const item = {};
    let hasValue = false;

    for (const field of fields) {
      const fieldName = field.name;
      const alias = field.alias || fieldName;
      const colIndex = headerMap.get(fieldName);

      if (colIndex === undefined) continue;

      let val = row[colIndex];

      // 类型转换
      if (field.type === 'number') {
        val = toNumber(val);
      } else {
        // string
        val = val === null || val === undefined ? null : String(val);
      }

      // 空值处理
      if (val === null && !field.nullable) {
        // 理论上校验阶段已拦截，这里为了导出安全，可以转为空串或0? 
        // 既然是强校验流程，这里保持 null 也可以，或者根据类型给默认值
        val = field.type === 'number' ? 0 : "";
      }

      item[alias] = val;

      // 简单的空行检查逻辑：只要有一个关键字段有值就算非空行？
      // 或者：只要不是所有字段都为空
      if (val !== null && val !== "" && val !== 0) {
        // 这是一个非常宽泛的判定
      }
    }
    result.push(item);
  }
  return result;
}

function extractConstantTableData(sheet, fields) {
  if (!sheet || !sheet['!ref']) return {};

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const firstCol = range.s.c;
  const valueCol = firstCol + 1;

  const result = {};
  const fieldMap = new Map();
  fields.forEach(f => fieldMap.set(f.name, f));

  for (let row = range.s.r; row <= range.e.r; row++) {
    const nameAddr = XLSX.utils.encode_cell({ r: row, c: firstCol });
    const nameCell = sheet[nameAddr];
    const name = nameCell ? String(nameCell.v).trim() : '';

    if (!name || name.startsWith('#') || !fieldMap.has(name)) continue;

    const field = fieldMap.get(name);
    const valueAddr = XLSX.utils.encode_cell({ r: row, c: valueCol });
    const valueCell = sheet[valueAddr];
    let val = valueCell ? valueCell.v : null;

    const alias = field.alias || field.name;

    if (field.type === 'number') {
      val = toNumber(val);
      if (val === null && !field.nullable) val = 0;
    } else {
      val = val === null || val === undefined ? null : String(val);
      if (val === null && !field.nullable) val = "";
    }

    result[alias] = val;
  }
  return result;
}

/**
 * 生成配置表接口定义
 * @param tableInterfaces 表信息数组
 */
function generateTableInterfaces(tableInterfaces) {
  if (!tableInterfaces || tableInterfaces.length === 0) {
    return `/**
 * 配置表接口定义
 * 此文件由配置工具自动生成，请勿手动修改
 */

`;
  }

  const interfaceDefinitions = tableInterfaces.map(table => {
    const { fileName, sheetName, tableName, tableType, fields } = table;

    // 表注释：文件名 - 页签名
    const tableComment = `/**
 * ${fileName} - ${sheetName}
 * ${tableType === 'list' ? '列表表' : '常数表'}
 */`;

    if (tableType === 'list') {
      // 列表表：生成接口，字段使用 alias，类型根据字段类型确定
      const fieldDefinitions = (fields || []).map(field => {
        const alias = field.alias || field.name;
        const fieldName = field.name || '';
        const fieldType = field.type === 'number' ? 'number' : 'string';
        const nullable = field.nullable === true;
        const optional = nullable ? '?' : '';

        // 字段注释：字段名（中文）
        const fieldComment = fieldName ? `    /** ${fieldName} */` : '';
        return `${fieldComment}
    ${alias}${optional}: ${fieldType};`;
      }).join('\n');

      return `${tableComment}
export interface ${tableName} {
${fieldDefinitions}
}`;
    } else {
      // 常数表：生成接口，字段使用 alias，类型根据字段类型确定
      const fieldDefinitions = (fields || []).map(field => {
        const alias = field.alias || field.name;
        const fieldName = field.name || '';
        const fieldType = field.type === 'number' ? 'number' : 'string';
        const nullable = field.nullable === true;
        const optional = nullable ? '?' : '';

        // 字段注释：字段名（中文）
        const fieldComment = fieldName ? `    /** ${fieldName} */` : '';
        return `${fieldComment}
    ${alias}${optional}: ${fieldType};`;
      }).join('\n');

      return `${tableComment}
export interface ${tableName} {
${fieldDefinitions}
}`;
    }
  }).join('\n\n');

  return `/**
 * 配置表接口定义
 * 此文件由配置工具自动生成，请勿手动修改
 */

${interfaceDefinitions}
`;
}

