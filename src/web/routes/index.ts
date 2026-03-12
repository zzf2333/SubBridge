import { Hono } from 'hono';

const app = new Hono();

const HTML_PAGE = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SubBridge - Clash 转 sing-box 订阅转换</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 600px;
            width: 100%;
            padding: 40px;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
        }
        input[type="text"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.3s;
        }
        input[type="text"]:focus {
            outline: none;
            border-color: #667eea;
        }
        .btn {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
        }
        .btn:active {
            transform: translateY(0);
        }
        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        .result {
            margin-top: 30px;
            padding: 20px;
            background: #f5f5f5;
            border-radius: 8px;
            display: none;
        }
        .result.show {
            display: block;
        }
        .result.success {
            background: #e8f5e9;
            border-left: 4px solid #4caf50;
        }
        .result.error {
            background: #ffebee;
            border-left: 4px solid #f44336;
        }
        .result-title {
            font-weight: 600;
            margin-bottom: 10px;
            color: #333;
        }
        .result-content {
            font-size: 14px;
            color: #666;
            word-break: break-all;
        }
        .copy-btn {
            margin-top: 10px;
            padding: 8px 16px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
        }
        .copy-btn:hover {
            background: #5568d3;
        }
        .loading {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 3px solid rgba(255,255,255,.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 1s ease-in-out infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .footer {
            margin-top: 30px;
            text-align: center;
            color: #999;
            font-size: 12px;
        }
        .footer a {
            color: #667eea;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🌉 SubBridge</h1>
        <p class="subtitle">Clash 订阅转换为 sing-box 配置</p>

        <form id="convertForm">
            <div class="form-group">
                <label for="clashUrl">Clash 订阅链接</label>
                <input
                    type="text"
                    id="clashUrl"
                    name="clashUrl"
                    placeholder="https://example.com/clash-subscription"
                    required
                >
            </div>

            <button type="submit" class="btn" id="submitBtn">
                <span id="btnText">开始转换</span>
            </button>
        </form>

        <div id="result" class="result">
            <div class="result-title" id="resultTitle"></div>
            <div class="result-content" id="resultContent"></div>
        </div>

        <div class="footer">
            <p>SubBridge v0.1.0 | <a href="https://github.com/zzf2333/SubBridge" target="_blank">GitHub</a></p>
        </div>
    </div>

    <script>
        const form = document.getElementById('convertForm');
        const submitBtn = document.getElementById('submitBtn');
        const btnText = document.getElementById('btnText');
        const result = document.getElementById('result');
        const resultTitle = document.getElementById('resultTitle');
        const resultContent = document.getElementById('resultContent');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const clashUrl = document.getElementById('clashUrl').value.trim();
            if (!clashUrl) return;

            // Show loading
            submitBtn.disabled = true;
            btnText.innerHTML = '<span class="loading"></span> 转换中...';
            result.classList.remove('show', 'success', 'error');

            try {
                const response = await fetch('/api/convert', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source: clashUrl,
                        sourceType: 'url'
                    })
                });

                const data = await response.json();

                if (data.success) {
                    // Generate subscribe URL
                    const subscribeUrl = window.location.origin + '/api/subscribe?url=' + encodeURIComponent(clashUrl);

                    result.classList.add('show', 'success');
                    resultTitle.textContent = '✓ 转换成功';
                    resultContent.innerHTML = \`
                        <p style="margin-bottom: 10px;">sing-box 订阅链接:</p>
                        <div style="background: white; padding: 10px; border-radius: 4px; margin-bottom: 10px; font-family: monospace; font-size: 12px;">
                            \${subscribeUrl}
                        </div>
                        <button class="copy-btn" onclick="copyToClipboard('\${subscribeUrl}')">复制链接</button>
                        <button class="copy-btn" onclick="downloadConfig()">下载配置</button>
                        \${data.warnings && data.warnings.length > 0 ? '<p style="margin-top: 10px; color: #ff9800; font-size: 12px;">⚠️ ' + data.warnings.join('<br>') + '</p>' : ''}
                    \`;

                    // Store config for download
                    window.currentConfig = data.config;
                } else {
                    result.classList.add('show', 'error');
                    resultTitle.textContent = '✗ 转换失败';
                    resultContent.textContent = data.errors ? data.errors.join('\\n') : data.error || '未知错误';
                }
            } catch (error) {
                result.classList.add('show', 'error');
                resultTitle.textContent = '✗ 请求失败';
                resultContent.textContent = error.message;
            } finally {
                submitBtn.disabled = false;
                btnText.textContent = '开始转换';
            }
        });

        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                alert('✓ 已复制到剪贴板');
            }).catch(() => {
                alert('✗ 复制失败,请手动复制');
            });
        }

        function downloadConfig() {
            if (!window.currentConfig) return;

            const blob = new Blob([JSON.stringify(window.currentConfig, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'singbox-config.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    </script>
</body>
</html>
`;

app.get('/', (c) => {
    return c.html(HTML_PAGE);
});

export default app;
