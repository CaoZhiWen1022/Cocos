let isSubmitting = false;

document.addEventListener('DOMContentLoaded', () => {
  bindFormEvents();
});

function getElectronAPI() {
  return window.electronAPI || {};
}

async function showMessage(message, type = 'info') {
  const api = getElectronAPI();
  if (!api.showMessageBox) {
    alert(message);
    return;
  }
  await api.showMessageBox({ type, message, isConfirm: false });
}

function bindFormEvents() {
  const form = document.getElementById('createProjectForm');
  const cancelBtn = document.getElementById('cancelBtn');
  // const closeWindowBtn = document.getElementById('closeWindowBtn');

  form.addEventListener('submit', handleSubmit);
  cancelBtn.addEventListener('click', handleCancel);
  // closeWindowBtn.addEventListener('click', handleCancel);

  document.querySelectorAll('.btn-select').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetId = btn.getAttribute('data-target');
      await handleSelectDirectory(targetId);
    });
  });
}

async function handleSelectDirectory(targetId) {
  try {
    const api = getElectronAPI();
    if (!api.selectDirectory) {
      await showMessage('当前窗口不支持目录选择接口', 'error');
      return;
    }
    const result = await api.selectDirectory();
    if (!result.success || !result.path) {
      return;
    }

    const input = document.getElementById(targetId);
    if (input) {
      input.value = result.path;
    }

    if (targetId === 'configDir') {
      autoFillProjectName(result.path);
    }
  } catch (error) {
    console.error('选择目录失败:', error);
    await showMessage('选择目录失败: ' + error.message, 'error');
  }
}

function autoFillProjectName(dirPath) {
  const projectNameInput = document.getElementById('projectName');
  if (projectNameInput && !projectNameInput.value.trim()) {
    const dirName = dirPath.split(/[/\\]/).pop() || '新工程';
    projectNameInput.value = dirName;
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (isSubmitting) {
    return;
  }

  const projectName = document.getElementById('projectName').value.trim();
  const configDir = document.getElementById('configDir').value.trim();
  const jsonDir = document.getElementById('jsonDir').value.trim();
  const annotationDir = document.getElementById('annotationDir').value.trim();
  const scriptDir = document.getElementById('scriptDir').value.trim();

  if (!projectName) {
    await showMessage('请输入工程名称', 'warning');
    document.getElementById('projectName').focus();
    return;
  }

  if (!configDir) {
    await showMessage('请选择配置目录', 'warning');
    return;
  }

  if (!annotationDir) {
    await showMessage('请选择标注目录', 'warning');
    return;
  }

  if (!jsonDir) {
    await showMessage('请选择导出 JSON 目录', 'warning');
    return;
  }

  if (!scriptDir) {
    await showMessage('请选择脚本文件目录', 'warning');
    return;
  }

  const projectData = {
    name: projectName,
    configDir,
    annotationDir,
    jsonDir,
    scriptDir,
    lastModified: Date.now()
  };

  await submitProject(projectData);
}

async function submitProject(projectData) {
  const confirmBtn = document.getElementById('confirmBtn');
  isSubmitting = true;
  confirmBtn.disabled = true;
  confirmBtn.textContent = '创建中...';

  try {
    const api = getElectronAPI();
    if (!api.saveProject || !api.notifyProjectCreated) {
      await showMessage('当前窗口缺少保存工程接口', 'error');
      return;
    }
    const saveResult = await api.saveProject(projectData);
    if (saveResult.success) {
      api.notifyProjectCreated(projectData);
    } else {
      await showMessage('保存工程失败: ' + (saveResult.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('创建工程失败:', error);
    await showMessage('创建工程失败: ' + error.message, 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = '创建工程';
    isSubmitting = false;
  }
}

function handleCancel() {
  const api = getElectronAPI();
  api.closeCreateProjectWindow && api.closeCreateProjectWindow();
}

