let currentProject = null;
let configStructureRequestId = 0;
let fieldDefinitionRequestId = 0;
let activeSheetKey = null;
let currentSheet = null;
let tableAnnotation = null;
let savedAnnotationSnapshot = null;
let annotationWritable = false;
let tableAnnotationDirty = false;
let fieldAnnotationDirty = false;

let tableNameInput;
let binFileInput;
let tableTypeRadios = [];
let tableEmptyState;
let tableForm;
let tableDetailSubtitle;
let tableStatus;
let saveBtn;
let cancelBtn;
let fieldList;
let fieldStatus;
let fieldDetailSubtitle;
let validateBtn;
let refreshBtn;
let exportBtn;

function markTableAnnotationDirty() {
  tableAnnotationDirty = true;
  updateSaveState();
}

function markFieldAnnotationDirty() {
  fieldAnnotationDirty = true;
  updateSaveState();
}

function resetDirtyFlags() {
  tableAnnotationDirty = false;
  fieldAnnotationDirty = false;
  updateSaveState();
}

function hasPendingChanges() {
  return tableAnnotationDirty || fieldAnnotationDirty;
}

function clearTableAnnotationDirty() {
  tableAnnotationDirty = false;
  updateSaveState();
}

function clearFieldAnnotationDirty() {
  fieldAnnotationDirty = false;
  updateSaveState();
}

function updateSaveState() {
  if (saveBtn) {
    saveBtn.disabled = !annotationWritable || !tableAnnotation;
  }
  if (cancelBtn) {
    cancelBtn.classList.toggle('hidden', !hasPendingChanges());
  }
}

function cloneAnnotation(annotation) {
  if (!annotation) {
    return null;
  }
  return {
    tableName: annotation.tableName || '',
    tableType: annotation.tableType || '',
    binFile: annotation.binFile || '',
    fields: Array.isArray(annotation.fields)
      ? annotation.fields.map(field => ({ ...field }))
      : []
  };
}

function captureSavedAnnotation() {
  savedAnnotationSnapshot = cloneAnnotation(tableAnnotation);
}

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  bindEvents();
  renderProjectInfo();
  registerProjectLoader();
});

function cacheElements() {
  tableNameInput = document.getElementById('tableNameInput');
  binFileInput = document.getElementById('binFileInput');
  tableEmptyState = document.getElementById('tableEmptyState');
  tableForm = document.getElementById('tableForm');
  tableDetailSubtitle = document.getElementById('tableDetailSubtitle');
  tableStatus = document.getElementById('tableStatus');
  saveBtn = document.getElementById('saveBtn');
  cancelBtn = document.getElementById('cancelBtn');
  fieldList = document.getElementById('fieldList');
  fieldStatus = document.getElementById('fieldStatus');
  fieldDetailSubtitle = document.getElementById('fieldDetailSubtitle');
  validateBtn = document.getElementById('validateBtn');
  refreshBtn = document.getElementById('refreshBtn');
  exportBtn = document.getElementById('exportBtn');
  tableTypeRadios = Array.from(document.querySelectorAll('input[name="tableType"]'));
}

