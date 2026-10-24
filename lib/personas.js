/**
 * 人设的“算”：目录下有哪些人设、新名字合不合法。
 * 只读目录，不写文件——写的事归 scaffold.js。
 */
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** Windows 不允许的字符 + 路径分隔符，一律不收。 */
const BAD_CHARS = /[\\/:*?"<>|]/

export function sanitizeName(raw) {
  const name = String(raw ?? '').trim()
  if (name === '') return { ok: false, error: '名字不能为空' }
  if (name.length > 32) return { ok: false, error: '名字太长，32 个字以内' }
  if (BAD_CHARS.test(name)) return { ok: false, error: '名字里不能有 \\ / : * ? " < > |' }
  if (name === '.' || name === '..') return { ok: false, error: '换个名字吧' }
  return { ok: true, name }
}

export async function listPersonas(profileDir) {
  let entries = []
  try {
    entries = await readdir(profileDir, { withFileTypes: true })
  } catch {
    return []
  }
  const rows = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(profileDir, entry.name)
    let hasPersona = false
    let updatedAt = 0
    try {
      const info = await stat(join(dir, 'AGENTS.md'))
      hasPersona = info.isFile()
      updatedAt = info.mtimeMs
    } catch {
      // 没有 AGENTS.md：也算一条，页面上标“待人设”
    }
    rows.push({ name: entry.name, dir, hasPersona, updatedAt })
  }
  rows.sort((left, right) => right.updatedAt - left.updatedAt)
  return rows
}
