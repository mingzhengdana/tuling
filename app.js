/* ============================================
   tuling · 班级回忆录（网页版）
   路由 + 视图
   ============================================ */

import * as db from './db.js'
import { esc, initialOf, formatTime, toast, openModal, closeModal, confirmDialog } from './utils.js'
import { openEditor } from './editor.js'

const viewEl = document.getElementById('view')
const tabbarEl = document.getElementById('tabbar')
const topbarEl = document.getElementById('topbar')
const topbarUserEl = document.getElementById('topbar-user')

const TAB_ROUTES = ['upload', 'class', 'mine']
const uploadState = { original: '', edited: '' }

let currentUser = db.getSession()

const ICONS = {
  upload:
    '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/></svg>',
  class:
    '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M4 17.5 9.5 12l4 4 2.5-2.5L20 17"/></svg>',
  mine:
    '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"/></svg>'
}

const TAB_LABELS = { upload: '上传', class: '查看班级', mine: '我的' }

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '')
  return hash.split('?')[0] || 'login'
}

function go(path) {
  if (location.hash === `#/${path}`) {
    render()
    return
  }
  location.hash = `#/${path}`
}

/* ---------------- 框架 ---------------- */

function renderTabbar(active) {
  tabbarEl.innerHTML = `<div class="tabbar-inner">${TAB_ROUTES.map(
    (key) =>
      `<a class="tab ${active === key ? 'active' : ''}" href="#/${key}">${ICONS[key]}<span>${TAB_LABELS[key]}</span></a>`
  ).join('')}</div>`
}

function renderTopbarUser() {
  topbarUserEl.innerHTML = `<a class="topbar-avatar" href="#/mine" title="${esc(
    currentUser.name
  )}">${esc(initialOf(currentUser.name))}</a>`
}

function render() {
  const page = currentRoute()
  currentUser = db.getSession()

  if (!currentUser && page !== 'login') {
    location.replace('#/login')
    return
  }
  if (currentUser && page === 'login') {
    location.replace('#/upload')
    return
  }

  topbarEl.hidden = page === 'login'
  if (currentUser) renderTopbarUser()
  else topbarUserEl.innerHTML = ''

  tabbarEl.hidden = !TAB_ROUTES.includes(page)
  if (!tabbarEl.hidden) renderTabbar(page)

  if (page === 'login') renderLogin()
  else if (page === 'upload') renderUpload()
  else if (page === 'class') renderClass()
  else if (page === 'mine') renderMine()
  else if (page === 'admin') renderAdmin()
  else go('upload')

  window.scrollTo({ top: 0 })
}

/* ---------------- 登录 ---------------- */

function renderLogin() {
  viewEl.innerHTML = `
    <section class="login">
      <div class="login-hero">
        <div class="login-mark">t</div>
        <h1>tuling</h1>
        <p>班级回忆录 · 收集每一张照片，珍藏属于我们的时光</p>
      </div>
      <form class="card login-card" id="login-form">
        <label class="field">
          <span>账号</span>
          <input class="input" id="login-username" autocomplete="username" placeholder="请输入账号" />
        </label>
        <label class="field">
          <span>密码</span>
          <input class="input" id="login-password" type="password" autocomplete="current-password" placeholder="请输入密码" />
        </label>
        <button class="btn btn-primary btn-block" type="submit">登 录</button>
        <p class="hint">初始管理员账号 admin / 123456<br />成员账号由管理员统一创建</p>
      </form>
      <div class="login-foot">简单记录 · 共同珍藏</div>
    </section>
  `

  const form = document.getElementById('login-form')
  const submit = form.querySelector('button[type="submit"]')

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const username = document.getElementById('login-username').value.trim()
    const password = document.getElementById('login-password').value
    if (!username || !password) {
      toast('请输入账号和密码')
      return
    }
    submit.disabled = true
    try {
      await db.ensureInit()
      const user = await db.login(username, password)
      console.info('[Login] success', user.name, user.role)
      currentUser = user
      toast('登录成功')
      setTimeout(() => go('upload'), 200)
    } catch (err) {
      console.error('[Login] failed', err)
      toast(err.message || '登录失败')
      submit.disabled = false
    }
  })
}

