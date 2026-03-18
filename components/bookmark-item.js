// components/bookmark-item.js

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
    }
    .bookmark {
      padding: 6px 16px 6px var(--indent, 32px);
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      border-left: 2px solid transparent;
      transition: background 0.1s;
    }
    .bookmark:hover {
      background: var(--bg-hover, rgba(255, 255, 255, 0.04));
    }
    .bookmark.unbookmarked {
      border-left: 2px dashed var(--unbookmarked-color, #cfa35b);
    }
    .bookmark.active {
      border-left: 2px solid var(--open-color, #5bcf72);
      background: color-mix(in srgb, var(--open-color, #5bcf72) 18%, transparent);
    }
    .bookmark.selected {
      background: color-mix(in srgb, var(--group-blue, #5b91cf) 15%, transparent);
    }
    .checkbox {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      border: 1.5px solid var(--text-dimmed, #555);
      flex-shrink: 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      opacity: 0;
      transition: opacity 0.1s;
      background: none;
      color: var(--text-primary, #fff);
    }
    .bookmark:hover .checkbox,
    :host([selectable]) .checkbox {
      opacity: 1;
    }
    .checkbox.checked {
      background: var(--group-blue, #5b91cf);
      border-color: var(--group-blue, #5b91cf);
      opacity: 1;
    }
    .favicon {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .favicon img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .favicon.placeholder {
      background: var(--bg-secondary, #2a2a3e);
      color: var(--text-dimmed, #555);
    }
    .favicon.unbookmarked-placeholder {
      background: color-mix(in srgb, var(--unbookmarked-color, #cfa35b) 12%, transparent);
      color: var(--unbookmarked-color, #cfa35b);
    }
    .title {
      font-size: 12px;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .title.unbookmarked {
      color: var(--unbookmarked-color, #cfa35b);
    }
    .open-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--open-color, #5bcf72);
      flex-shrink: 0;
      box-shadow: 0 0 4px var(--open-color, #5bcf72);
    }
    .window-badge {
      font-size: 9px;
      color: var(--text-dimmed, #555);
      background: color-mix(in srgb, var(--text-dimmed, #555) 15%, transparent);
      padding: 1px 4px;
      border-radius: 6px;
      flex-shrink: 0;
      line-height: 1.2;
    }
    .close-btn {
      font-size: 10px;
      color: var(--text-dimmed, #555);
      cursor: pointer;
      flex-shrink: 0;
      padding: 2px 4px;
      border-radius: 3px;
      border: none;
      background: none;
      line-height: 1;
    }
    .close-btn:hover {
      background: var(--bg-hover, rgba(255, 255, 255, 0.1));
      color: var(--text-secondary, #aaa);
    }
    .tooltip {
      display: none;
      position: absolute;
      bottom: calc(100% + 6px);
      left: var(--indent, 32px);
      right: 16px;
      background: var(--bg-secondary, #1e1e2e);
      border: 1px solid var(--border-subtle, #3a3a4e);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11px;
      line-height: 1.4;
      color: var(--text-secondary, #8899aa);
      pointer-events: none;
      z-index: 100;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tooltip .tooltip-title {
      color: var(--text-primary, #ccc);
      font-weight: 500;
      margin-bottom: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tooltip .tooltip-url {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bookmark-wrap {
      position: relative;
    }
    .hidden {
      display: none;
    }
  </style>
  <div class="bookmark-wrap">
  <div class="bookmark" part="bookmark">
    <div class="checkbox"></div>
    <div class="favicon">
      <img class="favicon-img hidden" />
      <span class="favicon-letter"></span>
    </div>
    <span class="title"></span>
    <span class="open-dot hidden"></span>
    <span class="window-badge hidden"></span>
    <button class="close-btn hidden" title="Close tab">&#x2715;</button>
  </div>
  <div class="tooltip">
    <div class="tooltip-title"></div>
    <div class="tooltip-url"></div>
  </div>
  </div>
`;

export class BookmarkItem extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this._data = null;
    this._selected = false;
    this._tooltipTimer = null;

    const wrapEl = this.shadowRoot.querySelector('.bookmark-wrap');
    const tooltipEl = this.shadowRoot.querySelector('.tooltip');

    wrapEl.addEventListener('mouseenter', () => {
      this._tooltipTimer = setTimeout(() => {
        tooltipEl.style.display = 'block';
      }, 400);
    });

    wrapEl.addEventListener('mouseleave', () => {
      clearTimeout(this._tooltipTimer);
      tooltipEl.style.display = 'none';
    });

    const checkboxEl = this.shadowRoot.querySelector('.checkbox');

    // Checkbox click always toggles without clearing other selections
    checkboxEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this._emitSelect(e, true);
    });

    // Bind event handlers
    this.shadowRoot.querySelector('.bookmark').addEventListener('click', (e) => {
      if (e.target.closest('.close-btn')) return;
      // Modifier keys or selectable mode → selection behavior
      if (this.hasAttribute('selectable') || e.shiftKey || e.ctrlKey || e.metaKey) {
        this._emitSelect(e);
      } else {
        this._handleClick();
      }
    });

    this.shadowRoot.querySelector('.close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this._handleClose();
    });
  }

  set data(value) {
    this._data = value;
    this._render();
  }

  get data() {
    return this._data;
  }

  set selected(value) {
    this._selected = value;
    const bookmarkEl = this.shadowRoot.querySelector('.bookmark');
    const checkboxEl = this.shadowRoot.querySelector('.checkbox');
    bookmarkEl.classList.toggle('selected', value);
    checkboxEl.classList.toggle('checked', value);
    checkboxEl.textContent = value ? '\u2713' : '';
  }

  get selected() {
    return this._selected;
  }

  _render() {
    if (!this._data) return;

    const { title, favicon, isOpen, isBookmarked, isActive } = this._data;

    const el = this.shadowRoot;

    const bookmarkEl = el.querySelector('.bookmark');
    const titleEl = el.querySelector('.title');
    const faviconImg = el.querySelector('.favicon-img');
    const faviconLetter = el.querySelector('.favicon-letter');
    const faviconContainer = el.querySelector('.favicon');
    const openDot = el.querySelector('.open-dot');
    const closeBtn = el.querySelector('.close-btn');

    // Set title and tooltip
    titleEl.textContent = title;
    el.querySelector('.tooltip-title').textContent = title;
    el.querySelector('.tooltip-url').textContent = this._data.url || '';

    // Visual state: only active tab and unbookmarked get special styling
    bookmarkEl.classList.toggle('unbookmarked', isBookmarked === false);
    bookmarkEl.classList.toggle('active', !!isActive);
    bookmarkEl.classList.toggle('selected', this._selected);
    titleEl.classList.toggle('unbookmarked', isBookmarked === false);

    // Checkbox
    const checkboxEl = el.querySelector('.checkbox');
    checkboxEl.classList.toggle('checked', this._selected);
    checkboxEl.textContent = this._selected ? '\u2713' : '';

    // Favicon
    if (favicon) {
      faviconImg.src = favicon;
      faviconImg.classList.remove('hidden');
      faviconLetter.classList.add('hidden');
      faviconContainer.classList.remove('placeholder', 'unbookmarked-placeholder');

      faviconImg.onerror = () => {
        faviconImg.classList.add('hidden');
        faviconLetter.classList.remove('hidden');
        faviconLetter.textContent = title.charAt(0).toUpperCase();
        faviconContainer.classList.add(
          isBookmarked === false ? 'unbookmarked-placeholder' : 'placeholder'
        );
      };
    } else {
      faviconImg.classList.add('hidden');
      faviconLetter.classList.remove('hidden');
      faviconLetter.textContent = title.charAt(0).toUpperCase();
      faviconContainer.classList.add(
        isBookmarked === false ? 'unbookmarked-placeholder' : 'placeholder'
      );
    }

    // Green dot for open bookmarks, close button for any open tab
    openDot.classList.toggle('hidden', !isOpen || isBookmarked === false);
    closeBtn.classList.toggle('hidden', !isOpen);

    // Window badge — shows which window a tab is in (multi-window only)
    const windowBadge = el.querySelector('.window-badge');
    if (this._data.windowLabel) {
      windowBadge.textContent = this._data.windowLabel;
      windowBadge.classList.remove('hidden');
    } else {
      windowBadge.classList.add('hidden');
    }
  }

  _emitSelect(e, forceToggle = false) {
    if (!this._data) return;
    this.dispatchEvent(new CustomEvent('select-item', {
      bubbles: true,
      detail: {
        data: this._data,
        shiftKey: e.shiftKey,
        ctrlKey: forceToggle || e.ctrlKey || e.metaKey,
      },
    }));
  }

  _handleClick() {
    if (!this._data) return;
    this.dispatchEvent(new CustomEvent('navigate', {
      bubbles: true,
      detail: {
        tabId: this._data.tabId || null,
        url: this._data.url,
        bookmarkId: this._data.id || null,
      },
    }));
  }

  _handleClose() {
    if (!this._data || !this._data.tabId) return;
    this.dispatchEvent(new CustomEvent('close-tab', {
      bubbles: true,
      detail: { tabId: this._data.tabId },
    }));
  }
}

customElements.define('bookmark-item', BookmarkItem);
