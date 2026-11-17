/* ============================================
   数据层：Supabase 云数据库（REST）
   账号 / 配置 / 照片全部云端共享
   ============================================ */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'

const SESSION_KEY = 'tuling_session_v1'
const TOKEN_KEY = 'tuling_token_v1'
const TABLE_USERS = 'tu_users'
const TABLE_CONFIG = 'tu_config'
const TABLE_PHOTOS = 'tu_photos'
const USER_COLUMNS = 'id,username,name,role,status,create_time,last_login_time'

let initPromise = null
let sessionToken = localStorage.getItem(TOKEN_KEY) || ''

function authHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'x-app-token': sessionToken
  }
}

async function request(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('云端数据库尚未配置')
  }
  let response
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: options.method || 'GET',
      headers: {
        ...authHeaders(),
        ...(options.headers || {})
      },
      body: options.body
    })
  } catch (err) {
    console.error('[Supabase] network failed', path, err)
    throw new Error('无法连接云数据库，请检查网络')
  }

  if (!response.ok) {
    const detail = await response.text()
    console.error('[Supabase] request failed', path, response.status, detail)
    if (response.status === 401 || response.status === 403) {
      clearSession()
      throw new Error('登录已过期，请重新登录')
    }
    if (response.status === 409) throw new Error('数据冲突，请重试')
    throw new Error('云数据库请求失败，请稍后重试')
  }

  const text = await response.text()
  return text ? JSON.parse(text) : null
}

async function rpc(name, payload = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('云端数据库尚未配置')
  }
  let response
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    })
  } catch (err) {
    console.error('[Supabase] rpc network failed', name, err)
    throw new Error('无法连接云数据库，请检查网络')
  }

  if (!response.ok) {
    const detail = await response.text()
    console.error('[Supabase] rpc failed', name, response.status, detail)
    throw new Error('云数据库请求失败，请稍后重试')
  }

  const text = await response.text()
  return text ? JSON.parse(text) : null
}

export async function hashPassword(password) {
  const raw = new TextEncoder().encode(`tuling::${password}`)
  const digest = await crypto.subtle.digest('SHA-256', raw)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    status: row.status,
    createTime: row.create_time,
    lastLoginTime: row.last_login_time
  }
}

function mapPhoto(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    images: row.images || [],
    title: row.title || '',
    remark: row.remark || '',
    createTime: row.create_time || 0
  }
}

/* ---------------- 初始化 ---------------- */

export function ensureInit() {
  if (!initPromise) {
    initPromise = doInit().catch((err) => {
      initPromise = null
      throw err
    })
  }
  return initPromise
}

async function doInit() {
  await rpc('tu_bootstrap')
}

/* ---------------- 登录与会话 ---------------- */

export async function login(username, password) {
  const account = String(username || '').trim()
  if (!account || !password) throw new Error('请输入账号和密码')

  const result = await rpc('tu_login', {
    p_username: account,
    p_password_hash: await hashPassword(password)
  })
  if (!result || result.error) throw new Error((result && result.error) || '登录失败，请稍后重试')
  if (!result.token || !result.user) throw new Error('登录失败，请稍后重试')

  sessionToken = result.token
  localStorage.setItem(TOKEN_KEY, sessionToken)
  const user = mapUser(result.user)
  setSession(user)
  return user
}

export function setSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, user, at: Date.now() }))
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw)
    return session && session.user ? session.user : null
  } catch (err) {
    console.error('[Session] read failed', err)
    return null
  }
}

export function clearSession() {
  sessionToken = ''
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(SESSION_KEY)
}

/**
 * 用云端最新资料刷新当前登录用户（被停用/删除则清空会话）
 */
export async function refreshSession() {
  const cached = getSession()
  if (!cached) return null
  if (!sessionToken) {
    clearSession()
    return null
  }
  const rows = await request(`${TABLE_USERS}?id=eq.${cached.id}&select=${USER_COLUMNS}`)
  const row = rows && rows[0]
  if (!row || row.status === 'disabled') {
    clearSession()
    return null
  }
  const user = mapUser(row)
  setSession(user)
  return user
}

/* ---------------- 账号管理 ---------------- */

export async function getUsers() {
  const rows = await request(`${TABLE_USERS}?select=${USER_COLUMNS}&order=create_time.asc`)
  return (rows || []).map(mapUser)
}

export async function getConfig() {
  const rows = await request(`${TABLE_CONFIG}?select=*&limit=1`)
  return { maxUsers: rows && rows[0] ? rows[0].max_users : 30 }
}

