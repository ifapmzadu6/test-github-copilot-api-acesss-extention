import type {
  EasyInputMessage,
  ResponseInputMessageContentList
} from 'openai/resources/responses/responses';
import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { DEFAULT_MODEL, GITHUB_SCOPES } from '../constants.js';
import { CopilotAuth } from '../services/copilotAuth.js';
import { CopilotResponsesService } from '../services/copilotResponsesService.js';
import type {
  ChatImageInput,
  ChatFileInput,
  ConversationInput,
  WebviewIncomingMessage,
  WebviewOutgoingMessage
} from '../types.js';
import { isRecord, toErrorMessage, toTrimmedString } from '../utils/guards.js';
import { normalizeImageInputs } from '../utils/normalizeImageInputs.js';
import { normalizeFileInputs } from '../utils/normalizeFileInputs.js';
import { getWebviewHtml } from '../webview/template.js';

export class CopilotResponsesPanel {
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
    const files = normalizeFileInputs(message.files);
    if (!text && images.length === 0 && files.length === 0) {
      return;
    }

    const model = toTrimmedString(message.model) ?? DEFAULT_MODEL;

    this.conversation.push(this.buildUserMessage(text, images, files));

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

  private buildUserMessage(
    text: string,
    images: ChatImageInput[],
    files: ChatFileInput[]
  ): EasyInputMessage {
    if (!images.length && !files.length) {
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

    for (const file of files) {
      content.push({
        type: 'input_file',
        file_data: file.data,
        filename: file.name
      });
    }

    return { role: 'user', content };
  }

  private postMessage(message: WebviewOutgoingMessage): void {
    void this.panel.webview.postMessage(message);
  }
}
