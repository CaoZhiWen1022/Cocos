let messageType = 'info';
let isConfirm = false;

document.addEventListener('DOMContentLoaded', () => {
  const messageText = document.getElementById('messageText');
  const confirmBtn = document.getElementById('confirmBtn');
  const cancelBtn = document.getElementById('cancelBtn');

  // 使用 electronAPI（通过 preload）
  const electronAPI = window.electronAPI || {};

  // 监听主进程发送的消息
  if (electronAPI.onShowMessage) {
    electronAPI.onShowMessage((data) => {
      const { type, message, isConfirmDialog } = data;
      messageType = type || 'info';
      isConfirm = isConfirmDialog || false;

      messageText.textContent = message || '';

      // 总是显示按钮栏
      const messageButtons = document.getElementById('messageButtons');
      messageButtons.classList.remove('hidden');
      confirmBtn.textContent = '确定';
      
      if (isConfirm) {
        cancelBtn.classList.remove('hidden');
        messageButtons.classList.add('has-cancel');
        cancelBtn.textContent = '取消';
      } else {
        cancelBtn.classList.add('hidden');
        messageButtons.classList.remove('has-cancel');
      }
      
      // 聚焦确定按钮
      setTimeout(() => confirmBtn.focus(), 100);

      // 发送内容高度给主进程以调整窗口大小
      requestAnimationFrame(() => {
        const box = document.querySelector('.message-box');
        if (box) {
          const height = box.offsetHeight;
          const width = box.offsetWidth;
          const electronAPI = window.electronAPI || {};
          if (electronAPI.resizeMessageBox) {
            electronAPI.resizeMessageBox(width, height);
          }
        }
      });
    });
  }

  confirmBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (electronAPI.sendMessageResult) {
      electronAPI.sendMessageResult(true);
    }
  });

  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (electronAPI.sendMessageResult) {
      electronAPI.sendMessageResult(false);
    }
  });

  // ESC 键关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (electronAPI.sendMessageResult) {
        electronAPI.sendMessageResult(isConfirm ? false : true);
      }
    } else if (e.key === 'Enter' && document.activeElement !== cancelBtn) {
      // 如果按钮区域可见，按回车触发确定
      if (isConfirm) {
        confirmBtn.click();
      } else {
        // 非 confirm 模式回车也可关闭
        if (electronAPI.sendMessageResult) {
          electronAPI.sendMessageResult(true);
        }
      }
    }
  });
});