/* ---------------- 上传 ---------------- */

function renderUpload() {
  viewEl.innerHTML = `
    <h1 class="page-title">上传照片</h1>
    <p class="page-sub">${esc(currentUser.name)}，记录今天的时光</p>
    <div id="upload-slot"></div>
    <input id="file-input" type="file" accept="image/*" hidden />
    <div class="card form-card">
      <label class="field">
        <span>照片标题</span>
        <input class="input" id="photo-title" maxlength="30" placeholder="给这张照片起个名字" />
      </label>
      <label class="field" style="margin-bottom:0">
        <span>想说的话</span>
        <textarea class="textarea" id="photo-remark" maxlength="120" placeholder="写下此刻的心情（选填）"></textarea>
        <span class="counter" id="remark-counter">0/120</span>
      </label>
    </div>
    <button class="btn btn-primary btn-block" id="submit-photo" style="margin-top:16px">上传到班级</button>
    <span class="tip">上传后可在「查看班级」中看到，仅本人或管理员可删除</span>
  `

  const fileInput = document.getElementById('file-input')
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0]
    fileInput.value = ''
    if (!file) return
    try {
      const dataUrl = await readAndCompress(file)
      uploadState.original = dataUrl
      uploadState.edited = ''
      renderUploadSlot()
      const edited = await openEditor(dataUrl)
      if (edited) uploadState.edited = edited
      renderUploadSlot()
    } catch (err) {
      console.error('[Upload] read file failed', err)
      toast('图片读取失败，请重试')
    }
  })

  const remark = document.getElementById('photo-remark')
  remark.addEventListener('input', () => {
    document.getElementById('remark-counter').textContent = `${remark.value.length}/120`
  })

  document.getElementById('submit-photo').onclick = async () => {
    const source = uploadState.edited || uploadState.original
    if (!source) {
      toast('请先选择一张照片')
      return
    }
    const titleInput = document.getElementById('photo-title')
    const button = document.getElementById('submit-photo')
    button.disabled = true
    button.textContent = '上传中...'
    try {
      await db.addPhoto({
        ownerId: currentUser.id,
        ownerName: currentUser.name,
        images: [source],
        title: titleInput.value.trim() || '未命名照片',
        remark: remark.value.trim(),
        createTime: Date.now()
      })
      uploadState.original = ''
      uploadState.edited = ''
      toast('已上传到班级')
      renderUpload()
    } catch (err) {
      console.error('[Upload] submit failed', err)
      toast('上传失败，请重试')
      button.disabled = false
      button.textContent = '上传到班级'
    }
  }

  renderUploadSlot()
}

function renderUploadSlot() {
  const slot = document.getElementById('upload-slot')
  if (!slot) return
  const source = uploadState.edited || uploadState.original

  if (!source) {
    slot.innerHTML = `
      <div class="upload-area" id="pick-area">
        <div class="plus"></div>
        <span class="upload-title">选择照片</span>
        <span class="upload-desc">支持裁剪、旋转、翻转后上传</span>
      </div>`
    document.getElementById('pick-area').onclick = () => document.getElementById('file-input').click()
    return
  }

  slot.innerHTML = `
    <div class="preview-card">
      <img class="preview-image" src="${source}" alt="待上传照片" />
      <div class="preview-bar">
        <button class="btn btn-ghost btn-sm" id="re-edit">编辑</button>
        <button class="btn btn-ghost btn-sm" id="re-pick">重选</button>
        <button class="btn btn-ghost btn-sm" id="remove-photo">移除</button>
        ${uploadState.edited ? '<span class="badge">已编辑</span>' : ''}
      </div>
    </div>`

  document.getElementById('re-pick').onclick = () => document.getElementById('file-input').click()
  document.getElementById('remove-photo').onclick = () => {
    uploadState.original = ''
    uploadState.edited = ''
    renderUploadSlot()
  }
  document.getElementById('re-edit').onclick = async () => {
    const edited = await openEditor(source)
    if (edited) uploadState.edited = edited
    renderUploadSlot()
  }
}