function bindEvents() {
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      const api = getElectronAPI();
      api.backToLauncher && api.backToLauncher();
    });
  }

  if (tableNameInput) {
    tableNameInput.addEventListener('input', () => {
      if (tableAnnotation) {
        tableAnnotation.tableName = tableNameInput.value.trim();
        markTableAnnotationDirty();
      }
    });
  }

  if (binFileInput) {
    binFileInput.addEventListener('input', () => {
      if (tableAnnotation) {
        tableAnnotation.binFile = binFileInput.value.trim();
        markTableAnnotationDirty();
      }
    });
  }

  tableTypeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (!tableAnnotation) {
        return;
      }
      if (radio.checked) {
        tableAnnotation.tableType = radio.value;
        markTableAnnotationDirty();
        syncFieldValuesIfPossible();
        refreshFieldAnnotationArea();
      }
    });
  });

  if (saveBtn) {
    saveBtn.addEventListener('click', handleSaveAnnotation);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', handleCancelAnnotation);
  }

  if (validateBtn) {
    validateBtn.addEventListener('click', handleValidateAnnotations);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', handleRefreshProject);
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', handleExportProject);
  }

  if (fieldList) {
    fieldList.addEventListener('change', (event) => {
      if (event.target.classList.contains('field-type-select')) {
        const row = event.target.closest('.field-row');
        toggleRangeInputs(row, event.target.value === 'number');
      }
      if (event.target.classList.contains('field-primary-key-toggle')) {
        const row = event.target.closest('.field-row');
        handlePrimaryKeyToggle(row, event.target.checked);
        return; // handlePrimaryKeyToggle 内部已经调用了 markFieldAnnotationDirty
      }
      if (shouldTrackFieldInput(event.target)) {
        markFieldAnnotationDirty();
      }
    });

    fieldList.addEventListener('input', (event) => {
      if (shouldTrackFieldInput(event.target)) {
        markFieldAnnotationDirty();
      }
    });
  }

  document.addEventListener('click', async (event) => {
    const target = event.target.classList.contains('tree-sheet')
      ? event.target
      : event.target.closest('.tree-sheet');
    if (!target) {
      return;
    }
    const key = target.getAttribute('data-sheet-key');
    const fileName = target.getAttribute('data-file-name');
    const sheetName = target.getAttribute('data-sheet-name');
    if (!key || !fileName || !sheetName) {
      return;
    }

    // 检查未保存修改
    if (hasPendingChanges() && key !== activeSheetKey) {
      await showMessage('当前标注有未保存的修改，请先保存后再切换页签。', 'warning');
      return;
    }

    activateSheet(key, target);
    handleSheetSelection({ fileName, sheetName });
  });
}

function getElectronAPI() {
  return window.electronAPI || {};
}

function registerProjectLoader() {
  const api = getElectronAPI();
  if (!api.onLoadProject) {
    return;
  }
  api.onLoadProject((project) => {
    currentProject = project || null;
    renderProjectInfo();
  });
}

function renderProjectInfo() {
  const nameElement = document.getElementById('projectName');
  const configDirElement = document.getElementById('configDir');
  const annotationDirElement = document.getElementById('annotationDir');
  const jsonDirElement = document.getElementById('jsonDir');
  const scriptDirElement = document.getElementById('scriptDir');
  const scriptLanguageElement = document.getElementById('scriptLanguage');
  const configDirBadge = document.getElementById('configDirBadge');

  resetDetailState();

  if (!currentProject) {
    if (nameElement) {
      nameElement.textContent = '未选择工程';
    }
    [configDirElement, annotationDirElement, jsonDirElement, scriptDirElement, scriptLanguageElement].forEach(el => {
      setValue(el, null);
    });
    if (configDirBadge) {
      configDirBadge.textContent = '未设置';
    }
    loadConfigStructure();
    return;
  }

  if (nameElement) {
    nameElement.textContent = currentProject.name || '未命名工程';
  }

  setValue(configDirElement, currentProject.configDir);
  setValue(annotationDirElement, currentProject.annotationDir);
  setValue(jsonDirElement, currentProject.jsonDir);
  setValue(scriptDirElement, currentProject.scriptDir);
  setValue(scriptLanguageElement, formatScriptLanguage(currentProject.scriptLanguage));

  if (configDirBadge) {
    configDirBadge.textContent = formatPathForBadge(currentProject.configDir);
  }

  loadConfigStructure();
}

function resetDetailState() {
  currentSheet = null;
  activeSheetKey = null;
  tableAnnotation = null;
  savedAnnotationSnapshot = null;
  annotationWritable = false;
  resetDirtyFlags();
  if (tableEmptyState) {
    tableEmptyState.classList.remove('hidden');
  }
  if (tableForm) {
    tableForm.classList.add('hidden');
  }
  if (tableDetailSubtitle) {
    tableDetailSubtitle.textContent = '请选择左侧页签进行标注';
  }
  if (tableStatus) {
    tableStatus.textContent = '';
  }
  if (fieldDetailSubtitle) {
    fieldDetailSubtitle.textContent = '请选择表类型后标注字段';
  }
  resetFieldArea('请选择左侧页签以编辑字段标注');
  updateSaveState();
}

function setValue(element, value) {
  if (!element) {
    return;
  }
  if (value) {
    element.textContent = value;
    element.classList.remove('placeholder');
  } else {
    element.textContent = '--';
    element.classList.add('placeholder');
  }
}

