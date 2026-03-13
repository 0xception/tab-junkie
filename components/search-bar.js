// components/search-bar.js

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
    }
    .search-container {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
    }
    .search-input-wrapper {
      background: rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      padding: 8px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid transparent;
      transition: border-color 0.15s;
    }
    .search-input-wrapper.focused {
      border-color: rgba(91, 145, 207, 0.4);
    }
    .search-icon {
      color: #555;
      font-size: 13px;
      flex-shrink: 0;
    }
    .search-input-wrapper.focused .search-icon {
      color: #5b91cf;
    }
    input {
      background: none;
      border: none;
      outline: none;
      color: var(--text-primary, #e0e0e0);
      font-size: 13px;
      font-family: inherit;
      width: 100%;
    }
    input::placeholder {
      color: #555;
    }
  </style>
  <div class="search-container">
    <div class="search-input-wrapper">
      <span class="search-icon">&#x1F50D;</span>
      <input type="text" placeholder="Search bookmarks & tabs..." />
    </div>
  </div>
`;

export class SearchBar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this._input = this.shadowRoot.querySelector('input');
    this._wrapper = this.shadowRoot.querySelector('.search-input-wrapper');

    this._input.addEventListener('input', () => {
      this.dispatchEvent(new CustomEvent('search', {
        bubbles: true,
        composed: true,
        detail: { query: this._input.value },
      }));
    });

    this._input.addEventListener('focus', () => {
      this._wrapper.classList.add('focused');
    });

    this._input.addEventListener('blur', () => {
      this._wrapper.classList.remove('focused');
    });

    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        this.dispatchEvent(new CustomEvent('search-key', {
          bubbles: true,
          composed: true,
          detail: { key: e.key },
        }));
      }
    });
  }

  focus() {
    this._input.focus();
  }

  get value() {
    return this._input.value;
  }

  set value(v) {
    this._input.value = v;
  }

  clear() {
    this._input.value = '';
    this.dispatchEvent(new CustomEvent('search', {
      bubbles: true,
      composed: true,
      detail: { query: '' },
    }));
  }
}

customElements.define('search-bar', SearchBar);