function readAndCompress(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const source = String(reader.result)
      const image = new Image()
      image.onload = () => {
        const max = 1600
        const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.naturalWidth * scale)
        canvas.height = Math.round(image.naturalHeight * scale)
        const ctx = canvas.getContext('2d')
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      }
      image.onerror = () => reject(new Error('图片解码失败'))
      image.src = source
    }
    reader.onerror = () => reject(reader.error || new Error('读取失败'))
    reader.readAsDataURL(file)
  })
}

/* ---------------- 查看班级 ---------------- */

async function renderClass() {
  viewEl.innerHTML = `
    <div class="class-head">
      <div>
        <h1 class="page-title">我们的班级</h1>
        <p class="page-sub" id="class-sub">共同收藏的照片</p>
      </div>
      <a class="btn btn-primary btn-sm" href="#/upload">去上传</a>
    </div>
    <div id="photo-grid" class="grid"></div>
    <p class="footer-note" id="class-foot">正在加载...</p>
  `

  try {
    const photos = await db.listPhotos()
    const sub = document.getElementById('class-sub')
    const grid = document.getElementById('photo-grid')
    const foot = document.getElementById('class-foot')
    if (!sub || !grid) return

    sub.textContent = `共同收藏 ${photos.length} 张照片`

    if (photos.length === 0) {
      grid.innerHTML = ''
      grid.insertAdjacentHTML(
        'afterend',
        `<div class="empty" id="class-empty">
          <div class="empty-icon"></div>
          <p class="empty-title">班级里还没有照片</p>
          <p class="empty-desc">点右上角「去上传」，留下第一张回忆</p>
        </div>`
      )
      foot.textContent = ''
      return
    }

    grid.innerHTML = photos
      .map(
        (photo) => `
        <article class="photo-card" data-id="${esc(photo.id)}">
          <img class="photo-thumb" src="${esc(photo.images[0])}" alt="${esc(photo.title)}" loading="lazy" />
          <div class="photo-info">
            <h3 class="photo-title">${esc(photo.title)}</h3>
            <div class="photo-meta">
              <span class="photo-owner">${esc(photo.ownerName)}</span>
              <span>${formatTime(photo.createTime)}</span>
            </div>
          </div>
        </article>`
      )
      .join('')

    foot.textContent = '已经到底啦'
    grid.querySelectorAll('.photo-card').forEach((card) => {
      card.addEventListener('click', () => {
        const photo = photos.find((item) => item.id === card.dataset.id)
        if (photo) openDetail(photo)
      })
    })
  } catch (err) {
    console.error('[Class] load failed', err)
    const foot = document.getElementById('class-foot')
    if (foot) foot.textContent = '加载失败，请刷新重试'
  }
}

function openDetail(photo) {
  const canDelete = currentUser && (currentUser.role === 'admin' || currentUser.id === photo.ownerId)
  openModal(
    `<div class="modal detail-modal">
      <img class="detail-image" src="${esc(photo.images[0])}" alt="${esc(photo.title)}" />
      <h3 class="detail-title">${esc(photo.title)}</h3>
      ${photo.remark ? `<p class="detail-remark">${esc(photo.remark)}</p>` : ''}
      <div class="detail-meta">
        <span class="detail-owner">${esc(photo.ownerName)}</span>
        <span>${formatTime(photo.createTime)}</span>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>关闭</button>
        ${canDelete ? '<button class="btn btn-danger" data-delete>删除</button>' : ''}
      </div>
    </div>`,
    {
      onMount: (root) => {
        root.querySelector('[data-close]').onclick = () => closeModal()
        const deleteBtn = root.querySelector('[data-delete]')
        if (deleteBtn) {
          deleteBtn.onclick = async () => {
            const confirmed = await confirmDialog({
              title: '删除照片',
              content: '删除后无法恢复，确定删除吗？',
              confirmText: '删除',
              danger: true
            })
            if (!confirmed) return
            try {
              await db.deletePhoto(photo.id)
              closeModal()
              toast('已删除')
              renderClass()
            } catch (err) {
              console.error('[Detail] delete failed', err)
              toast('删除失败')
            }
          }
        }
      }
    }
  )
}

