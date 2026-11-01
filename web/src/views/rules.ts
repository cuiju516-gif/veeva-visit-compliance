import type { RulesInput } from '../api';
import { must } from '../dom';
import { createErrorBanner } from './errorBanner';
import type { AppState } from '../state';
import type { RuleVersion } from '../types';

export interface RulesHandlers {
  onSave(input: RulesInput): Promise<void>;
}

export interface RulesView {
  update(state: AppState): void;
}

const TEMPLATE = `
  <section class="card rules-card" data-rules-card hidden aria-labelledby="rules-heading">
    <div class="card-head">
      <div>
        <h2 id="rules-heading">合规规则</h2>
        <p class="hint">改阈值会生成新版本，只影响之后的判定；历史判定不回溯。</p>
      </div>
      <span class="badge" data-rules-version></span>
    </div>
    <form class="rules-form" data-rules-form>
      <div class="field">
        <label for="rules-min">最短停留时长（秒）</label>
        <input id="rules-min" data-testid="rules-min" type="number" min="30" step="1" required>
      </div>
      <div class="field">
        <label for="rules-max">最大偏离距离（米）</label>
        <input id="rules-max" data-testid="rules-max" type="number" min="50" step="1" required>
      </div>
      <div class="field">
        <label for="rules-timeout">悬挂超时（小时）</label>
        <input id="rules-timeout" data-testid="rules-timeout" type="number" min="1" step="1" required>
      </div>
      <div class="field">
        <label for="rules-report">补记录时限（小时）</label>
        <input id="rules-report" data-testid="rules-report" type="number" min="1" step="1" required>
      </div>
      <div class="field">
        <label for="rules-note">变更说明</label>
        <input id="rules-note" data-testid="rules-note" type="text" maxlength="200" placeholder="为什么改？">
      </div>
      <div data-rules-banner></div>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit" data-testid="rules-submit">保存并生效</button>
        <span class="hint" data-rules-hint></span>
      </div>
    </form>
    <table class="rules-history" data-rules-history hidden>
      <thead><tr><th>版本</th><th>停留</th><th>距离</th><th>悬挂</th><th>补记录</th><th>生效时间</th><th>操作人</th></tr></thead>
      <tbody data-rules-history-rows></tbody>
    </table>
  </section>
`;

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function mountRulesView(host: HTMLElement, handlers: RulesHandlers): RulesView {
  host.innerHTML = TEMPLATE;

  const card = must<HTMLElement>(host, '[data-rules-card]');
  const form = must<HTMLFormElement>(host, '[data-rules-form]');
  const versionBadge = must<HTMLElement>(host, '[data-rules-version]');
  const minInput = must<HTMLInputElement>(host, '#rules-min');
  const maxInput = must<HTMLInputElement>(host, '#rules-max');
  const timeoutInput = must<HTMLInputElement>(host, '#rules-timeout');
  const reportInput = must<HTMLInputElement>(host, '#rules-report');
  const noteInput = must<HTMLInputElement>(host, '#rules-note');
  const submit = must<HTMLButtonElement>(host, '[data-testid="rules-submit"]');
  const hint = must<HTMLElement>(host, '[data-rules-hint]');
  const history = must<HTMLTableElement>(host, '[data-rules-history]');
  const historyRows = must<HTMLElement>(host, '[data-rules-history-rows]');

  const banner = createErrorBanner();
  must<HTMLElement>(host, '[data-rules-banner]').append(banner.element);

  let loadedVersion = '';

  function fill(rule: RuleVersion): void {
    minInput.value = String(rule.minDurationSeconds);
    maxInput.value = String(rule.maxDistanceMeters);
    timeoutInput.value = String(rule.timeoutHours);
    reportInput.value = String(rule.reportTimeoutHours);
    versionBadge.textContent = `当前 ${rule.version}`;
    loadedVersion = rule.version;
  }

  function renderHistory(list: RuleVersion[]): void {
    if (list.length <= 1) {
      history.hidden = true;
      return;
    }
    history.hidden = false;
    historyRows.replaceChildren();
    for (const rule of list) {
      const row = document.createElement('tr');
      for (const text of [
        rule.version,
        `${rule.minDurationSeconds} 秒`,
        `${rule.maxDistanceMeters} 米`,
        `${rule.timeoutHours} 小时`,
        `${rule.reportTimeoutHours} 小时`,
        formatWhen(rule.createdAt),
        rule.createdBy || '—',
      ]) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      }
      historyRows.append(row);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    banner.clear();
    void handlers.onSave({
      minDurationSeconds: Number(minInput.value),
      maxDistanceMeters: Number(maxInput.value),
      timeoutHours: Number(timeoutInput.value),
      reportTimeoutHours: Number(reportInput.value),
      note: noteInput.value.trim(),
    });
  });

  return {
    update(state: AppState) {
      // Only the administrator sees this card; everyone else gets nothing.
      const isAdmin = state.actor === '';
      card.hidden = !isAdmin;
      if (!isAdmin) return;

      const error = state.errors.rules;
      if (error) banner.showText(error.message);
      else banner.clear();

      submit.disabled = state.loading.mutation;

      const rules = state.rules;
      if (!rules) {
        hint.textContent = '正在加载规则…';
        return;
      }
      if (loadedVersion !== rules.version) {
        fill(rules);
        noteInput.value = '';
      }
      hint.textContent = `当前生效 ${rules.version}：${rules.minDurationSeconds} 秒 / ${rules.maxDistanceMeters} 米 / 悬挂 ${rules.timeoutHours} 小时 / 补记录 ${rules.reportTimeoutHours} 小时`;
      renderHistory(state.ruleHistory);
    },
  };
}
