import OpenAI from 'openai';
import type {
  EasyInputMessage,
  ResponseCreateParamsNonStreaming,
  ResponseInputMessageContentList
} from 'openai/resources/responses/responses';
import * as vscode from 'vscode';
import { randomBytes, randomUUID } from 'node:crypto';

const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const COPILOT_API_BASE_URL = 'https://api.githubcopilot.com';
const DEFAULT_MODEL = 'gpt-5-mini';
const GITHUB_SCOPES = ['read:user'] as const;

const HEADERS = {
  'User-Agent': 'GitHubCopilotChat/0.26.7',
  'Editor-Version': 'vscode/1.99.3',
  'Editor-Plugin-Version': 'copilot-chat/0.26.7',
  'Copilot-Integration-Id': 'vscode-chat',
  'Copilot-Vision-Request': 'true'
} as const;

type CopilotUsage = unknown;

type ConversationInput = Exclude<NonNullable<ResponseCreateParamsNonStreaming['input']>, string>;

type ChatImageInput = {
  dataUrl: string;
  name?: string;
  type?: string;
  size?: number;
  detail?: 'low' | 'high' | 'auto';
};

type WebviewIncomingMessage =
  | { type: 'ready' }
  | { type: 'signIn' }
  | { type: 'reset' }
  | { type: 'send'; text?: string; model?: string; images?: ChatImageInput[] };

type WebviewOutgoingMessage =
  | { type: 'status'; authenticated: boolean; login: string | null }
  | { type: 'assistant'; text: string; model: string; usage: CopilotUsage | null }
  | { type: 'error'; message: string }
  | { type: 'cleared' };

type CopilotTokenResponse = {
  token?: string;
  expires_at?: number | string;
  refresh_in?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toTrimmedString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const normalizeImageInputs = (value: unknown): ChatImageInput[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const results: ChatImageInput[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      if (item.startsWith('data:image/')) {
        results.push({ dataUrl: item });
      }
      continue;
    }
    if (!isRecord(item)) {
      continue;
    }
    const dataUrl = toTrimmedString(item.dataUrl);
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      continue;
    }

    const detailRaw = toTrimmedString(item.detail);
    const detail =
      detailRaw === 'low' || detailRaw === 'high' || detailRaw === 'auto' ? detailRaw : undefined;

    results.push({
      dataUrl,
      detail,
      name: toTrimmedString(item.name) ?? undefined,
      type: toTrimmedString(item.type) ?? undefined,
      size: typeof item.size === 'number' ? item.size : undefined
    });
  }
  return results;
};