/* ---------------- 我的 ---------------- */

async function renderMine() {
  viewEl.innerHTML = `
    <div class="card profile-card">
      <div class="profile-top">
        <div class="avatar">${esc(initialOf(currentUser.name))}</div>
        <div class="profile-info">
          <h2 class="profile-name">${esc(currentUser.name)}</h2>
          <p class="profile-account">账号：${esc(currentUser.username)}</p>
        </div>
        <span class="tag ${currentUser.role === 'admin' ? 'tag-dark' : ''}">${
    currentUser.role === 'admin' ? '管理员' : '成员'
  }</span>
      </div>
      <div class="stats">
        <div class="stat">
          <div class="stat-value" id="my-count">0</div>
          <div class="stat-label">我的上传</div>
        </div>
        <div class="stat-line"></div>
        <div class="stat">
          <div class="stat-value" id="class-count">0</div>
          <div class="stat-label">班级照片</div>
        </div>
      </div>
    </div>

    <div class="card menu-card">
      <button class="menu-item" data-action="password">修改密码<span class="menu-arrow">›</span></button>
      ${
        currentUser.role === 'admin'
          ? '<button class="menu-item" data-action="admin">成员与人数管理<span class="menu-arrow">›</span></button>'
          : ''
      }
      <button class="menu-item" data-action="upload">上传照片<span class="menu-arrow">›</span></button>
    </div>

    <div class="card menu-card">
      <button class="menu-item menu-danger" data-action="logout">退出登录</button>
    </div>

    <div class="version">tuling · v1.0</div>
  `

  viewEl.querySelectorAll('[data-action]').forEach((button) => {
    button.onclick = () => {
      const action = button.dataset.action
      if (action === 'password') openChangePassword()
      if (action === 'admin') go('admin')
      if (action === 'upload') go('upload')
      if (action === 'logout') handleLogout()
    }
  })

  try {
    const [all, mine] = await Promise.all([db.countPhotos(), db.countPhotos(currentUser.id)])
    const myEl = document.getElementById('my-count')
    const classEl = document.getElementById('class-count')
    if (myEl) myEl.textContent = String(mine)
    if (classEl) classEl.textContent = String(all)
  } catch (err) {
    console.error('[Mine] stats failed', err)
  }
}

function openChangePassword() {
  openModal(
    `<div class="modal">
      <h3 class="modal-title">修改密码</h3>
      <label class="field"><span>原密码</span><input class="input" type="password" id="old-password" placeholder="请输入当前密码" /></label>
      <label class="field"><span>新密码</span><input class="input" type="password" id="new-password" placeholder="至少 4 位" /></label>
      <label class="field"><span>确认新密码</span><input class="input" type="password" id="confirm-password" placeholder="再次输入新密码" /></label>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-cancel>取消</button>
        <button class="btn btn-primary" data-ok>保存</button>
      </div>
    </div>`,
    {
      onMount: (root) => {
        root.querySelector('[data-cancel]').onclick = () => closeModal()
        root.querySelector('[data-ok]').onclick = async () => {
          const oldPassword = root.querySelector('#old-password').value
          const newPassword = root.querySelector('#new-password').value
          const confirmPassword = root.querySelector('#confirm-password').value
          if (!oldPassword || !newPassword) return toast('请填写完整')
          if (newPassword !== confirmPassword) return toast('两次输入的新密码不一致')
          try {
            await db.changePassword(currentUser.id, oldPassword, newPassword)
            closeModal()
            toast('密码已修改')
          } catch (err) {
            console.error('[Password] change failed', err)
            toast(err.message || '修改失败')
          }
        }
      }
    }
  )
}

