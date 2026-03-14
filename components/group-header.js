// components/group-header.js

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
    }
    .group-header {
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      border-left: 3px solid var(--group-color, #888);
      background: var(--group-bg, rgba(255, 255, 255, 0.02));
      user-select: none;
    }
    .group-header:hover {
      background: var(--bg-hover, rgba(255, 255, 255, 0.04));
    }
    .group-header.sub-group {
      padding-left: 32px;
      border-left-color: var(--group-color-dimmed, rgba(136, 136, 136, 0.4));
    }
    .collapse-icon {
      font-size: 10px;
      width: 12px;
      text-align: center;
      transition: transform 0.15s;
    }
    .collapse-icon.collapsed {
      transform: rotate(-90deg);
    }
    .name {
      font-size: 13px;
      font-weight: 500;
      flex: 1;
    }
    .count {
      font-size: 10px;
      color: var(--text-dimmed, #555);
    }
    .unbookmarked-header {
      border-left: 3px dashed var(--unbookmarked-color, #cfa35b);
      background: var(--unbookmarked-bg, rgba(207, 163, 91, 0.06));
    }
    .unbookmarked-header .name,
    .unbookmarked-header .collapse-icon {
      color: var(--unbookmarked-color, #cfa35b);
    }
  </style>
  <div class="group-header" part="header">
    <span class="collapse-icon">▼</span>
    <span class="name"></span>
    <span class="count"></span>
  </div>
`;

export class GroupHeader extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this._data = null;

    this.shadowRoot.querySelector('.group-header').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('toggle-collapse', {
        bubbles: true,
        detail: { groupId: this._data?.id },
      }));
    });
  }

  set data(value) {
    this._data = value;
    this._render();
  }

  get data() {
    return this._data;
  }

  _render() {
    if (!this._data) return;

    const { name, color, count, collapsed, isSubGroup, isUnbookmarked } = this._data;
    const el = this.shadowRoot;

    const headerEl = el.querySelector('.group-header');
    const nameEl = el.querySelector('.name');
    const countEl = el.querySelector('.count');
    const collapseEl = el.querySelector('.collapse-icon');

    nameEl.textContent = name;
    countEl.textContent = count ?? '';

    // Set group color via CSS custom properties
    if (color && !isUnbookmarked) {
      const cssColor = color.startsWith('#') ? color : `var(--group-${color})`;
      headerEl.style.setProperty('--group-color', cssColor);
      headerEl.style.setProperty('--group-bg', `color-mix(in srgb, ${cssColor} 7%, transparent)`);
      headerEl.style.setProperty('--group-color-dimmed', `color-mix(in srgb, ${cssColor} 40%, transparent)`);
      nameEl.style.color = cssColor;
      collapseEl.style.color = cssColor;
      countEl.style.color = `color-mix(in srgb, ${cssColor} 53%, transparent)`;
    }

    // Sub-group styling
    headerEl.classList.toggle('sub-group', !!isSubGroup);

    // Unbookmarked tabs section
    headerEl.classList.toggle('unbookmarked-header', !!isUnbookmarked);

    // Collapse state
    collapseEl.classList.toggle('collapsed', !!collapsed);
  }
}

customElements.define('group-header', GroupHeader);