async function loadConfigStructure() {
  const treeContainer = document.getElementById('configTree');
  if (!treeContainer) {
    return;
  }

  if (!currentProject || !currentProject.configDir) {
    treeContainer.innerHTML = '<div class="tree-empty">当前工程未设置配置目录</div>';
    return;
  }

  const api = getElectronAPI();
  if (!api.getConfigStructure) {
    treeContainer.innerHTML = '<div class="tree-error">当前版本未提供配置读取接口</div>';
    return;
  }

  const requestId = ++configStructureRequestId;
  treeContainer.innerHTML = '<div class="tree-loading">正在读取配置目录，请稍候...</div>';

  try {
    const result = await api.getConfigStructure(currentProject.configDir);
    if (requestId !== configStructureRequestId) {
      return;
    }
    if (result && result.success) {
      renderConfigTree(result.files || []);
    } else {
      treeContainer.innerHTML = `<div class="tree-error">读取失败：${escapeHtml(result?.error || '未知错误')}</div>`;
    }
  } catch (error) {
    if (requestId !== configStructureRequestId) {
      return;
    }
    treeContainer.innerHTML = `<div class="tree-error">读取失败：${escapeHtml(error.message || '未知错误')}</div>`;
  }
}

function renderConfigTree(files) {
  const treeContainer = document.getElementById('configTree');
  if (!treeContainer) {
    return;
  }

  if (!files || files.length === 0) {
    treeContainer.innerHTML = '<div class="tree-empty">配置目录中未找到 XLSX 文件</div>';
    return;
  }

  const content = files.map(file => {
    const sheets = Array.isArray(file.sheets) ? file.sheets : [];
    const sheetList = file.error
      ? `<div class="tree-error-msg">读取失败：${escapeHtml(file.error)}</div>`
      : renderSheetList(file.fileName, sheets);

    const sheetMeta = file.error
      ? ''
      : `<div class="tree-sheet-count">${sheets.length} 个页签</div>`;

    return `
      <div class="tree-node">
        <div class="tree-file">
          <div class="tree-file-icon">📄</div>
          <div>
            <div class="tree-file-name">${escapeHtml(file.fileName || '未命名文件')}</div>
            ${sheetMeta}
          </div>
        </div>
        ${sheetList}
      </div>
    `;
  }).join('');

  treeContainer.innerHTML = content;
  restoreActiveSheetHighlight();
}

function renderSheetList(fileName, sheets) {
  if (!sheets || sheets.length === 0) {
    return '<div class="tree-empty">没有可展示的页签</div>';
  }

  return `
    <ul class="tree-sheets">
      ${sheets.map(sheet => renderSheetItem(fileName, sheet)).join('')}
    </ul>
  `;
}

function renderSheetItem(fileName, sheetName) {
  const safeFile = fileName || '未命名文件';
  const safeSheet = sheetName || '未命名页签';
  const key = `${safeFile}::${safeSheet}`;
  const isActive = activeSheetKey === key;
  return `
    <li
      class="tree-sheet${isActive ? ' active' : ''}"
      data-sheet-key="${escapeHtml(key)}"
      data-file-name="${escapeHtml(safeFile)}"
      data-sheet-name="${escapeHtml(safeSheet)}"
    >${escapeHtml(safeSheet)}</li>
  `;
}

function restoreActiveSheetHighlight() {
  if (!activeSheetKey) {
    return;
  }
  const sheets = document.querySelectorAll('.tree-sheet');
  sheets.forEach(node => {
    if (node.getAttribute('data-sheet-key') === activeSheetKey) {
      node.classList.add('active');
    }
  });
}

function activateSheet(key, element) {
  activeSheetKey = key;
  document.querySelectorAll('.tree-sheet.active').forEach(node => node.classList.remove('active'));
  if (element) {
    element.classList.add('active');
  }
}

function handleSheetSelection(sheet) {
  currentSheet = sheet;
  tableAnnotation = null;
  savedAnnotationSnapshot = null;
  annotationWritable = false;
  if (tableDetailSubtitle) {
    tableDetailSubtitle.textContent = `${sheet.fileName} › ${sheet.sheetName}`;
  }
  if (fieldDetailSubtitle) {
    fieldDetailSubtitle.textContent = `${sheet.fileName} › ${sheet.sheetName}`;
  }
  resetFieldArea('正在准备字段标注...');
  loadSheetAnnotation();
}

