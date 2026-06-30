let modalRoot = null;

function getModal() {
  if (modalRoot) return modalRoot;

  modalRoot = document.createElement('div');
  modalRoot.id = 'confirm-modal-root';
  modalRoot.innerHTML = `
    <div class="confirm-overlay" hidden>
      <div class="confirm-dialog panel" role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-desc">
        <div class="confirm-icon-wrap" aria-hidden="true">
          <svg class="confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M10 11v6M14 11v6" stroke-linecap="round"/>
          </svg>
        </div>
        <h2 id="confirm-modal-title" class="confirm-title"></h2>
        <p id="confirm-modal-desc" class="confirm-message"></p>
        <div class="confirm-actions">
          <button type="button" class="btn btn-ghost confirm-cancel"></button>
          <button type="button" class="btn btn-danger confirm-ok"></button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalRoot);
  return modalRoot;
}

/**
 * @param {{ title: string, message: string, confirmLabel?: string, cancelLabel?: string, highlight?: string }} opts
 * @returns {Promise<boolean>}
 */
export function confirmAction(opts) {
  const {
    title,
    message,
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    highlight = '',
  } = opts;

  const root = getModal();
  const overlay = root.querySelector('.confirm-overlay');
  const titleEl = root.querySelector('#confirm-modal-title');
  const messageEl = root.querySelector('#confirm-modal-desc');
  const cancelBtn = root.querySelector('.confirm-cancel');
  const okBtn = root.querySelector('.confirm-ok');

  titleEl.textContent = title;
  if (highlight) {
    const safe = highlight
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    messageEl.innerHTML = message.replace(
      safe,
      `<strong class="confirm-highlight">${safe}</strong>`
    );
  } else {
    messageEl.textContent = message;
  }
  cancelBtn.textContent = cancelLabel;
  okBtn.textContent = confirmLabel;

  let previousFocus = document.activeElement;

  return new Promise((resolve) => {
    function close(result) {
      overlay.hidden = true;
      document.body.classList.remove('confirm-open');
      document.removeEventListener('keydown', onKey);
      cancelBtn.removeEventListener('click', onCancel);
      okBtn.removeEventListener('click', onOk);
      overlay.removeEventListener('click', onOverlay);
      if (previousFocus?.focus) previousFocus.focus();
      resolve(result);
    }

    function onCancel() {
      close(false);
    }

    function onOk() {
      close(true);
    }

    function onKey(e) {
      if (e.key === 'Escape') onCancel();
    }

    function onOverlay(e) {
      if (e.target === overlay) onCancel();
    }

    cancelBtn.addEventListener('click', onCancel);
    okBtn.addEventListener('click', onOk);
    overlay.addEventListener('click', onOverlay);
    document.addEventListener('keydown', onKey);

    document.body.classList.add('confirm-open');
    overlay.hidden = false;
    cancelBtn.focus();
  });
}
