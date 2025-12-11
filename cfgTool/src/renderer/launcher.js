document.addEventListener('DOMContentLoaded', () => {
  init();
  registerProjectUpdates();
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

async function showConfirm(message, type = 'info') {
  const api = getElectronAPI();
  if (!api.showMessageBox) {
    return confirm(message);
  }
  const result = await api.showMessageBox({ type, message, isConfirm: true });
  return result.confirmed || false;
}

async function init() {
  await loadProjects();
  const createProjectBtn = document.getElementById('createProjectBtn');
  if (createProjectBtn) {
    createProjectBtn.addEventListener('click', () => {
      const api = getElectronAPI();
      api.openCreateProjectWindow && api.openCreateProjectWindow();
    });
  }
}

function registerProjectUpdates() {
  const api = getElectronAPI();
  if (!api.onProjectsUpdated) {
    return;
  }
  api.onProjectsUpdated(async () => {
    await loadProjects();
  });
}

async function loadProjects() {
  const projectsList = document.getElementById('projectsList');
  if (!projectsList) {
    return;
  }
  projectsList.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const api = getElectronAPI();
    const projects = api.getProjects ? await api.getProjects() : [];

    if (!projects || projects.length === 0) {
      projectsList.innerHTML = `
        <div class="project-card empty">
          <div class="empty-state">
            <div class="empty-state-icon">📁</div>
            <div class="empty-state-text">暂无历史工程<br>点击上方按钮创建新工程</div>
          </div>
        </div>
      `;
      return;
    }

    projectsList.innerHTML = projects.map(project => createProjectCard(project)).join('');

    projects.forEach((project, index) => {
      const card = projectsList.children[index];
      if (!card || card.classList.contains('empty')) {
        return;
      }

      card.addEventListener('click', (e) => {
        if (!e.target.closest('.project-actions')) {
          openProject(project);
        }
      });

      const deleteBtn = card.querySelector('.btn-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteProject(project.name);
        });
      }
    });
  } catch (error) {
    console.error('加载历史工程失败:', error);
    projectsList.innerHTML = `
      <div class="project-card empty">
        <div class="empty-state">
          <div class="empty-state-text">加载失败，请重试</div>
        </div>
      </div>
    `;
  }
}

function createProjectCard(project) {
  const date = new Date(project.lastModified || Date.now());
  const dateStr = date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const displayPath = project.configDir || project.path || '';

  return `
    <div class="project-card" data-project-name="${escapeHtml(project.name || '')}">
      <div class="project-actions">
        <button class="btn-icon-small btn-delete" title="删除">🗑️</button>
      </div>
      <div class="project-name">${escapeHtml(project.name || '未命名工程')}</div>
      <div class="project-path" title="${escapeHtml(displayPath)}">${escapeHtml(displayPath)}</div>
      <div class="project-meta">
        <span>最后修改: ${dateStr}</span>
      </div>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function openProject(project) {
  const api = getElectronAPI();
  api.openProject && api.openProject(project);
}

async function deleteProject(projectName) {
  if (!projectName) {
    return;
  }
  const confirmed = await showConfirm(
    `确定要删除工程 "${projectName}" 吗？\n\n注意：这只会从历史记录中删除，不会删除工程文件。`,
    'warning'
  );
  if (!confirmed) {
    return;
  }

  try {
    const api = getElectronAPI();
    const result = api.deleteProject
      ? await api.deleteProject(projectName)
      : { success: false, error: '接口不可用' };
    if (result.success) {
      await loadProjects();
    } else {
      await showMessage('删除工程失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('删除工程失败:', error);
    await showMessage('删除工程失败: ' + error.message, 'error');
  }
}