async function loadSheetAnnotation() {
  if (!currentProject || !currentSheet) {
    return;
  }

  const api = getElectronAPI();
  if (!api.loadSheetAnnotation) {
    showTableStatus('当前版本不支持标注功能');
    return;
  }

  updateSaveState();
  showTableStatus('正在加载标注...');

  try {
    const result = await api.loadSheetAnnotation({
      annotationDir: currentProject.annotationDir,
      fileName: currentSheet.fileName,
      sheetName: currentSheet.sheetName,
      defaultTableName: currentSheet.sheetName
    });

    if (!result || !result.success) {
      showTableStatus(result?.error || '读取标注失败');
      resetFieldArea(result?.error || '读取标注失败，无法加载字段');
      return;
    }

    tableAnnotation = normalizeAnnotation(result.data, currentSheet.sheetName);
    annotationWritable = result.writable !== false;
    captureSavedAnnotation();
    updateTableForm();
    resetDirtyFlags();
  } catch (error) {
    showTableStatus(error.message || '读取标注失败');
    resetFieldArea(error.message || '读取标注失败，无法加载字段');
  }
}

function normalizeAnnotation(data, fallbackName) {
  const payload = data || {};
  return {
    tableName: payload.tableName || fallbackName || '',
    tableType: payload.tableType || '',
    binFile: payload.binFile || '',
    fields: Array.isArray(payload.fields) ? payload.fields : []
  };
}

function updateTableForm() {
  if (!tableAnnotation) {
    return;
  }
  if (tableEmptyState) {
    tableEmptyState.classList.add('hidden');
  }
  if (tableForm) {
    tableForm.classList.remove('hidden');
  }
  if (tableNameInput) {
    tableNameInput.value = tableAnnotation.tableName || currentSheet.sheetName;
    tableNameInput.disabled = !annotationWritable;
  }
  if (binFileInput) {
    binFileInput.value = tableAnnotation.binFile || '';
    binFileInput.disabled = !annotationWritable;
  }
  tableTypeRadios.forEach(radio => {
    radio.checked = tableAnnotation.tableType === radio.value;
    radio.disabled = !annotationWritable;
  });

  updateSaveState();

  if (!annotationWritable) {
    showTableStatus('未设置标注目录，无法保存');
  } else {
    showTableStatus('');
  }

  if (!currentProject?.configDir) {
    showTableStatus('未设置配置目录，无法读取字段');
  }

  refreshFieldAnnotationArea();
}

async function handleSaveAnnotation() {
  if (!tableAnnotation || !currentSheet) {
    return;
  }
  if (!annotationWritable) {
    showTableStatus('未设置标注目录，无法保存');
    return;
  }
  tableAnnotation.tableName = (tableNameInput.value || currentSheet.sheetName).trim();
  tableAnnotation.binFile = (binFileInput?.value || '').trim();
  const tableType = getSelectedTableType();
  if (!tableType) {
    showTableStatus('请选择表类型');
    return;
  }
  tableAnnotation.tableType = tableType;

  const fieldRows = fieldList ? fieldList.querySelectorAll('.field-row') : [];
  if (fieldRows.length > 0) {
    const fields = collectFieldValues();
    if (!fields) {
      return;
    }
    tableAnnotation.fields = fields;
  }

  const result = await persistAnnotation();
  if (result.success) {
    captureSavedAnnotation();
    showTableStatus('标注已保存');
    showFieldStatus('');
    resetDirtyFlags();
  } else {
    showTableStatus(result.error || '保存失败');
  }
}

function handleCancelAnnotation() {
  if (!savedAnnotationSnapshot || !currentSheet) {
    return;
  }
  tableAnnotation = cloneAnnotation(savedAnnotationSnapshot);
  updateTableForm();
  resetDirtyFlags();
  if (annotationWritable) {
    showTableStatus('已取消未保存的修改');
  }
}

function getSelectedTableType() {
  const checked = tableTypeRadios.find(radio => radio.checked);
  return checked ? checked.value : '';
}

function resetFieldArea(message) {
  fieldDefinitionRequestId += 1;
  if (fieldList) {
    fieldList.innerHTML = `<div class="detail-empty">${escapeHtml(message)}</div>`;
  }
  showFieldStatus('');
}