async function handleLogout() {
  const confirmed = await confirmDialog({
    title: '退出登录',
    content: '确定要退出当前账号吗？',
    confirmText: '退出',
    danger: true
  })
  if (!confirmed) return
  db.clearSession()
  currentUser = null
  uploadState.original = ''
  uploadState.edited = ''
  go('login')
}

/* ---------------- 管理员 ---------------- */

async function renderAdmin() {
  if (!currentUser || currentUser.role !== 'admin') {
    viewEl.innerHTML = '<div class="empty"><p class="empty-title">仅管理员可访问该页面</p></div>'
    return
  }

  viewEl.innerHTML = '<div class="empty"><p class="empty-title">正在加载成员...</p></div>'

  let users = []
  let config = { maxUsers: 30 }
  try {
    const result = await Promise.all([db.getUsers(), db.getConfig()])
    users = result[0]
    config = result[1]
  } catch (err) {
    console.error('[Admin] load failed', err)
    viewEl.innerHTML = '<div class="empty"><p class="empty-title">加载失败，请检查网络后重试</p></div>'
    return
  }

  const memberCount = users.filter((user) => user.role === 'member').length
  const remaining = Math.max(config.maxUsers - memberCount, 0)

  viewEl.innerHTML = `
    <div class="admin-head">
      <button class="back-btn" id="admin-back">←</button>
      <div>
        <h1 class="page-title">成员管理</h1>
        <p class="page-sub">账号密码与班级人数由管理员设置</p>
      </div>
    </div>

    <div class="card max-card">
      <div class="max-head">
        <span class="section-title">班级人数上限</span>
        <span class="section-sub">已添加 ${memberCount} / ${config.maxUsers} 人</span>
      </div>
      <div class="max-row">
        <input class="input" id="max-input" type="number" min="1" max="200" value="${config.maxUsers}" />
        <button class="btn btn-primary" id="save-max">保存</button>
      </div>
      <p class="section-sub" style="margin:10px 0 0">上限范围 1~200，新增成员不能超过该人数</p>
    </div>

    <div class="list-head">
      <span class="section-title">成员列表</span>
      <span class="section-sub">共 ${memberCount} 位成员</span>
    </div>

    <div class="member-list">
      ${users
        .map(
          (user) => `
        <div class="member-row" data-id="${esc(user.id)}">
          <div class="member-avatar ${user.role === 'admin' ? 'dark' : ''}">${esc(initialOf(user.name))}</div>
          <div class="member-main">
            <div class="member-name-row">
              <span class="member-name">${esc(user.name)}</span>
              ${user.role === 'admin' ? '<span class="mini-tag">管理员</span>' : ''}
              ${user.status === 'disabled' ? '<span class="mini-tag red">已停用</span>' : ''}
            </div>
            <p class="member-account">账号：${esc(user.username)}</p>
          </div>
          ${
            user.role === 'admin'
              ? ''
              : `<button class="btn btn-ghost btn-sm" data-manage>管理</button>`
          }
        </div>`
        )
        .join('')}
      <button class="add-row" id="add-member">＋ 新增成员（剩余 ${remaining} 个名额）</button>
    </div>

    <p class="tip">成员使用管理员设置的账号密码登录，照片在班级内共享</p>
  `

  document.getElementById('admin-back').onclick = () => go('mine')

  document.getElementById('save-max').onclick = async () => {
    try {
      const value = document.getElementById('max-input').value
      await db.setMaxUsers(value)
      toast('已保存')
      renderAdmin()
    } catch (err) {
      console.error('[Admin] save max failed', err)
      toast(err.message || '保存失败')
    }
  }

  document.getElementById('add-member').onclick = openAddMember

  viewEl.querySelectorAll('.member-row').forEach((row) => {
    const manage = row.querySelector('[data-manage]')
    if (!manage) return
    manage.onclick = () => {
      const member = users.find((item) => item.id === row.dataset.id)
      if (member) openMemberActions(member)
    }
  })
}

