const BASE = '/api/dsh-im-idmanagement'

const $ = (selector) => document.querySelector(selector)

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

function say(el, text, kind = 'ok') {
  el.textContent = text
  el.dataset.kind = kind
}

async function api(path, options) {
  const response = await fetch(BASE + path, { headers: { 'content-type': 'application/json' }, ...options })
  const body = await response.json().catch(() => ({ ok: false, error: '返回不是 JSON' }))
  if (!response.ok || body.ok === false) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

/** 把“当前根目录”同步到两个输入控件里，刷新后不会看起来像没选。 */
function syncBaseControls(status) {
  const select = $('#workspace-select')
  const input = $('#base-input')

  if (select.dataset.filled !== 'yes') {
    select.innerHTML = '<option value="">— 选一个工作区 —</option>' +
      status.workspaces.map((item) => `<option value="${escapeHtml(item.path)}">${escapeHtml(item.name || item.path)}</option>`).join('')
    select.dataset.filled = 'yes'
  }

  if (status.ready) {
    const match = status.workspaces.find((item) => item.path.toLowerCase() === status.baseDir.toLowerCase())
    select.value = match ? match.path : ''
    input.value = match ? '' : status.baseDir
    input.placeholder = status.baseDir
  } else {
    select.value = ''
    input.value = ''
  }
}

function renderStatus(status) {
  $('#current-base').textContent = status.ready ? status.baseDir : '（还没选）'
  syncBaseControls(status)

  const memoryInput = $('#memory-input')
  memoryInput.placeholder = status.memoryDefault ? `记忆目录，默认 ${status.memoryDefault}` : '记忆目录，例如 D:\\我的资料\\备忘'
  $('#current-memory').textContent = status.memoryDir || '（还没定）'
  const badge = $('#memory-badge')
  badge.textContent = status.customMemory ? '自定义' : '默认'
  badge.classList.toggle('custom', Boolean(status.customMemory))

  const form = $('#create-form')
  form.querySelectorAll('input, textarea, button').forEach((el) => { el.disabled = !status.ready })
  $('#create-panel').classList.toggle('disabled', !status.ready)

  const tbody = $('#rows')
  tbody.innerHTML = ''
  if (!status.ready) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">先在上面选根目录。</td></tr>'
  } else if (status.items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">这个工作区里还没有人设，上面新建一个。</td></tr>'
  } else {
    for (const item of status.items) {
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td>${escapeHtml(item.name)}</td>
        <td>${item.hasPersona ? '已生成' : '<span class="warn">待人设</span>'}</td>
        <td class="path">${escapeHtml(item.dir)}</td>
        <td class="actions">
          <button data-edit="${escapeHtml(item.name)}">编辑</button>
          <button data-dir="${escapeHtml(item.dir)}">复制路径</button>
          <button class="danger" data-del="${escapeHtml(item.name)}">删除</button>
        </td>`
      tbody.append(tr)
    }

    tbody.querySelectorAll('button[data-edit]').forEach((button) => {
      button.addEventListener('click', () => openEditor(button.dataset.edit))
    })

    tbody.querySelectorAll('button[data-dir]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(button.dataset.dir)
          say($('#message'), '路径已复制，去 IM 助理填进「工作目录」')
        } catch {
          say($('#message'), '复制失败，手动选中那行路径吧', 'error')
        }
      })
    })

    tbody.querySelectorAll('button[data-del]').forEach((button) => {
      button.addEventListener('click', async () => {
        const name = button.dataset.del
        const ok = confirm(`把「${name}」移到回收站？\n\n它不会真的消失，会挪到根目录下的 .dsh-im-idmanagement-trash 里。`)
        if (!ok) return
        try {
          const body = await api('/personas/delete', { method: 'POST', body: JSON.stringify({ name }) })
          say($('#message'), `已移到回收站：${body.trashedTo || body.path}`)
          refresh()
        } catch (error) {
          say($('#message'), '删除失败：' + error.message, 'error')
        }
      })
    })
  }

  $('#paths').innerHTML = status.ready
    ? `<dt>人设目录</dt><dd class="path">${escapeHtml(status.profileDir)}</dd>
       <dt>记忆目录</dt><dd class="path">${escapeHtml(status.memoryDir)}</dd>
       <dt>收件箱</dt><dd class="path">${escapeHtml(status.inboxPath)}</dd>
       <dt>根 AGENTS.md</dt><dd class="path">${escapeHtml(status.rootAgentsPath)}</dd>`
    : '<dt>—</dt><dd class="muted">选完根目录这里会显示实际路径</dd>'
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
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

async function renderTrash() {
  try {
    const trash = await api('/trash')
    $('#trash-size').textContent = formatBytes(trash.totalBytes)
    const list = $('#trash-list')
    if (!trash.items || trash.items.length === 0) {
      list.innerHTML = '<p class="muted">空的。</p>'
      return
    }
    list.innerHTML = trash.items
      .map((item) => `<div class="trash-row"><span class="path">${escapeHtml(item.name)}</span><span class="muted">${formatBytes(item.bytes)}</span></div>`)
      .join('')
  } catch (error) {
    $('#trash-size').textContent = '读取失败'
  }
}

async function refresh() {
  try {
    renderStatus(await api('/status'))
    await renderTrash()
  } catch (error) {
    $('#rows').innerHTML = `<tr><td colspan="4" class="warn">读取失败：${escapeHtml(error.message)}</td></tr>`
  }
}

async function setBase(baseDir) {
  if (!baseDir) {
    say($('#base-message'), '先选一个工作区，或者填一个路径', 'error')
    return
  }
  try {
    const body = await api('/config', { method: 'POST', body: JSON.stringify({ baseDir }) })
    say($('#base-message'), `根目录已切到 ${body.baseDir}`)

    // 换根目录等于换了一套人设：把表单和提示都清干净，别让两边的输入串在一起
    $('#create-form').reset()
    say($('#message'), '')
    await refresh()
    $('#base-input').value = ''
  } catch (error) {
    say($('#base-message'), '失败：' + error.message, 'error')
  }
}

$('#use-workspace').addEventListener('click', () => {
  const select = $('#workspace-select')
  if (!select.value) {
    say($('#base-message'), '下拉里先选一个工作区', 'error')
    return
  }
  setBase(select.value)
})

$('#use-path').addEventListener('click', () => {
  const value = $('#base-input').value.trim()
  if (!value) {
    say($('#base-message'), '先把路径填进去', 'error')
    return
  }
  setBase(value)
})

async function setMemory(memoryDir) {
  try {
    const body = await api('/config', { method: 'POST', body: JSON.stringify({ memoryDir }) })
    say($('#base-message'), memoryDir === '' ? '记忆目录已恢复默认' : `记忆目录已设为 ${body.memoryDir}`)
    $('#memory-input').value = ''
    await refresh()
  } catch (error) {
    say($('#base-message'), '失败：' + error.message, 'error')
  }
}

$('#use-memory').addEventListener('click', () => {
  const value = $('#memory-input').value.trim()
  if (!value) {
    say($('#base-message'), '先把记忆目录填进去', 'error')
    return
  }
  setMemory(value)
})

$('#reset-memory').addEventListener('click', () => setMemory(''))

let editingName = ''

async function openEditor(name) {
  try {
    const body = await api('/persona?name=' + encodeURIComponent(name))
    editingName = name
    $('#editor-name').textContent = name
    $('#editor-path').textContent = body.path
    $('#editor-text').value = body.content
    say($('#editor-message'), '')
    $('#editor-panel').hidden = false
    $('#editor-panel').scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (error) {
    say($('#message'), '打不开：' + error.message, 'error')
  }
}

$('#editor-save').addEventListener('click', async () => {
  if (!editingName) return
  try {
    const body = await api('/persona', {
      method: 'POST',
      body: JSON.stringify({ name: editingName, content: $('#editor-text').value }),
    })
    say($('#editor-message'), `已保存：${body.path}`)
  } catch (error) {
    say($('#editor-message'), '保存失败：' + error.message, 'error')
  }
})

$('#editor-close').addEventListener('click', () => {
  $('#editor-panel').hidden = true
  editingName = ''
  refresh()
})

$('#empty-trash').addEventListener('click', async () => {
  const ok = confirm('清空回收站？\n\n这里面的东西会真的删掉，找不回来了。')
  if (!ok) return
  try {
    const body = await api('/trash/empty', { method: 'POST', body: '{}' })
    say($('#trash-message'), `清掉了 ${body.removed} 份`)
    await renderTrash()
  } catch (error) {
    say($('#trash-message'), '失败：' + error.message, 'error')
  }
})

$('#create-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const formEl = event.currentTarget // await 之后 currentTarget 会被清空，先存下来
  const form = new FormData(formEl)
  try {
    const body = await api('/personas', {
      method: 'POST',
      body: JSON.stringify({
        name: form.get('name'),
        address: form.get('address'),
        notes: form.get('notes'),
        overwrite: form.get('overwrite') === 'on',
      }),
    })
    say($('#message'), body.created ? `已生成：${body.personaPath}` : `已存在，没有覆盖：${body.personaPath}`)
    formEl.reset()
    refresh()
  } catch (error) {
    say($('#message'), '失败：' + error.message, 'error')
  }
})

refresh()
