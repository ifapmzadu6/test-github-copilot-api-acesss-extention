import type * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';

export function getWebviewHtml(webview: vscode.Webview): string {
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src 'unsafe-inline' ${webview.cspSource} https:; font-src https: ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Copilot Responses Chat</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');

    :root {
      color-scheme: light;
      --bg-1: #f5efe6;
      --bg-2: #dee9e1;
      --ink: #162024;
      --muted: #5a6b73;
      --accent: #f06a32;
      --accent-2: #1c7a74;
      --card: rgba(255, 252, 248, 0.92);
      --line: rgba(22, 32, 36, 0.12);
      --shadow: 0 18px 40px rgba(22, 32, 36, 0.12);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 12% 18%, rgba(240, 106, 50, 0.22), transparent 55%),
        radial-gradient(circle at 88% 10%, rgba(28, 122, 116, 0.22), transparent 45%),
        radial-gradient(circle at 85% 80%, rgba(240, 106, 50, 0.18), transparent 50%),
        linear-gradient(120deg, var(--bg-1), var(--bg-2));
      min-height: 100vh;
      display: flex;
      align-items: stretch;
    }

    .app {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 24px;
      gap: 18px;
    }

    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 16px 20px;
      box-shadow: var(--shadow);
      animation: rise 0.5s ease;
    }

    .title {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .title h1 {
      margin: 0;
      font-size: 20px;
      letter-spacing: 0.3px;
    }

    .title p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }

    .status {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.7);
    }

    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #d0d6d8;
      box-shadow: 0 0 0 4px rgba(208, 214, 216, 0.35);
    }

    .status-dot.active {
      background: var(--accent-2);
      box-shadow: 0 0 0 4px rgba(28, 122, 116, 0.25);
    }

    .pill-button {
      border: none;
      border-radius: 999px;
      padding: 8px 14px;
      font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
      font-weight: 600;
      background: var(--accent);
      color: #fffaf6;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .pill-button.secondary {
      background: rgba(22, 32, 36, 0.08);
      color: var(--ink);
    }

    .pill-button:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 16px rgba(22, 32, 36, 0.12);
    }

    .messages {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 14px;
      overflow-y: auto;
      padding: 12px 4px 12px 0;
    }

    .message {
      max-width: 82%;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: var(--card);
      box-shadow: var(--shadow);
      animation: rise 0.4s ease;
      line-height: 1.5;
    }

    .message.user {
      align-self: flex-end;
      background: rgba(240, 106, 50, 0.1);
      border-color: rgba(240, 106, 50, 0.3);
    }

    .message.assistant {
      align-self: flex-start;
      background: rgba(28, 122, 116, 0.08);
      border-color: rgba(28, 122, 116, 0.25);
    }

    .message.error {
      align-self: flex-start;
      background: rgba(205, 66, 66, 0.1);
      border-color: rgba(205, 66, 66, 0.35);
      color: #8b2c2c;
    }

    .message.pending {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: 'Space Mono', 'Courier New', monospace;
      color: var(--muted);
    }

    .message-text {
      white-space: pre-wrap;
    }

    .message-images {
      margin-top: 10px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 8px;
    }

    .message-images img {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--line);
      object-fit: cover;
      max-height: 180px;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid rgba(22, 32, 36, 0.2);
      border-top-color: var(--accent-2);
      animation: spin 0.8s linear infinite;
    }

    .composer {
      border: 1px solid var(--line);
      border-radius: 20px;
      background: var(--card);
      box-shadow: var(--shadow);
      padding: 14px;
      display: grid;
      gap: 12px;
    }

    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
    }

    .control-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12px;
      color: var(--muted);
    }

    .field input {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid var(--line);
      font-family: 'Space Mono', 'Courier New', monospace;
      font-size: 12px;
      background: rgba(255, 255, 255, 0.85);
    }

    textarea {
      width: 100%;
      border-radius: 16px;
      border: 1px solid var(--line);
      padding: 12px 14px;
      font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
      font-size: 14px;
      min-height: 52px;
      resize: none;
      background: rgba(255, 255, 255, 0.85);
    }

    .attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .attachments[hidden] {
      display: none;
    }

    .attachment {
      position: relative;
      width: 92px;
      height: 92px;
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.8);
    }

    .attachment img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .attachment button {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: none;
      background: rgba(22, 32, 36, 0.7);
      color: #fff;
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
    }

    .attachment.file {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 10px;
      text-align: center;
      font-size: 11px;
      color: var(--ink);
    }

    .attachment-name {
      font-family: 'Space Mono', 'Courier New', monospace;
      word-break: break-all;
    }

    .message-files {
      margin-top: 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .message-file {
      border: 1px solid var(--line);
      background: rgba(22, 32, 36, 0.06);
      padding: 6px 10px;
      border-radius: 10px;
      font-size: 12px;
      font-family: 'Space Mono', 'Courier New', monospace;
    }

    .message-meta {
      margin-top: 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .message-meta-item {
      border: 1px solid var(--line);
      background: rgba(22, 32, 36, 0.05);
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-family: 'Space Mono', 'Courier New', monospace;
      color: var(--muted);
    }

    .send-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .send-row .hint {
      font-size: 12px;
      color: var(--muted);
    }

    .pill-button[disabled] {
      opacity: 0.6;
      cursor: default;
      transform: none;
      box-shadow: none;
    }

    @keyframes rise {
      from {
        transform: translateY(8px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    @media (max-width: 700px) {
      .app {
        padding: 16px;
      }

      .message {
        max-width: 100%;
      }

      header {
        padding: 14px 16px;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <header>
      <div class="title">
        <h1>Copilot Responses</h1>
        <p>GitHub auth + OpenAI Responses format chat inside VS Code.</p>
      </div>
      <div class="status">
        <span class="status-dot" id="status-dot"></span>
        <span id="status-text">Not signed in</span>
        <button class="pill-button secondary" id="sign-in">Sign in</button>
      </div>
    </header>

    <div class="messages" id="messages"></div>

    <div class="composer">
      <div class="controls">
        <label class="field">
          <span>Model</span>
          <input id="model" list="model-list" value="gpt-5-mini" />
          <datalist id="model-list">
            <option value="gpt-5-mini"></option>
            <option value="gpt-4o-mini"></option>
            <option value="gpt-4o"></option>
            <option value="gpt-4.1-mini"></option>
            <option value="gpt-4.1"></option>
          </datalist>
        </label>
        <div class="control-buttons">
          <button class="pill-button secondary" id="add-image">Add image</button>
          <button class="pill-button secondary" id="add-file">Add file</button>
          <button class="pill-button secondary" id="reset">New chat</button>
        </div>
      </div>
      <input id="image-input" type="file" accept="image/*" multiple hidden />
      <input id="file-input" type="file" multiple hidden />
      <div class="attachments" id="attachments" hidden></div>
      <textarea id="input" placeholder="Ask something using Copilot Responses..."></textarea>
      <div class="send-row">
        <span class="hint">Click Send to submit, Enter for newline.</span>
        <button class="pill-button" id="send">Send</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messages = document.getElementById('messages');
    const input = document.getElementById('input');
    const sendButton = document.getElementById('send');
    const resetButton = document.getElementById('reset');
    const addImageButton = document.getElementById('add-image');
    const addFileButton = document.getElementById('add-file');
    const imageInput = document.getElementById('image-input');
    const fileInput = document.getElementById('file-input');
    const attachmentsContainer = document.getElementById('attachments');
    const signInButton = document.getElementById('sign-in');
    const modelInput = document.getElementById('model');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');

    let pendingNode = null;
    let isBusy = false;
    let attachmentCounter = 0;
    const attachments = [];

    const scrollToBottom = () => {
      messages.scrollTop = messages.scrollHeight;
    };

    const updateSendState = () => {
      const hasContent = input.value.trim() || attachments.length > 0;
      sendButton.disabled = isBusy || !hasContent;
    };

    const setBusy = (busy) => {
      isBusy = busy;
      resetButton.disabled = busy;
      input.disabled = busy;
      addImageButton.disabled = busy;
      addFileButton.disabled = busy;
      imageInput.disabled = busy;
      fileInput.disabled = busy;
      updateSendState();
    };

    const addMessage = (role, text, images, files, meta) => {
      const node = document.createElement('div');
      node.className = 'message ' + role;

      if (text) {
        const textNode = document.createElement('div');
        textNode.className = 'message-text';
        textNode.textContent = text;
        node.appendChild(textNode);
      }

      if (Array.isArray(images) && images.length > 0) {
        const grid = document.createElement('div');
        grid.className = 'message-images';
        for (const image of images) {
          const src = typeof image === 'string' ? image : image.dataUrl;
          if (!src) {
            continue;
          }
          const img = document.createElement('img');
          img.src = src;
          img.alt = typeof image === 'object' && image.name ? image.name : 'Attachment';
          grid.appendChild(img);
        }
        if (grid.childNodes.length > 0) {
          node.appendChild(grid);
        }
      }

      if (Array.isArray(files) && files.length > 0) {
        const list = document.createElement('div');
        list.className = 'message-files';
        for (const file of files) {
          if (!file) {
            continue;
          }
          const pill = document.createElement('div');
          pill.className = 'message-file';
          pill.textContent = file.name || 'File';
          list.appendChild(pill);
        }
        if (list.childNodes.length > 0) {
          node.appendChild(list);
        }
      }

      if (meta && meta.apiMode) {
        const metaRow = document.createElement('div');
        metaRow.className = 'message-meta';
        const apiTag = document.createElement('span');
        apiTag.className = 'message-meta-item';
        apiTag.textContent = 'API: ' + meta.apiMode;
        metaRow.appendChild(apiTag);
        node.appendChild(metaRow);
      }

      messages.appendChild(node);
      scrollToBottom();
      return node;
    };

    const showPending = () => {
      pendingNode = document.createElement('div');
      pendingNode.className = 'message pending';
      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      const label = document.createElement('span');
      label.textContent = 'Thinking...';
      pendingNode.appendChild(spinner);
      pendingNode.appendChild(label);
      messages.appendChild(pendingNode);
      scrollToBottom();
    };

    const clearPending = () => {
      if (pendingNode) {
        pendingNode.remove();
        pendingNode = null;
      }
    };

    const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image.'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

    const renderAttachments = () => {
      attachmentsContainer.innerHTML = '';
      attachmentsContainer.hidden = attachments.length === 0;
      for (const item of attachments) {
        const card = document.createElement('div');
        card.className = 'attachment' + (item.kind === 'file' ? ' file' : '');
        if (item.kind === 'image') {
          const img = document.createElement('img');
          img.src = item.dataUrl;
          img.alt = item.name || 'Attachment';
          card.appendChild(img);
        } else {
          const label = document.createElement('div');
          label.className = 'attachment-name';
          label.textContent = item.name || 'File';
          label.title = item.name || 'File';
          card.appendChild(label);
        }
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.textContent = 'x';
        removeButton.addEventListener('click', () => {
          if (isBusy) {
            return;
          }
          const index = attachments.findIndex((attachment) => attachment.id === item.id);
          if (index >= 0) {
            attachments.splice(index, 1);
            renderAttachments();
            updateSendState();
          }
        });
        card.appendChild(removeButton);
        attachmentsContainer.appendChild(card);
      }
    };

    const clearAttachments = () => {
      attachments.length = 0;
      attachmentsContainer.innerHTML = '';
      attachmentsContainer.hidden = true;
      imageInput.value = '';
      fileInput.value = '';
      updateSendState();
    };

    const addImageFiles = async (fileList) => {
      const files = Array.from(fileList);
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          addMessage('error', 'Only image files are supported.');
          continue;
        }
        try {
          const dataUrl = await readFileAsDataUrl(file);
          attachments.push({
            id: String(attachmentCounter++),
            kind: 'image',
            name: file.name,
            type: file.type,
            size: file.size,
            dataUrl
          });
        } catch (error) {
          addMessage('error', 'Failed to read image.');
        }
      }
      renderAttachments();
      updateSendState();
    };

    const addFileAttachments = async (fileList) => {
      const files = Array.from(fileList);
      for (const file of files) {
        if (file.type && file.type.startsWith('image/')) {
          addMessage('error', 'Use Add image for image files.');
          continue;
        }
        try {
          const data = await readFileAsDataUrl(file);
          attachments.push({
            id: String(attachmentCounter++),
            kind: 'file',
            name: file.name,
            type: file.type,
            size: file.size,
            data
          });
        } catch (error) {
          addMessage('error', 'Failed to read file.');
        }
      }
      renderAttachments();
      updateSendState();
    };

    const sendMessage = () => {
      const text = input.value.trim();
      const images = attachments
        .filter((item) => item.kind === 'image')
        .map((item) => ({
          dataUrl: item.dataUrl,
          name: item.name,
          type: item.type,
          size: item.size
        }));
      const files = attachments
        .filter((item) => item.kind === 'file')
        .map((item) => ({
          data: item.data,
          name: item.name,
          type: item.type,
          size: item.size
        }));
      if (!text && images.length === 0 && files.length === 0) {
        return;
      }
      addMessage('user', text, images, files);
      input.value = '';
      autoResize();
      showPending();
      setBusy(true);
      clearAttachments();
      vscode.postMessage({
        type: 'send',
        text,
        model: modelInput.value.trim(),
        images,
        files
      });
    };

    const autoResize = () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 160) + 'px';
      updateSendState();
    };

    input.addEventListener('input', autoResize);

    sendButton.addEventListener('click', sendMessage);

    addImageButton.addEventListener('click', () => {
      if (!isBusy) {
        imageInput.click();
      }
    });

    imageInput.addEventListener('change', (event) => {
      const files = event.target.files;
      if (files && files.length) {
        addImageFiles(files);
      }
      imageInput.value = '';
    });

    addFileButton.addEventListener('click', () => {
      if (!isBusy) {
        fileInput.click();
      }
    });

    fileInput.addEventListener('change', (event) => {
      const files = event.target.files;
      if (files && files.length) {
        addFileAttachments(files);
      }
      fileInput.value = '';
    });

    resetButton.addEventListener('click', () => {
      messages.innerHTML = '';
      clearAttachments();
      vscode.postMessage({ type: 'reset' });
    });

    signInButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'signIn' });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || !message.type) {
        return;
      }

      switch (message.type) {
        case 'status': {
          if (message.authenticated) {
            statusDot.classList.add('active');
            statusText.textContent = message.login ? 'Signed in as ' + message.login : 'Signed in';
          } else {
            statusDot.classList.remove('active');
            statusText.textContent = 'Not signed in';
          }
          return;
        }
        case 'assistant': {
          clearPending();
          setBusy(false);
          addMessage('assistant', message.text || '', null, null, { apiMode: message.apiMode });
          return;
        }
        case 'error': {
          clearPending();
          setBusy(false);
          addMessage('error', message.message || 'Unknown error');
          return;
        }
        case 'cleared': {
          messages.innerHTML = '';
          clearAttachments();
          return;
        }
        default:
          return;
      }
    });

    vscode.postMessage({ type: 'ready' });
    autoResize();
  </script>
</body>
</html>`;
}

function getNonce(): string {
  return randomBytes(16).toString('base64');
}
