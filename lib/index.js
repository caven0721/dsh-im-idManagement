/**
 * dsh-im-idmanagement — 给 DSH 的每个 IM 账号一套人设、一份共用记忆。
 *
 * 它站在 im-connect 前面：先把工作区里的人设骨架准备好，用户再去 im-connect
 * 把账号的工作目录指过来。插件本身不改任何人的配置。
 */
import { resolveConfig } from './config.js'
import { listPersonas, sanitizeName } from './personas.js'
import { createPersona, deletePersona, emptyTrash, ensureInbox, ensureProfileReadme, listTrash, patchRootAgents, readPersona, writePersona } from './scaffold.js'
import { createHandler } from './routes.js'
import { readStore, writeStore } from './store.js'
import { readWorkspaces } from './workspaces.js'

export const name = 'dsh-im-idmanagement'

/** 只依赖 webServer：能注册路由就够了。 */
export const inject = ['webServer']

const webDirUrl = new URL('../web/', import.meta.url)
const templateUrl = new URL('./templates/persona.md', import.meta.url)

export function apply(ctx, config) {
  const cwd = process.cwd()
  const initial = resolveConfig(config, cwd)
  if (!initial.enabled) return

  const log = (message) => ctx.logger?.(name)?.info?.(message)

  const webServer = ctx.webServer
  if (!webServer?.register) {
    log('webServer 不可用，插件只加载不工作')
    return
  }

  const handler = createHandler({
    config,
    cwd,
    resolveConfig,
    store: { readStore, writeStore },
    workspaces: { readWorkspaces },
    personas: { listPersonas, sanitizeName },
    scaffold: {
      createPersona: (cfg, input) => createPersona(cfg, input, templateUrl),
      deletePersona,
      readPersona,
      writePersona,
      listTrash,
      emptyTrash,
      patchRootAgents,
      ensureInbox,
      ensureProfileReadme,
    },
    webDirUrl,
  })

  const dispose = webServer.register({
    kind: 'prefix',
    path: '/api/dsh-im-idmanagement',
    handler,
  })
  if (typeof dispose === 'function') ctx.effect(() => dispose, 'im-idmanagement.routes')

  // 已经选过根目录的话，起来时顺手把收件箱补上；没选就等用户在页面上选。
  void readStore()
    .then((stored) => {
      const cfg = resolveConfig(config, cwd, stored)
      if (!cfg.ready) return undefined
      return ensureInbox(cfg).then(() => ensureProfileReadme(cfg)).then(() => patchRootAgents(cfg))
    })
    .catch(() => undefined)

  log(`已就绪：/api/dsh-im-idmanagement/  根目录 ${initial.baseDir || '（待选择）'}`)
}
