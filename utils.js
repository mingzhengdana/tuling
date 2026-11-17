/* ============================================
   通用工具：转义、时间、提示、弹层
   ============================================ */

export function esc(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function initialOf(name) {
  if (!name) return '?'
  return String(name).trim().slice(0, 1)
}

function pad(value) {
  return String(value).padStart(2, '0')
}

export function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (sameDay) return `今天 ${hm}`

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  if (isYesterday) return `昨天 ${hm}`

  if (date.getFullYear() === now.getFullYear()) {
    return `${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${hm}`
  }
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日`
}

let toastTimer = null

export function toast(message, duration = 1800) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = message
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    el.hidden = true
  }, duration)
}

export function openModal(html, options = {}) {
  const root = document.getElementById('modal-root')
  root.innerHTML = `<div class="modal-mask" data-mask>${html}</div>`
  root.classList.add('open')
  const mask = root.querySelector('[data-mask]')
  mask.addEventListener('click', (event) => {
    if (event.target !== mask) return
    closeModal()
    if (options.onDismiss) options.onDismiss()
  })
  if (options.onMount) options.onMount(root)
  return root
}

export function closeModal() {
  const root = document.getElementById('modal-root')
  if (!root) return
  root.innerHTML = ''
  root.classList.remove('open')
}

export function confirmDialog(options) {
  const { title, content, confirmText = '确定', cancelText = '取消', danger = false } = options
  return new Promise((resolve) => {
    openModal(
      `<div class="modal">
        <h3 class="modal-title">${esc(title)}</h3>
        <p class="modal-text">${esc(content)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-cancel>${esc(cancelText)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${esc(confirmText)}</button>
        </div>
      </div>`,
      {
        onMount: (root) => {
          root.querySelector('[data-cancel]').onclick = () => {
            closeModal()
            resolve(false)
          }
          root.querySelector('[data-confirm]').onclick = () => {
            closeModal()
            resolve(true)
          }
        },
        onDismiss: () => resolve(false)
      }
    )
  })
}
