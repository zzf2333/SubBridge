import { Hono } from 'hono';
import { APP_NAME, APP_TAGLINE, APP_VERSION, APP_REPOSITORY_URL } from '../../meta';

const app = new Hono();

const HTML_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${APP_NAME} — Clash 转 sing-box</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f0f2f5;min-height:100vh;padding:32px 16px;color:#222}
.wrap{max-width:680px;margin:0 auto}
h1{font-size:22px;font-weight:700;margin-bottom:4px}
.sub{font-size:13px;color:#888;margin-bottom:28px}

/* 输入类型切换 */
.tabs{display:flex;gap:2px;margin-bottom:16px;background:#e0e0e0;padding:3px;border-radius:8px;width:fit-content}
.tab{padding:6px 18px;border:none;background:transparent;border-radius:6px;font-size:13px;cursor:pointer;color:#555;transition:.15s}
.tab.on{background:#fff;color:#333;font-weight:600;box-shadow:0 1px 4px rgba(0,0,0,.12)}

/* 卡片 */
.card{background:#fff;border-radius:12px;padding:24px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
label{display:block;font-size:13px;font-weight:500;margin-bottom:6px;color:#444}
textarea,input[type=url]{width:100%;border:1.5px solid #e0e0e0;border-radius:8px;padding:10px 12px;font-size:13px;font-family:monospace;resize:vertical;transition:.15s;outline:none}
textarea:focus,input[type=url]:focus{border-color:#5b6af5}
textarea{min-height:160px}
input[type=url]{font-family:inherit}
.hidden{display:none!important}

/* 按钮 */
.btn{width:100%;padding:13px;background:#5b6af5;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;transition:.15s;letter-spacing:.3px}
.btn:hover{background:#4a59e0}
.btn:disabled{opacity:.55;cursor:not-allowed}
.spin{display:inline-block;width:14px;height:14px;border:2.5px solid rgba(255,255,255,.3);border-radius:50%;border-top-color:#fff;animation:spin .8s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes spin{to{transform:rotate(360deg)}}

/* 结果区 */
.result{border-radius:8px;padding:16px 20px;margin-top:16px}
.ok{background:#f0faf4;border:1.5px solid #4caf50}
.err{background:#fff5f5;border:1.5px solid #f44336}
.result-title{font-weight:600;margin-bottom:8px;font-size:14px}
.ok .result-title{color:#2e7d32}
.err .result-title{color:#c62828}
.stats{font-size:12px;color:#666;margin-bottom:10px}
.warn-list{font-size:12px;color:#e65100;margin-top:8px;padding-left:14px}
.action-row{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.action-btn{padding:7px 16px;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:500;transition:.15s}
.dl-btn{background:#5b6af5;color:#fff}.dl-btn:hover{background:#4a59e0}
.cp-btn{background:#f0f0f0;color:#333}.cp-btn:hover{background:#e0e0e0}
.err-msg{font-size:13px;color:#c62828;font-family:monospace;white-space:pre-wrap;word-break:break-all}

.footer{text-align:center;font-size:12px;color:#bbb;margin-top:24px}
.footer a{color:#5b6af5;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <h1>${APP_NAME}</h1>
  <p class="sub">${APP_TAGLINE}</p>

  <div class="card">
    <!-- 输入类型切换 -->
    <div class="tabs">
      <button class="tab on" id="tab-yaml" onclick="switchTab('yaml')">粘贴 YAML</button>
      <button class="tab" id="tab-url" onclick="switchTab('url')">订阅 URL</button>
    </div>

    <!-- YAML 粘贴 -->
    <div id="sect-yaml">
      <label for="yamlInput">Clash / Clash.Meta YAML 内容</label>
      <textarea id="yamlInput" placeholder="proxies:
  - name: 香港 01
    type: ss
    server: example.com
    port: 443
    cipher: aes-256-gcm
    password: yourpassword
..."></textarea>
    </div>

    <!-- 订阅 URL -->
    <div id="sect-url" class="hidden">
      <label for="urlInput">Clash 订阅链接</label>
      <input type="url" id="urlInput" placeholder="https://example.com/clash-subscription">
    </div>
  </div>

  <button class="btn" id="submitBtn" onclick="doConvert()">
    <span id="btnText">生成 sing-box 配置</span>
  </button>

  <div id="result" class="result hidden"></div>

  <div class="footer">
    ${APP_NAME} v${APP_VERSION} &nbsp;·&nbsp;
    <a href="${APP_REPOSITORY_URL}" target="_blank">GitHub</a>
  </div>
</div>

<script>
let mode = 'yaml';
let currentJson = null;

function switchTab(m) {
  mode = m;
  document.getElementById('tab-yaml').className = 'tab' + (m==='yaml'?' on':'');
  document.getElementById('tab-url').className  = 'tab' + (m==='url' ?' on':'');
  document.getElementById('sect-yaml').className = m==='yaml' ? '' : 'hidden';
  document.getElementById('sect-url').className  = m==='url'  ? '' : 'hidden';
}

async function doConvert() {
  const btn = document.getElementById('submitBtn');
  const btnText = document.getElementById('btnText');
  const resultEl = document.getElementById('result');

  let source = '';
  if (mode === 'yaml') {
    source = document.getElementById('yamlInput').value.trim();
    if (!source) { alert('请粘贴 Clash YAML 内容'); return; }
  } else {
    source = document.getElementById('urlInput').value.trim();
    if (!source) { alert('请输入订阅 URL'); return; }
  }

  btn.disabled = true;
  btnText.innerHTML = '<span class="spin"></span>生成中...';
  resultEl.className = 'result hidden';
  currentJson = null;

  try {
    const res = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, sourceType: mode === 'url' ? 'url' : 'yaml' })
    });
    const data = await res.json();

    if (data.success) {
      currentJson = data.config;
      const warnHtml = (data.warnings||[]).length > 0
        ? '<ul class="warn-list">' + data.warnings.map(w => '<li>'+escHtml(w)+'</li>').join('') + '</ul>'
        : '';
      const dangHtml = (data.danglingRefs||[]).length > 0
        ? '<div class="warn-list" style="margin-top:6px">⚠ 未闭合引用: ' + data.danglingRefs.join(', ') + '</div>'
        : '';
      resultEl.className = 'result ok';
      resultEl.innerHTML =
        '<div class="result-title">✓ 生成成功</div>' +
        '<div class="stats">已转换 <b>' + data.convertedCount + '</b> 个节点' +
          (data.skippedCount > 0 ? '，跳过 <b>' + data.skippedCount + '</b> 个' : '') +
        '</div>' +
        warnHtml + dangHtml +
        '<div class="action-row">' +
          '<button class="action-btn dl-btn" onclick="downloadJson()">下载 config.json</button>' +
          '<button class="action-btn cp-btn" onclick="copyJson()">复制 JSON</button>' +
        '</div>';
    } else {
      resultEl.className = 'result err';
      resultEl.innerHTML =
        '<div class="result-title">✗ 生成失败</div>' +
        '<div class="err-msg">' + escHtml(data.error || '未知错误') + '</div>';
    }
  } catch(e) {
    resultEl.className = 'result err';
    resultEl.innerHTML =
      '<div class="result-title">✗ 请求失败</div>' +
      '<div class="err-msg">' + escHtml(e.message) + '</div>';
  } finally {
    btn.disabled = false;
    btnText.textContent = '生成 sing-box 配置';
  }
}

function downloadJson() {
  if (!currentJson) return;
  const blob = new Blob([JSON.stringify(currentJson, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'config.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function copyJson() {
  if (!currentJson) return;
  navigator.clipboard.writeText(JSON.stringify(currentJson, null, 2))
    .then(() => alert('✓ 已复制到剪贴板'))
    .catch(() => alert('复制失败，请手动复制'));
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
</script>
</body>
</html>`;

app.get('/', (c) => c.html(HTML_PAGE));

export default app;
