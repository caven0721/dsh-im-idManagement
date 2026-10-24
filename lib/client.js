/**
 * dsh-im-idmanagement 的客户端（浏览器侧）。
 *
 * 在「设置」里挂一页，把服务端那几个接口画成能点的界面：
 * 选根目录、选记忆目录、新建人设、编辑、删除（进回收站）。
 *
 * 不打包、不引依赖，只 require 宿主的 react，用 createElement 手写。
 */
window.__ModuleLoader__.load({
  id: 'dsh-im-idmanagement',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback } = React

    const BASE = '/api/dsh-im-idmanagement'

    const COLORS = {
      text: '#1d2129',
      muted: '#8a919f',
      line: '#e5e8ef',
      bg: '#fff',
      accent: '#3b6ef5',
      danger: '#b91c1c',
      dangerBg: '#fee2e2',
      ok: '#15803d',
    }

    async function call(path, options) {
      const response = await fetch(BASE + path, {
        headers: { 'content-type': 'application/json' },
        ...options,
      })
      const body = await response.json().catch(() => ({ ok: false, error: '返回不是 JSON' }))
      if (!response.ok || body.ok === false) throw new Error(body.error || 'HTTP ' + response.status)
      return body
    }

    function formatBytes(bytes) {
      if (!bytes) return '0 B'
      const units = ['B', 'KB', 'MB', 'GB']
      let value = bytes
      let index = 0
      while (value >= 1024 && index < units.length - 1) {
        value /= 1024
        index += 1
      }
      return value.toFixed(index === 0 ? 0 : 1) + ' ' + units[index]
    }

    // ---------- 小零件 ----------

    function Card({ title, hint, children }) {
      return h(
        'div',
        {
          style: {
            border: '1px solid ' + COLORS.line,
            borderRadius: 10,
            background: COLORS.bg,
            padding: 16,
            marginBottom: 14,
          },
        },
        h('div', { style: { fontSize: 14, fontWeight: 600, marginBottom: hint ? 4 : 10 } }, title),
        hint ? h('div', { style: { fontSize: 12, color: COLORS.muted, marginBottom: 10, lineHeight: 1.7 } }, hint) : null,
        children,
      )
    }

    function Field({ label, children }) {
      return h(
        'label',
        { style: { display: 'block', marginBottom: 10 } },
        h('div', { style: { fontSize: 12, color: COLORS.muted, marginBottom: 4 } }, label),
        children,
      )
    }

    const inputStyle = {
      width: '100%',
      boxSizing: 'border-box',
      padding: '7px 10px',
      border: '1px solid ' + COLORS.line,
      borderRadius: 8,
      font: 'inherit',
      color: COLORS.text,
      background: COLORS.bg,
    }

    function TextInput(props) {
      return h('input', { ...props, style: { ...inputStyle, ...(props.style || {}) } })
    }

    function TextArea(props) {
      return h('textarea', {
        ...props,
        style: {
          ...inputStyle,
          lineHeight: 1.6,
          fontFamily: 'Consolas, "Microsoft YaHei", monospace',
          resize: 'vertical',
          ...(props.style || {}),
        },
      })
    }

    function Button({ variant, children, ...rest }) {
      const danger = variant === 'danger'
      const plain = variant === 'plain'
      return h(
        'button',
        {
          type: 'button',
          ...rest,
          style: {
            padding: '7px 14px',
            borderRadius: 8,
            border: plain || danger ? '1px solid ' + COLORS.line : '0',
            background: danger ? COLORS.dangerBg : plain ? COLORS.bg : COLORS.accent,
            color: danger ? COLORS.danger : plain ? COLORS.text : '#fff',
            font: 'inherit',
            cursor: 'pointer',
            ...(rest.style || {}),
          },
        },
        children,
      )
    }

    function Row({ children, gap = 8 }) {
      return h('div', { style: { display: 'flex', gap, alignItems: 'center', marginBottom: 8 } }, children)
    }

    function Hint({ children, tone }) {
      if (!children) return null
      return h(
        'div',
        {
          style: {
            fontSize: 12,
            margin: '6px 0 0',
            color: tone === 'error' ? COLORS.danger : tone === 'ok' ? COLORS.ok : COLORS.muted,
          },
        },
        children,
      )
    }

    function Mono({ children }) {
      return h(
        'div',
        { style: { fontFamily: 'Consolas, monospace', fontSize: 12, wordBreak: 'break-all', color: '#475569' } },
        children,
      )
    }

    // ---------- 主面板 ----------

    function Panel() {
      const [status, setStatus] = useState(null)
      const [trash, setTrash] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)

      const [baseChoice, setBaseChoice] = useState('')
      const [baseInput, setBaseInput] = useState('')
      const [memoryInput, setMemoryInput] = useState('')
      const [message, setMessage] = useState('')

      const [form, setForm] = useState({ name: '', address: '', notes: '', overwrite: false })
      const [editing, setEditing] = useState(null) // { name, path, content }

      const load = useCallback(async () => {
        setError('')
        try {
          const next = await call('/status')
          setStatus(next)
          setTrash(await call('/trash'))
        } catch (problem) {
          setError(String(problem.message || problem))
        }
      }, [])

      useEffect(() => {
        load()
      }, [load])

      const run = useCallback(
        async (task, okText) => {
          setBusy(true)
          setMessage('')
          try {
            const result = await task()
            if (okText) setMessage(typeof okText === 'function' ? okText(result) : okText)
            await load()
            return result
          } catch (problem) {
            setMessage('失败：' + (problem.message || problem))
            return null
          } finally {
            setBusy(false)
          }
        },
        [load],
      )

      if (error) {
        return h(
          Card,
          { title: 'IM 身份管理' },
          h(Hint, { tone: 'error' }, '读不到状态：' + error),
          h(Button, { onClick: load }, '重试'),
        )
      }

      if (!status) {
        return h(Card, { title: 'IM 身份管理' }, h(Hint, null, '读取中…'))
      }

      // ---------- 第一步：根目录 ----------
      const workspaceSelect = h(
        'select',
        {
          value: baseChoice,
          onChange: (event) => setBaseChoice(event.target.value),
          style: { ...inputStyle, flex: 1 },
        },
        [
          h('option', { key: '', value: '' }, '— 选一个工作区 —'),
          ...status.workspaces.map((item) => h('option', { key: item.path, value: item.path }, item.name || item.path)),
        ],
      )

      const baseCard = h(
        Card,
        {
          title: '第一步 · 选根目录',
          hint: '人设和记忆都建在这个工作区下面。换一个根目录，下面的列表就换成那边的。',
        },
        h(
          Row,
          null,
          workspaceSelect,
          h(
            Button,
            {
              disabled: busy || !baseChoice,
              onClick: () =>
                run(
                  () => call('/config', { method: 'POST', body: JSON.stringify({ baseDir: baseChoice }) }),
                  '根目录已切换',
                ),
            },
            '用这个',
          ),
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 10px', color: COLORS.muted, fontSize: 12 } },
          h('div', { style: { flex: 1, height: 1, background: COLORS.line } }),
          'OR',
          h('div', { style: { flex: 1, height: 1, background: COLORS.line } }),
        ),
        h(
          Row,
          null,
          h(TextInput, {
            value: baseInput,
            placeholder: '直接填一个绝对路径，例如 D:\\我的工作区',
            onChange: (e) => setBaseInput(e.target.value),
            style: { flex: 1 },
          }),
          h(
            Button,
            {
              disabled: busy || !baseInput.trim(),
              onClick: () =>
                run(
                  () => call('/config', { method: 'POST', body: JSON.stringify({ baseDir: baseInput.trim() }) }),
                  '根目录已切换',
                ).then(() => setBaseInput('')),
            },
            '用这个路径',
          ),
        ),
        h(
          Row,
          { gap: 6 },
          h(TextInput, {
            value: memoryInput,
            placeholder: '记忆目录（默认 ' + (status.memoryDefault || '<根目录>\\记忆') + '）',
            onChange: (e) => setMemoryInput(e.target.value),
            style: { flex: 1 },
          }),
          h(
            Button,
            {
              variant: 'plain',
              disabled: busy || !memoryInput.trim(),
              onClick: () =>
                run(
                  () => call('/config', { method: 'POST', body: JSON.stringify({ memoryDir: memoryInput.trim() }) }),
                  '记忆目录已设置',
                ).then(() => setMemoryInput('')),
            },
            '用这个目录',
          ),
          h(
            Button,
            {
              variant: 'plain',
              disabled: busy || !status.customMemory,
              onClick: () =>
                run(
                  () => call('/config', { method: 'POST', body: JSON.stringify({ memoryDir: '' }) }),
                  '记忆目录已恢复默认',
                ),
            },
            '恢复默认',
          ),
        ),
        h(
          Row,
          null,
          h('span', { style: { fontSize: 12, color: COLORS.muted } }, '当前根目录：'),
          h(Mono, null, status.ready ? status.baseDir : '（还没选）'),
        ),
        h(
          Row,
          null,
          h('span', { style: { fontSize: 12, color: COLORS.muted } }, '当前记忆目录：'),
          h(Mono, null, status.memoryDir || '（还没定）'),
          h(
            'span',
            {
              style: {
                fontSize: 11,
                padding: '1px 8px',
                borderRadius: 999,
                background: status.customMemory ? '#e0f2fe' : '#eef1f8',
                color: status.customMemory ? '#0369a1' : COLORS.muted,
              },
            },
            status.customMemory ? '自定义' : '默认',
          ),
        ),
        h(Hint, { tone: message.startsWith('失败') ? 'error' : 'ok' }, message),
      )

      // ---------- 第二步：新建 ----------
      const createCard = h(
        Card,
        { title: '第二步 · 新建人设' },
        h(
          Field,
          { label: '名字（也是文件夹名）' },
          h(TextInput, {
            value: form.name,
            placeholder: '例如：妈妈',
            onChange: (e) => setForm({ ...form, name: e.target.value }),
          }),
        ),
        h(
          Field,
          { label: 'bot 对他的称呼' },
          h(TextInput, {
            value: form.address,
            placeholder: '例如：妈咪',
            onChange: (e) => setForm({ ...form, address: e.target.value }),
          }),
        ),
        h(
          Field,
          { label: '人设规则' },
          h(TextArea, {
            rows: 5,
            value: form.notes,
            placeholder: '分寸、禁忌、能聊什么。可以不填，之后直接改文件也行。',
            onChange: (e) => setForm({ ...form, notes: e.target.value }),
          }),
        ),
        h(
          'label',
          { style: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: COLORS.muted, marginBottom: 10 } },
          h('input', {
            type: 'checkbox',
            checked: form.overwrite,
            onChange: (e) => setForm({ ...form, overwrite: e.target.checked }),
          }),
          '覆盖已有的 AGENTS.md',
        ),
        h(
          Button,
          {
            disabled: busy || !status.ready || !form.name.trim(),
            onClick: () =>
              run(
                () =>
                  call('/personas', {
                    method: 'POST',
                    body: JSON.stringify({
                      name: form.name.trim(),
                      address: form.address.trim(),
                      notes: form.notes,
                      overwrite: form.overwrite,
                    }),
                  }),
                (result) => (result.created ? '已生成：' + result.personaPath : '已存在，没有覆盖：' + result.personaPath),
              ).then((result) => {
                if (result) setForm({ name: '', address: '', notes: '', overwrite: false })
              }),
          },
          '生成',
        ),
      )

      // ---------- 列表 ----------
      const rows = !status.ready
        ? [h('div', { key: 'empty', style: { fontSize: 12, color: COLORS.muted } }, '先在上面选根目录。')]
        : status.items.length === 0
          ? [h('div', { key: 'empty', style: { fontSize: 12, color: COLORS.muted } }, '这个工作区里还没有人设，上面新建一个。')]
          : status.items.map((item) =>
              h(
                'div',
                {
                  key: item.name,
                  style: {
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    padding: '8px 0',
                    borderTop: '1px solid ' + COLORS.line,
                  },
                },
                h(
                  'div',
                  { style: { flex: 1, minWidth: 0 } },
                  h(
                    'div',
                    { style: { fontSize: 13 } },
                    item.name,
                    h(
                      'span',
                      { style: { marginLeft: 8, fontSize: 11, color: item.hasPersona ? COLORS.ok : '#c2410c' } },
                      item.hasPersona ? '已生成' : '待人设',
                    ),
                  ),
                  h(Mono, null, item.dir),
                ),
                h(
                  'div',
                  { style: { display: 'flex', gap: 6, flexShrink: 0 } },
                  h(
                    Button,
                    {
                      variant: 'plain',
                      disabled: busy || !item.hasPersona,
                      onClick: () =>
                        run(async () => {
                          const file = await call('/persona?name=' + encodeURIComponent(item.name))
                          setEditing({ name: item.name, path: file.path, content: file.content })
                          return file
                        }),
                    },
                    '编辑',
                  ),
                  h(
                    Button,
                    {
                      variant: 'plain',
                      onClick: () => {
                        navigator.clipboard
                          .writeText(item.dir)
                          .then(() => setMessage('路径已复制，去 IM 助理填进「工作目录」'))
                          .catch(() => setMessage('复制失败，手动选中那行路径吧'))
                      },
                    },
                    '复制路径',
                  ),
                  h(
                    Button,
                    {
                      variant: 'danger',
                      disabled: busy,
                      onClick: () => {
                        if (
                          !window.confirm(
                            '把「' + item.name + '」移到回收站？\n\n它不会真的消失，会挪到根目录下的 .dsh-im-idmanagement-trash 里。',
                          )
                        )
                          return
                        run(
                          () => call('/personas/delete', { method: 'POST', body: JSON.stringify({ name: item.name }) }),
                          (result) => '已移到回收站：' + (result.trashedTo || result.path),
                        )
                      },
                    },
                    '删除',
                  ),
                ),
              ),
            )

      const listCard = h(Card, { title: '已有的人设' }, ...rows)

      // ---------- 编辑 ----------
      const editorCard = editing
        ? h(
            Card,
            { title: '编辑 · ' + editing.name },
            h(Mono, null, editing.path),
            h('div', { style: { height: 8 } }),
            h(TextArea, {
              rows: 18,
              value: editing.content,
              onChange: (e) => setEditing({ ...editing, content: e.target.value }),
            }),
            h(
              Row,
              { gap: 8 },
              h(
                Button,
                {
                  disabled: busy,
                  onClick: () =>
                    run(
                      () =>
                        call('/persona', {
                          method: 'POST',
                          body: JSON.stringify({ name: editing.name, content: editing.content }),
                        }),
                      (result) => '已保存：' + result.path,
                    ),
                },
                '保存',
              ),
              h(Button, { variant: 'plain', onClick: () => setEditing(null) }, '关闭'),
            ),
          )
        : null

      // ---------- 回收站 ----------
      const trashItems =
        trash && trash.items.length > 0
          ? trash.items.map((item) =>
              h(
                'div',
                {
                  key: item.name,
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    fontSize: 12,
                    padding: '4px 0',
                    borderBottom: '1px dashed ' + COLORS.line,
                  },
                },
                h('span', { style: { fontFamily: 'Consolas, monospace', wordBreak: 'break-all' } }, item.name),
                h('span', { style: { color: COLORS.muted, flexShrink: 0 } }, formatBytes(item.bytes)),
              ),
            )
          : [h('div', { key: 'empty', style: { fontSize: 12, color: COLORS.muted } }, '空的。')]

      const trashCard = h(
        Card,
        {
          title: '回收站',
          hint: '删掉的人设会挪到这儿。按「保留 7 天、最多 20 份」自动清理旧的那些。',
        },
        h('div', { style: { fontSize: 12, color: COLORS.muted, marginBottom: 8 } }, '占用：' + formatBytes(trash ? trash.totalBytes : 0)),
        ...trashItems,
        h('div', { style: { height: 10 } }),
        h(
          Button,
          {
            variant: 'danger',
            disabled: busy || !trash || trash.items.length === 0,
            onClick: () => {
              if (!window.confirm('清空回收站？\n\n这里面的东西会真的删掉，找不回来了。')) return
              run(
                () => call('/trash/empty', { method: 'POST', body: '{}' }),
                (result) => '清掉了 ' + result.removed + ' 份',
              )
            },
          },
          '清空回收站',
        ),
      )

      // ---------- 路径 ----------
      const pathCard = h(
        Card,
        { title: '路径' },
        h(Mono, null, '人设目录：' + (status.profileDir || '—')),
        h(Mono, null, '记忆目录：' + (status.memoryDir || '—')),
        h(Mono, null, '收件箱：' + (status.inboxPath || '—')),
        h(Mono, null, '根 AGENTS.md：' + (status.rootAgentsPath || '—')),
      )

      return h('div', { style: { color: COLORS.text, fontSize: 13 } }, baseCard, createCard, listCard, editorCard, trashCard, pathCard)
    }

    const inject = ['slots']

    function apply(ctx) {
      try {
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'dsh-im-idmanagement',
              order: 130,
              label: () => 'IM 身份管理',
            },
            Panel,
          ),
        )
        console.info('[dsh-im-idmanagement] settings.section 已挂上')
      } catch (problem) {
        console.error('[dsh-im-idmanagement] 挂载失败：', problem)
      }
    }

    return { apply, inject }
  },
})