const parseCopilotExpiry = (data: CopilotTokenResponse): number => {
  if (typeof data.expires_at === 'number') {
    return data.expires_at * 1000;
  }

  if (typeof data.expires_at === 'string') {
    const parsed = Date.parse(data.expires_at);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  if (typeof data.refresh_in === 'number') {
    return Date.now() + data.refresh_in * 1000;
  }

  return Date.now() + 5 * 60 * 1000;
};

const extractOutputText = (data: unknown): string => {
  if (isRecord(data) && typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = isRecord(data) ? data.output : null;
  if (!Array.isArray(output)) {
    return '';
  }

  const parts: string[] = [];
  for (const item of output) {
    if (!isRecord(item)) {
      continue;
    }
    const content = item.content;
    if (typeof content === 'string') {
      parts.push(content);
      continue;
    }
    if (!Array.isArray(content)) {
      continue;
    }
    for (const entry of content) {
      if (!isRecord(entry)) {
        continue;
      }
      const entryType = entry.type;
      const text = entry.text;
      if (typeof text === 'string' && (entryType === 'output_text' || entryType === 'text')) {
        parts.push(text);
      }
    }
  }

  return parts.join('\n').trim();
};

class CopilotAuth {
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly sessionProvider: (
      createIfNone: boolean
    ) => Thenable<vscode.AuthenticationSession | undefined>
  ) {}

  async getSession(createIfNone: boolean): Promise<vscode.AuthenticationSession | undefined> {
    return this.sessionProvider(createIfNone);
  }

  async getCopilotToken(): Promise<string> {
    const now = Date.now();
    if (this.token && now < this.tokenExpiresAt - 60_000) {
      return this.token;
    }

    const session = await this.sessionProvider(true);
    if (!session) {
      throw new Error('GitHub sign-in was canceled.');
    }

    const response = await fetch(COPILOT_TOKEN_URL, {
      method: 'GET',
      headers: {
        ...HEADERS,
        Authorization: `token ${session.accessToken}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Copilot token request failed (${response.status}): ${detail}`);
    }

    const data = (await response.json()) as CopilotTokenResponse;
    if (!data || !data.token) {
      throw new Error('Copilot token response missing token.');
    }

    this.token = data.token;
    this.tokenExpiresAt = parseCopilotExpiry(data);

    return this.token;
  }
}

class CopilotResponsesService {
  constructor(private readonly auth: CopilotAuth) {}

  async sendChat(
    model: string,
    input: ConversationInput,
    sessionId: string
  ): Promise<{ text: string; usage: CopilotUsage | null }> {
    const copilotToken = await this.auth.getCopilotToken();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const client = new OpenAI({
      apiKey: copilotToken,
      baseURL: COPILOT_API_BASE_URL,
      defaultHeaders: HEADERS
    });

    const response = await client.responses.create(
      {
        model,
        input,
        stream: false
      },
      {
        headers: {
          'Copilot-Session-Id': sessionId,
          'Copilot-Client-Timezone': timezone
        }
      }
    );

    const usage =
      isRecord(response) && 'usage' in response
        ? ((response as { usage?: CopilotUsage }).usage ?? null)
        : null;

    return {
      text: extractOutputText(response),
      usage
    };
  }
}

class CopilotResponsesPanel {
  static currentPanel: CopilotResponsesPanel | undefined;

  static createOrShow(): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (CopilotResponsesPanel.currentPanel) {
      CopilotResponsesPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'copilotResponsesChat',
      'Copilot Responses Chat',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    CopilotResponsesPanel.currentPanel = new CopilotResponsesPanel(panel);
  }

  private readonly disposables: vscode.Disposable[] = [];
  private readonly auth: CopilotAuth;
  private readonly service: CopilotResponsesService;
  private conversation: ConversationInput = [];
  private readonly copilotSessionId = randomUUID();

  private constructor(private readonly panel: vscode.WebviewPanel) {
    this.auth = new CopilotAuth((createIfNone) =>
      vscode.authentication.getSession('github', [...GITHUB_SCOPES], { createIfNone })
    );
    this.service = new CopilotResponsesService(this.auth);

    this.panel.webview.html = getWebviewHtml(this.panel.webview);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message) => {
        void this.handleMessage(message);
      },
      null,
      this.disposables
    );
  }

  dispose(): void {
    CopilotResponsesPanel.currentPanel = undefined;

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private async handleMessage(raw: unknown): Promise<void> {
    if (!isRecord(raw) || typeof raw.type !== 'string') {
      return;
    }

    const message = raw as WebviewIncomingMessage;

    switch (message.type) {
      case 'ready':
        await this.sendStatus(false);
        return;
      case 'signIn':
        await this.sendStatus(true);
        return;
      case 'reset':
        this.conversation = [];
        this.postMessage({ type: 'cleared' });
        return;
      case 'send':
        await this.handleSend(message);
        return;
      default:
        return;
    }
  }

  private async sendStatus(createIfNone: boolean): Promise<void> {
    try {
      const session = await this.auth.getSession(createIfNone);
      const login = session?.account?.label || null;
      this.postMessage({
        type: 'status',
        authenticated: Boolean(session),
        login
      });
    } catch (error) {
      this.postMessage({
        type: 'error',
        message: toErrorMessage(error)
      });
    }
  }

  private async handleSend(
    message: Extract<WebviewIncomingMessage, { type: 'send' }>
  ): Promise<void> {
    const text = toTrimmedString(message.text) ?? '';
    const images = normalizeImageInputs(message.images);
    if (!text && images.length === 0) {
      return;
    }

    const model = toTrimmedString(message.model) ?? DEFAULT_MODEL;

    this.conversation.push(this.buildUserMessage(text, images));

    try {
      const reply = await this.service.sendChat(model, this.conversation, this.copilotSessionId);
      const replyText = reply.text || '[No text output returned]';
      this.conversation.push({ role: 'assistant', content: replyText });

      this.postMessage({
        type: 'assistant',
        text: replyText,
        model,
        usage: reply.usage
      });
    } catch (error) {
      this.postMessage({
        type: 'error',
        message: toErrorMessage(error)
      });
    }
  }

  private buildUserMessage(text: string, images: ChatImageInput[]): EasyInputMessage {
    if (!images.length) {
      return { role: 'user', content: text };
    }

    const content: ResponseInputMessageContentList = [];
    if (text) {
      content.push({ type: 'input_text', text });
    }
    for (const image of images) {
      content.push({
        type: 'input_image',
        image_url: image.dataUrl,
        detail: image.detail ?? 'auto'
      });
    }

    return { role: 'user', content };
  }

  private postMessage(message: WebviewOutgoingMessage): void {
    void this.panel.webview.postMessage(message);
  }
}

function getWebviewHtml(webview: vscode.Webview): string {
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
          <button class="pill-button secondary" id="reset">New chat</button>
        </div>
      </div>
      <input id="image-input" type="file" accept="image/*" multiple hidden />
      <div class="attachments" id="attachments" hidden></div>
      <textarea id="input" placeholder="Ask something using Copilot Responses..."></textarea>
      <div class="send-row">
        <span class="hint">Ctrl+Enter to send, Enter for newline.</span>
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
    const imageInput = document.getElementById('image-input');
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
      imageInput.disabled = busy;
      updateSendState();
    };

    const addMessage = (role, text, images) => {
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
        card.className = 'attachment';
        const img = document.createElement('img');
        img.src = item.dataUrl;
        img.alt = item.name || 'Attachment';
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
        card.appendChild(img);
        card.appendChild(removeButton);
        attachmentsContainer.appendChild(card);
      }
    };

    const clearAttachments = () => {
      attachments.length = 0;
      attachmentsContainer.innerHTML = '';
      attachmentsContainer.hidden = true;
      imageInput.value = '';
      updateSendState();
    };

    const addFiles = async (fileList) => {
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

    const sendMessage = () => {
      const text = input.value.trim();
      const images = attachments.map((item) => ({
        dataUrl: item.dataUrl,
        name: item.name,
        type: item.type,
        size: item.size
      }));
      if (!text && images.length === 0) {
        return;
      }
      addMessage('user', text, images);
      input.value = '';
      autoResize();
      showPending();
      setBusy(true);
      clearAttachments();
      vscode.postMessage({
        type: 'send',
        text,
        model: modelInput.value.trim(),
        images
      });
    };

    const autoResize = () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 160) + 'px';
      updateSendState();
    };

    input.addEventListener('input', autoResize);

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.ctrlKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    sendButton.addEventListener('click', sendMessage);

    addImageButton.addEventListener('click', () => {
      if (!isBusy) {
        imageInput.click();
      }
    });

    imageInput.addEventListener('change', (event) => {
      const files = event.target.files;
      if (files && files.length) {
        addFiles(files);
      }
      imageInput.value = '';
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
          addMessage('assistant', message.text || '');
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

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('copilotResponsesChat.open', () => {
      CopilotResponsesPanel.createOrShow();
    })
  );
}

export function deactivate(): void {}
