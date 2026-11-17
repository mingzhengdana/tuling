/* ============================================
   Supabase 项目配置
   在 Supabase 控制台 → Project Settings → API 获取
   （publishable / anon public key 是前端公开密钥，可安全放在页面里）
   ============================================ */

export const SUPABASE_URL = 'https://dmivtdtrzsodddvxcwsw.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_bEWoTSaK3dVo_vx0ToStrQ_q1fcw255'

export function isCloudReady() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}
