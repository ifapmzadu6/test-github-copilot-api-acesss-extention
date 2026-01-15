# Copilot Responses Chat (VS Code Extension)

This extension signs in to GitHub using the VS Code authentication API and uses the credentials to call the Copilot Responses API with the OpenAI Responses API format. It provides a simple chat UI inside VS Code.

## Usage

1. Open the command palette and run `Copilot Responses: Open Chat`.
2. Click **Sign in** if prompted.
3. Enter a prompt, optionally attach images, and click **Send**.

## Development

- Run `npm run build` to compile `src/extension.ts` into `dist/extension.js`.
- Run `npm run watch` to recompile on changes.

## Notes

- You need a GitHub account with Copilot access for the API to succeed.
- The model field is editable so you can try any model supported by the Copilot endpoint.
- Image inputs are sent as data URLs from the chat panel.