export async function getMemberCount() {
  const rows = await request(`${TABLE_USERS}?select=id&role=eq.member`)
  return rows ? rows.length : 0
}

export async function changePassword(userId, oldPassword, newPassword) {
  const next = String(newPassword || '').trim()
  if (next.length < 4) throw new Error('新密码至少 4 位')
  const result = await rpc('tu_change_password', {
    p_user_id: userId,
    p_old_hash: await hashPassword(oldPassword),
    p_new_hash: await hashPassword(next)
  })
  if (!result || result.error) throw new Error((result && result.error) || '修改失败，请稍后重试')
}

export async function addMember({ name, username, password }) {
  const displayName = String(name || '').trim()
  const account = String(username || '').trim()
  const pwd = String(password || '').trim()
  if (!displayName) throw new Error('请输入成员姓名')
  if (!account) throw new Error('请输入登录账号')
  if (pwd.length < 4) throw new Error('密码至少 4 位')

  const duplicated = await request(`${TABLE_USERS}?username=eq.${encodeURIComponent(account)}&select=id`)
  if (duplicated && duplicated.length > 0) throw new Error('该账号已存在')

  const [config, memberCount] = await Promise.all([getConfig(), getMemberCount()])
  if (memberCount >= config.maxUsers) throw new Error(`成员人数已达上限（${config.maxUsers} 人）`)

  await request(TABLE_USERS, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([
      {
        username: account,
        name: displayName,
        role: 'member',
        status: 'active',
        password_hash: await hashPassword(pwd),
        create_time: Date.now(),
        last_login_time: 0
      }
    ])
  })
}

export async function updateMember(id, patch = {}) {
  const body = {}
  if (patch.username !== undefined) {
    const account = String(patch.username).trim()
    if (!account) throw new Error('请输入登录账号')
    const duplicated = await request(
      `${TABLE_USERS}?username=eq.${encodeURIComponent(account)}&id=neq.${id}&select=id`
    )
    if (duplicated && duplicated.length > 0) throw new Error('该账号已被占用')
    body.username = account
  }
  if (patch.name !== undefined) body.name = String(patch.name).trim()
  if (patch.status) body.status = patch.status
  if (patch.password) {
    const pwd = String(patch.password).trim()
    if (pwd.length < 4) throw new Error('密码至少 4 位')
    body.password_hash = await hashPassword(pwd)
  }
  if (Object.keys(body).length === 0) return
  await request(`${TABLE_USERS}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(body)
  })
}

export async function removeMember(id) {
  const rows = await request(`${TABLE_USERS}?id=eq.${id}&select=role`)
  const row = rows && rows[0]
  if (!row) throw new Error('成员不存在')
  if (row.role === 'admin') throw new Error('不能删除管理员')
  await request(`${TABLE_USERS}?id=eq.${id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' }
  })
}

export async function setMaxUsers(value) {
  const maxUsers = Math.floor(Number(value))
  if (!maxUsers || maxUsers < 1 || maxUsers > 200) throw new Error('人数上限需在 1 ~ 200 之间')
  const count = await getMemberCount()
  if (maxUsers < count) throw new Error(`人数上限不能小于当前成员数（${count} 人）`)
  await request(`${TABLE_CONFIG}?on_conflict=key`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ key: 'app', max_users: maxUsers }])
  })
  return maxUsers
}

/* ---------------- 照片 ---------------- */

export async function listPhotos() {
  const rows = await request(`${TABLE_PHOTOS}?select=*&order=create_time.desc`)
  return (rows || []).map(mapPhoto)
}

export async function getPhoto(id) {
  const rows = await request(`${TABLE_PHOTOS}?id=eq.${id}&select=*`)
  const row = rows && rows[0]
  return row ? mapPhoto(row) : null
}

export async function addPhoto(photo) {
  const rows = await request(TABLE_PHOTOS, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
      {
        owner_id: photo.ownerId,
        owner_name: photo.ownerName,
        images: photo.images,
        title: photo.title,
        remark: photo.remark,
        create_time: photo.createTime
      }
    ])
  })
  return rows && rows[0] ? mapPhoto(rows[0]) : null
}

export async function deletePhoto(id) {
  await request(`${TABLE_PHOTOS}?id=eq.${id}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' }
  })
}

export async function countPhotos(ownerId) {
  const query = ownerId
    ? `${TABLE_PHOTOS}?select=id&owner_id=eq.${encodeURIComponent(ownerId)}`
    : `${TABLE_PHOTOS}?select=id`
  const rows = await request(query)
  return rows ? rows.length : 0
}