function syncFieldValuesIfPossible() {
  if (!tableAnnotation || !fieldList) {
    return false;
  }
  const rows = fieldList.querySelectorAll('.field-row');
  if (!rows.length) {
    return false;
  }
  const fields = collectFieldValues();
  if (fields) {
    tableAnnotation.fields = fields;
    return true;
  }
  return false;
}

function refreshFieldAnnotationArea() {
  if (!tableAnnotation || !currentSheet) {
    resetFieldArea('请选择左侧页签以编辑字段标注');
    return;
  }
  if (!tableAnnotation.tableType) {
    resetFieldArea('请选择表类型后标注字段');
    return;
  }
  if (!currentProject || !currentProject.configDir) {
    resetFieldArea('未设置配置目录，无法读取字段');
    return;
  }
  loadFieldDefinitions();
}

async function loadFieldDefinitions() {
  const api = getElectronAPI();
  if (!api.getSheetFields) {
    resetFieldArea('当前版本不支持字段标注');
    return;
  }

  const requestId = ++fieldDefinitionRequestId;
  fieldList.innerHTML = '<div class="detail-empty">正在解析字段，请稍候...</div>';
  showFieldStatus('');

  try {
    const result = await api.getSheetFields({
      configDir: currentProject.configDir,
      fileName: currentSheet.fileName,
      sheetName: currentSheet.sheetName,
      tableType: tableAnnotation.tableType
    });

    if (requestId !== fieldDefinitionRequestId) {
      return;
    }

    if (!result || !result.success) {
      resetFieldArea(result?.error || '解析字段失败');
      return;
    }

    renderFieldRows(result.fields || []);
    if (fieldDetailSubtitle && currentSheet) {
      fieldDetailSubtitle.textContent = `${currentSheet.fileName} › ${currentSheet.sheetName}`;
    }
    if (!annotationWritable) {
      showFieldStatus('未设置标注目录，无法保存');
    } else {
      showFieldStatus('');
    }
    clearFieldAnnotationDirty();
  } catch (error) {
    if (requestId !== fieldDefinitionRequestId) {
      return;
    }
    resetFieldArea(error.message || '解析字段失败');
  }
}