function openAddMember() {
  openModal(
    `<div class="modal">
      <h3 class="modal-title">新增成员</h3>
      <label class="field"><span>姓名</span><input class="input" id="member-name" placeholder="如：林晓" /></label>
      <label class="field"><span>登录账号</span><input class="input" id="member-username" placeholder="字母或数字，如 linxiao" /></label>
      <label class="field"><span>登录密码</span><input class="input" id="member-password" placeholder="至少 4 位" /></label>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-cancel>取消</button>
        <button class="btn btn-primary" data-ok>确定</button>
      </div>
    </div>`,
    {
      onMount: (root) => {
        root.querySelector('[data-cancel]').onclick = () => closeModal()
        root.querySelector('[data-ok]').onclick = async () => {
          try {
            await db.addMember({
              name: root.querySelector('#member-name').value,
              username: root.querySelector('#member-username').value,
              password: root.querySelector('#member-password').value
            })
            closeModal()
            toast('已添加')
            renderAdmin()
          } catch (err) {
            console.error('[Admin] add member failed', err)
            toast(err.message || '添加失败')
          }
        }
      }
    }
  )
}

function openMemberActions(member) {
  openModal(
    `<div class="modal">
      <h3 class="modal-title">${esc(member.name)}</h3>
      <div class="action-list">
        <button class="action-item" data-act="reset">重置密码</button>
        <button class="action-item" data-act="toggle">${member.status === 'active' ? '停用账号' : '启用账号'}</button>
        <button class="action-item danger" data-act="delete">删除成员</button>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-block" data-cancel>取消</button>
      </div>
    </div>`,
    {
      onMount: (root) => {
        root.querySelector('[data-cancel]').onclick = () => closeModal()
        root.querySelector('[data-act="reset"]').onclick = () => openResetPassword(member)
        root.querySelector('[data-act="toggle"]').onclick = async () => {
          try {
            await db.updateMember(member.id, {
              status: member.status === 'active' ? 'disabled' : 'active'
            })
            closeModal()
            toast(member.status === 'active' ? '已停用' : '已启用')
            renderAdmin()
          } catch (err) {
            console.error('[Admin] toggle failed', err)
            toast(err.message || '操作失败')
          }
        }
        root.querySelector('[data-act="delete"]').onclick = async () => {
          const confirmed = await confirmDialog({
            title: '删除成员',
            content: `确定删除成员「${member.name}」吗？该账号将无法登录。`,
            confirmText: '删除',
            danger: true
          })
          if (!confirmed) return
          try {
            await db.removeMember(member.id)
            closeModal()
            toast('已删除')
            renderAdmin()
          } catch (err) {
            console.error('[Admin] delete failed', err)
            toast(err.message || '删除失败')
          }
        }
      }
    }
  )
}

function openResetPassword(member) {
  openModal(
    `<div class="modal">
      <h3 class="modal-title">重置「${esc(member.name)}」的密码</h3>
      <label class="field"><span>新密码</span><input class="input" id="reset-password" placeholder="至少 4 位" /></label>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-cancel>取消</button>
        <button class="btn btn-primary" data-ok>确定</button>
      </div>
    </div>`,
    {
      onMount: (root) => {
        root.querySelector('[data-cancel]').onclick = () => closeModal()
        root.querySelector('[data-ok]').onclick = async () => {
          try {
            await db.updateMember(member.id, { password: root.querySelector('#reset-password').value })
            closeModal()
            toast('密码已重置')
            renderAdmin()
          } catch (err) {
            console.error('[Admin] reset password failed', err)
            toast(err.message || '操作失败')
          }
        }
      }
    }
  )
}

/* ---------------- 启动 ---------------- */

window.addEventListener('hashchange', render)

async function bootstrap() {
  try {
    await db.ensureInit()
  } catch (err) {
    console.error('[Bootstrap] init failed', err)
  }
  try {
    const fresh = await db.refreshSession()
    if (fresh) currentUser = fresh
  } catch (err) {
    console.error('[Bootstrap] refresh session failed', err)
  }
  render()
}

bootstrap()
