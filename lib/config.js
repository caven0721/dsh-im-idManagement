/**
 * 配置：把宿主传进来的 config 和用户选的“根目录”合成一份完整的。
 * 根目录优先级：页面选择（store） > 插件配置 baseDir > 传入的 cwd。
 */
import { join } from 'node:path'

export const DEFAULTS = {
  enabled: true,
  /** 根目录（通常是一个 DSH 工作区），空 = 等用户在页面上选 */
  baseDir: '',
  /** 人设目录，空 = <根目录>/IM用户设定 */
  profileDir: '',
  /** 记忆目录，空 = <根目录>/记忆 */
  memoryDir: '',
  /** 流水文件名 */
  inboxFile: '收件箱.md',
  /** 是否往根 AGENTS.md 追加标记块 */
  rootAgentsPatch: true,
  /** 人设模板路径，空 = 内置 templates/persona.md */
  personaTemplate: '',
  /** 回收站保留几天，0 = 不限 */
  trashKeepDays: 7,
  /** 回收站最多留几份，0 = 不限 */
  trashKeepCount: 20,
}

export function resolveConfig(config, cwd = process.cwd(), stored = {}) {
  const merged = { ...DEFAULTS, ...(config ?? {}) }
  const baseDir = String(stored.baseDir ?? '').trim() || merged.baseDir || ''
  // 没选根目录时，不往任何地方写；路径字段留空，页面会提示先选。
  const root = baseDir || cwd
  const profileDir = merged.profileDir || (baseDir ? join(root, 'IM用户设定') : '')
  // 记忆目录：页面选的 > 插件配置 > 默认 <根目录>/记忆
  const pickedMemoryDir = String(stored.memoryDir ?? '').trim()
  const memoryDir = pickedMemoryDir || merged.memoryDir || (baseDir ? join(root, '记忆') : '')
  return {
    ...merged,
    baseDir,
    cwd: root,
    ready: baseDir !== '',
    profileDir,
    memoryDir,
    memoryDefault: baseDir ? join(root, '记忆') : '',
    customMemory: pickedMemoryDir !== '',
    inboxPath: memoryDir ? join(memoryDir, merged.inboxFile) : '',
    rootAgentsPath: baseDir ? join(baseDir, 'AGENTS.md') : '',
    trashDir: baseDir ? join(baseDir, '.dsh-im-idmanagement-trash') : '',
    trashKeepDays: Number.isFinite(merged.trashKeepDays) ? merged.trashKeepDays : 7,
    trashKeepCount: Number.isFinite(merged.trashKeepCount) ? merged.trashKeepCount : 20,
  }
}