function renderFieldRows(fieldNames) {
  if (!fieldNames || fieldNames.length === 0) {
    fieldList.innerHTML = '<div class="detail-empty">未解析到字段，请确认表结构</div>';
    return;
  }

  const storedMap = new Map();
  (tableAnnotation.fields || []).forEach(field => {
    if (field && field.name) {
      storedMap.set(field.name, field);
    }
  });

  const isListTable = tableAnnotation?.tableType === 'list';

  const rows = fieldNames.map(name => {
    const stored = storedMap.get(name) || {};
    const type = stored.type === 'number' ? 'number' : 'string';
    const minValue = stored.min ?? '';
    const maxValue = stored.max ?? '';
    const alias = stored.alias || '';
    const nullable = stored.nullable === true;
    const isPrimaryKey = isListTable && alias === 'id';
    const rangeClass = `field-range${type === 'number' ? '' : ' hidden'}`;
    const nullableTemplate = isListTable
      ? `
        <label class="nullable-toggle">
          <input type="checkbox" class="field-nullable-toggle"${nullable ? ' checked' : ''}>
          <span>允许为空</span>
        </label>
      `
      : '';
    const primaryKeyTemplate = isListTable
      ? `
        <label class="primary-key-toggle">
          <input type="checkbox" class="field-primary-key-toggle"${isPrimaryKey ? ' checked' : ''}>
          <span>主键</span>
        </label>
      `
      : '';
    return `
      <div class="field-row" data-field-name="${escapeHtml(name)}">
        <div class="field-name">${escapeHtml(name)}</div>
        ${primaryKeyTemplate}
        <input type="text" class="field-alias-input" placeholder="字段名标注" value="${escapeHtml(alias)}"${isPrimaryKey ? ' disabled' : ''}>
        <select class="field-type-select"${isPrimaryKey ? ' disabled' : ''}>
          <option value="string"${type === 'string' ? ' selected' : ''}>字符串</option>
          <option value="number"${type === 'number' ? ' selected' : ''}>数值</option>
        </select>
        <div class="field-constraints">
          ${nullableTemplate}
          <div class="${rangeClass}">
            <div class="range-input-group">
              <span>最小值</span>
              <input type="text" class="range-input field-min-input" placeholder="数值" value="${escapeHtml(minValue.toString())}">
            </div>
            <div class="range-input-group">
              <span>最大值</span>
              <input type="text" class="range-input field-max-input" placeholder="数值" value="${escapeHtml(maxValue.toString())}">
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  fieldList.innerHTML = rows;

  const rowElements = fieldList.querySelectorAll('.field-row');
  rowElements.forEach(row => {
    const select = row.querySelector('.field-type-select');
    toggleRangeInputs(row, select.value === 'number');
    
    // 绑定主键复选框事件
    const primaryKeyToggle = row.querySelector('.field-primary-key-toggle');
    if (primaryKeyToggle) {
      primaryKeyToggle.addEventListener('change', (e) => {
        handlePrimaryKeyToggle(row, e.target.checked);
      });
    }
  });
}

function handlePrimaryKeyToggle(currentRow, isChecked) {
  if (!isChecked) {
    // 取消主键：恢复输入框和类型选择
    const aliasInput = currentRow.querySelector('.field-alias-input');
    const typeSelect = currentRow.querySelector('.field-type-select');
    if (aliasInput) {
      aliasInput.disabled = false;
      aliasInput.value = '';
    }
    if (typeSelect) {
      typeSelect.disabled = false;
      typeSelect.value = 'string';
      toggleRangeInputs(currentRow, false);
    }
    markFieldAnnotationDirty();
    return;
  }

  // 设置主键：先取消其他字段的主键
  const allRows = fieldList.querySelectorAll('.field-row');
  allRows.forEach(row => {
    if (row !== currentRow) {
      const otherToggle = row.querySelector('.field-primary-key-toggle');
      if (otherToggle && otherToggle.checked) {
        otherToggle.checked = false;
        const aliasInput = row.querySelector('.field-alias-input');
        const typeSelect = row.querySelector('.field-type-select');
        if (aliasInput) {
          aliasInput.disabled = false;
          aliasInput.value = '';
        }
        if (typeSelect) {
          typeSelect.disabled = false;
          typeSelect.value = 'string';
          toggleRangeInputs(row, false);
        }
      }
    }
  });

  // 设置当前字段为主键
  const aliasInput = currentRow.querySelector('.field-alias-input');
  const typeSelect = currentRow.querySelector('.field-type-select');
  if (aliasInput) {
    aliasInput.value = 'id';
    aliasInput.disabled = true;
  }
  if (typeSelect) {
    typeSelect.value = 'string';
    typeSelect.disabled = true;
    toggleRangeInputs(currentRow, false);
  }
  markFieldAnnotationDirty();
}

function toggleRangeInputs(row, isNumber) {
  if (!row) {
    return;
  }
  const rangeContainer = row.querySelector('.field-range');
  if (rangeContainer) {
    rangeContainer.classList.toggle('hidden', !isNumber);
  }
  const inputs = row.querySelectorAll('.range-input');
  inputs.forEach(input => {
    input.disabled = !isNumber;
    if (!isNumber) {
      input.value = '';
    }
  });
}

function collectFieldValues() {
  const rows = Array.from(fieldList.querySelectorAll('.field-row'));
  if (rows.length === 0) {
    showFieldStatus('暂无可保存字段');
    return null;
  }

  const fields = [];
  for (const row of rows) {
    const name = row.getAttribute('data-field-name');
    const aliasInput = row.querySelector('.field-alias-input');
    const nullableToggle = row.querySelector('.field-nullable-toggle');
    const typeSelect = row.querySelector('.field-type-select');
    const minInput = row.querySelector('.field-min-input');
    const maxInput = row.querySelector('.field-max-input');
    const primaryKeyToggle = row.querySelector('.field-primary-key-toggle');
    
    // 如果勾选了主键，强制设置为 id 和 string
    let alias = aliasInput.value.trim();
    let type = typeSelect.value === 'number' ? 'number' : 'string';
    if (primaryKeyToggle && primaryKeyToggle.checked) {
      alias = 'id';
      type = 'string';
    }
    let minValue = null;
    let maxValue = null;

    if (type === 'number') {
      const minText = (minInput.value || '').trim();
      const maxText = (maxInput.value || '').trim();
      if (minText) {
        minValue = Number(minText);
        if (Number.isNaN(minValue)) {
          showFieldStatus(`字段 ${name} 的最小值无效`);
          return null;
        }
      }
      if (maxText) {
        maxValue = Number(maxText);
        if (Number.isNaN(maxValue)) {
          showFieldStatus(`字段 ${name} 的最大值无效`);
          return null;
        }
      }
      if (minValue !== null && maxValue !== null && minValue > maxValue) {
        showFieldStatus(`字段 ${name} 的最小值不能大于最大值`);
        return null;
      }
    }

    fields.push({
      name,
      alias: alias,
      nullable: !!nullableToggle?.checked,
      type,
      min: type === 'number' ? minValue : null,
      max: type === 'number' ? maxValue : null
    });
  }

  return fields;
}

async function persistAnnotation() {
  const api = getElectronAPI();
  if (!api.saveSheetAnnotation) {
    return { success: false, error: '当前版本不支持保存标注' };
  }
  try {
    const result = await api.saveSheetAnnotation({
      annotationDir: currentProject.annotationDir,
      fileName: currentSheet.fileName,
      sheetName: currentSheet.sheetName,
      data: tableAnnotation
    });
    if (result && result.success) {
      return { success: true };
    }
    return { success: false, error: result?.error || '保存失败' };
  } catch (error) {
    return { success: false, error: error.message || '保存失败' };
  }
}

function showTableStatus(message) {
  if (tableStatus) {
    tableStatus.textContent = message || '';
  }
}

function showFieldStatus(message) {
  if (fieldStatus) {
    fieldStatus.textContent = message || '';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

function formatScriptLanguage(scriptLanguage) {
  return scriptLanguage === 'csharp' ? 'C#（Unity）' : 'TypeScript';
}

function formatPathForBadge(pathString) {
  if (!pathString) {
    return '未设置';
  }
  return pathString.length > 28 ? `…${pathString.slice(-27)}` : pathString;
}

async function showMessage(message, type = 'info') {
  const api = getElectronAPI();
  if (!api.showMessageBox) {
    alert(message);
    return;
  }
  await api.showMessageBox({ type, message, isConfirm: false });
}

async function showConfirm(message, type = 'info') {
  const api = getElectronAPI();
  if (!api.showMessageBox) {
    return confirm(message);
  }
  const result = await api.showMessageBox({ type, message, isConfirm: true });
  return result.confirmed || false;
}

function shouldTrackFieldInput(target) {
  if (!target) {
    return false;
  }
  return target.classList.contains('field-alias-input')
    || target.classList.contains('field-type-select')
    || target.classList.contains('field-nullable-toggle')
    || target.classList.contains('field-min-input')
    || target.classList.contains('field-max-input');
}

async function handleValidateAnnotations() {
  if (!currentProject) {
    await showMessage('请先加载工程', 'warning');
    return;
  }

  if (!currentProject.configDir) {
    await showMessage('工程未设置配置目录', 'warning');
    return;
  }

  if (!currentProject.annotationDir) {
    await showMessage('工程未设置标注目录', 'warning');
    return;
  }

  const api = getElectronAPI();
  if (!api.validateAnnotations) {
    await showMessage('当前版本不支持校验功能', 'error');
    return;
  }

  // 禁用按钮，显示加载状态
  if (validateBtn) {
    validateBtn.disabled = true;
    validateBtn.textContent = '校验中...';
  }

  try {
    const result = await api.validateAnnotations({
      configDir: currentProject.configDir,
      annotationDir: currentProject.annotationDir
    });

    if (!result || !result.success) {
      await showMessage(`校验失败：${result?.error || '未知错误'}`, 'error');
      return;
    }

    // 显示校验结果
    await showValidationResult(result);
  } catch (error) {
    await showMessage(`校验失败：${error.message || '未知错误'}`, 'error');
  } finally {
    // 恢复按钮状态
    if (validateBtn) {
      validateBtn.disabled = false;
      validateBtn.textContent = '校验';
    }
  }
}

async function showValidationResult(result) {
  const { summary, missingAnnotations, incompleteAnnotations, validAnnotations } = result;
  
  // 如果所有表都已完成，显示成功消息
  if (summary.allCompleted) {
    let message = `校验完成！\n\n`;
    message += `总计：${summary.total} 个配置表\n`;
    message += `已完成：${summary.completed} 个\n\n`;
    message += `✅ 所有配置表标注已完成！`;
    await showMessage(message, 'success');
    return;
  }

  // 有未完成的情况，显示详细信息
  let message = `校验完成！\n\n`;
  message += `总计：${summary.total} 个配置表\n`;
  message += `已完成：${summary.completed} 个\n`;
  message += `未标注：${summary.missing} 个\n`;
  message += `标注不完整：${summary.incomplete} 个\n\n`;

  // 显示未标注的表
  if (missingAnnotations.length > 0) {
    message += `未标注的表：\n`;
    missingAnnotations.forEach((item, index) => {
      if (index < 10) {
        message += `  • ${item.fileName} › ${item.sheetName}\n`;
      }
    });
    if (missingAnnotations.length > 10) {
      message += `  ... 还有 ${missingAnnotations.length - 10} 个未标注的表\n`;
    }
    message += `\n`;
  }

  // 显示标注不完整的表
  if (incompleteAnnotations.length > 0) {
    message += `标注不完整的表：\n`;
    incompleteAnnotations.forEach((item, index) => {
      if (index < 10) {
        message += `  • ${item.fileName} › ${item.sheetName} (${item.reason})\n`;
        if (Array.isArray(item.details) && item.details.length > 0) {
          const detailLines = item.details.slice(0, 3);
          detailLines.forEach(detail => {
            message += `      - ${detail}\n`;
          });
          if (item.details.length > 3) {
            message += `      ... 还有 ${item.details.length - 3} 条细节\n`;
          }
        }
      }
    });
    if (incompleteAnnotations.length > 10) {
      message += `  ... 还有 ${incompleteAnnotations.length - 10} 个标注不完整的表\n`;
    }
  }

  await showMessage(message, 'warning');
}

async function handleRefreshProject() {
  if (!currentProject) {
    await showMessage('当前没有加载工程', 'warning');
    return;
  }

  // 检查是否有未保存的修改
  if (hasPendingChanges()) {
    const confirmMessage = '您有未保存的标注修改，刷新将丢失这些修改。\n\n是否要继续刷新？';
    if (!(await showConfirm(confirmMessage, 'warning'))) {
      return;
    }
  }

  // 重新渲染工程信息，这会重置所有状态并重新加载配置结构
  renderProjectInfo();
}

async function handleExportProject() {
  if (!currentProject) {
    await showMessage('请先加载工程', 'warning');
    return;
  }

  if (!currentProject.configDir || !currentProject.annotationDir || !currentProject.jsonDir) {
    await showMessage('工程目录配置不完整，无法导出', 'warning');
    return;
  }

  // 1. 检查未保存修改
  if (hasPendingChanges()) {
    await showMessage('存在未保存的标注修改，请先保存后再导出。', 'warning');
    return;
  }

  const api = getElectronAPI();
  if (!api.validateAnnotations || !api.exportProject) {
    await showMessage('当前版本不支持导出功能', 'error');
    return;
  }

  // 禁用按钮
  if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.textContent = '校验中...';
  }

  try {
    // 2. 执行校验
    const validateResult = await api.validateAnnotations({
      configDir: currentProject.configDir,
      annotationDir: currentProject.annotationDir
    });

    if (!validateResult || !validateResult.success) {
      await showMessage(`导出被中断：校验过程发生错误 - ${validateResult?.error || '未知错误'}`, 'error');
      return;
    }

    const { summary } = validateResult;
    if (!summary.allCompleted) {
      // 校验不通过，显示问题并中断
      await showValidationResult(validateResult); // 复用展示逻辑
      return;
    }

    // 3. 校验通过，执行导出
    if (exportBtn) {
      exportBtn.textContent = '导出中...';
    }

    const exportResult = await api.exportProject({
      configDir: currentProject.configDir,
      annotationDir: currentProject.annotationDir,
      jsonDir: currentProject.jsonDir,
      scriptDir: currentProject.scriptDir,
      scriptLanguage: currentProject.scriptLanguage === 'csharp' ? 'csharp' : 'typescript'
    });

    if (exportResult && exportResult.success) {
      await showMessage('✅ 导出成功！所有 JSON 文件已生成。', 'success');
    } else {
      await showMessage(`导出失败：${exportResult?.error || '未知错误'}`, 'error');
    }

  } catch (error) {
    await showMessage(`导出过程中发生异常：${error.message}`, 'error');
  } finally {
    if (exportBtn) {
      exportBtn.disabled = false;
      exportBtn.textContent = '导出';
    }
  }
}

