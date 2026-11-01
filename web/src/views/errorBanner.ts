import type { ApiError } from '../api';
import { localizeApiError } from '../format';

export interface ErrorBanner {
  readonly element: HTMLElement;
  show(error: ApiError | null): void;
  showText(message: string): void;
  clear(): void;
}

/**
 * Inline error banner. API failures render the stable code, the field named in
 * error.details.field (when present) and the server message; client-side form
 * checks render only a message.
 */
export function createErrorBanner(): ErrorBanner {
  const element = document.createElement('div');
  element.className = 'error-banner';
  element.dataset.testid = 'error-banner';
  element.setAttribute('role', 'alert');
  element.hidden = true;

  const code = document.createElement('code');
  code.className = 'error-code';

  const field = document.createElement('span');
  field.className = 'error-field';

  const message = document.createElement('span');
  message.className = 'error-message';

  element.append(code, field, message);

  let lastKey: string | null = null;

  function render(key: string | null, codeText: string, fieldText: string, messageText: string): void {
    if (key === lastKey) return;
    lastKey = key;
    if (key === null) {
      element.hidden = true;
      code.textContent = '';
      field.textContent = '';
      message.textContent = '';
      return;
    }
    element.hidden = false;
    code.hidden = codeText === '';
    code.textContent = codeText;
    field.hidden = fieldText === '';
    field.textContent = fieldText;
    message.textContent = messageText;
  }

  return {
    element,
    show: (error) => {
      if (error === null) {
        render(null, '', '', '');
        return;
      }
      // The code stays visible (it is what you search the logs for); the sentence
      // is ours, because an English server message in a Chinese UI reads like a
      // crash rather than like an answer.
      const fieldText = error.field ? `field: ${error.field}` : '';
      const text = localizeApiError(error.code, error.message, error.field);
      render(`api:${error.code}:${fieldText}:${text}`, error.code, fieldText, text);
    },
    showText: (text) => {
      render(`text:${text}`, '', '', text);
    },
    clear: () => render(null, '', '', ''),
  };
}
