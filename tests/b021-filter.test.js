/**
 * b021-filter.test.js — B-021 Inline side-panel filter with debounce & highlight
 *
 * sidepanel.js is a browser-only module (DOM side-effects on load; no exports).
 * buildHighlightedText and applyFilter cannot be imported directly.
 *
 * Strategy: reproduce buildHighlightedText verbatim (pure string logic) with a
 * minimal DOM shim (document.createDocumentFragment, document.createElement,
 * document.createTextNode) to validate the highlighting algorithm.
 *
 * Each reproduction is tied back to sidepanel.js so future refactors are obvious.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

/* =========================================================================
   Minimal DOM shim for buildHighlightedText
   ========================================================================= */

class TextNode {
  constructor(text) {
    this.nodeType = 3; // TEXT_NODE
    this.textContent = text;
  }
}

class Element {
  constructor(tag) {
    this.nodeType = 1; // ELEMENT_NODE
    this.tagName = tag.toUpperCase();
    this.textContent = '';
    this.childNodes = [];
  }
  appendChild(child) {
    this.childNodes.push(child);
    return child;
  }
}

class DocumentFragment {
  constructor() {
    this.nodeType = 11; // DOCUMENT_FRAGMENT_NODE
    this.childNodes = [];
  }
  appendChild(child) {
    this.childNodes.push(child);
    return child;
  }
}

/** Shim document for buildHighlightedText */
const document = {
  createDocumentFragment() { return new DocumentFragment(); },
  createElement(tag) { return new Element(tag); },
  createTextNode(text) { return new TextNode(text); },
};

/* =========================================================================
   Reproduced pure helper (verbatim from sidepanel/sidepanel.js lines 367-391)
   ========================================================================= */

function buildHighlightedText(text, query) {
  const frag = document.createDocumentFragment();
  if (!query) {
    frag.appendChild(document.createTextNode(text));
    return frag;
  }
  const lower = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let cursor = 0;
  while (cursor < text.length) {
    const idx = lower.indexOf(lowerQuery, cursor);
    if (idx === -1) {
      frag.appendChild(document.createTextNode(text.slice(cursor)));
      break;
    }
    if (idx > cursor) {
      frag.appendChild(document.createTextNode(text.slice(cursor, idx)));
    }
    const mark = document.createElement('mark');
    mark.textContent = text.slice(idx, idx + lowerQuery.length);
    frag.appendChild(mark);
    cursor = idx + lowerQuery.length;
  }
  return frag;
}

/* =========================================================================
   Helper: extract fragment info for assertions
   ========================================================================= */

function fragmentInfo(frag) {
  const nodes = [];
  for (const child of frag.childNodes) {
    if (child.nodeType === 3) {
      nodes.push({ type: 'text', text: child.textContent });
    } else if (child.nodeType === 1 && child.tagName === 'MARK') {
      nodes.push({ type: 'mark', text: child.textContent });
    }
  }
  return nodes;
}

/* =========================================================================
   Test: buildHighlightedText
   ========================================================================= */

test('B-021 T1: single match preserves original case in mark', () => {
  const frag = buildHighlightedText('Hello World', 'world');
  const nodes = fragmentInfo(frag);
  assert.equal(nodes.length, 2);
  assert.deepEqual(nodes[0], { type: 'text', text: 'Hello ' });
  assert.deepEqual(nodes[1], { type: 'mark', text: 'World' });
});

test('B-021 T2: multiple occurrences — both highlighted', () => {
  const frag = buildHighlightedText('foo foo', 'foo');
  const nodes = fragmentInfo(frag);
  assert.equal(nodes.length, 3);
  assert.deepEqual(nodes[0], { type: 'mark', text: 'foo' });
  assert.deepEqual(nodes[1], { type: 'text', text: ' ' });
  assert.deepEqual(nodes[2], { type: 'mark', text: 'foo' });
});

test('B-021 T3: empty query returns single text node, no marks', () => {
  const frag = buildHighlightedText('Hello', '');
  const nodes = fragmentInfo(frag);
  assert.equal(nodes.length, 1);
  assert.deepEqual(nodes[0], { type: 'text', text: 'Hello' });
});

test('B-021 T4: no match returns single text node, no marks', () => {
  const frag = buildHighlightedText('Hello', 'xyz');
  const nodes = fragmentInfo(frag);
  assert.equal(nodes.length, 1);
  assert.deepEqual(nodes[0], { type: 'text', text: 'Hello' });
});

test('B-021 T5: case-insensitive match preserves original case', () => {
  const frag = buildHighlightedText('Hello', 'hello');
  const nodes = fragmentInfo(frag);
  assert.equal(nodes.length, 1);
  assert.deepEqual(nodes[0], { type: 'mark', text: 'Hello' });
});

test('B-021 T6: empty text with query returns empty fragment, no crash', () => {
  const frag = buildHighlightedText('', 'foo');
  const nodes = fragmentInfo(frag);
  assert.equal(nodes.length, 0);
});

test('B-021 T7: query at start of text', () => {
  const frag = buildHighlightedText('Hello World', 'Hello');
  const nodes = fragmentInfo(frag);
  assert.equal(nodes.length, 2);
  assert.deepEqual(nodes[0], { type: 'mark', text: 'Hello' });
  assert.deepEqual(nodes[1], { type: 'text', text: ' World' });
});

test('B-021 T8: query in middle of text', () => {
  const frag = buildHighlightedText('say hello world', 'hello');
  const nodes = fragmentInfo(frag);
  assert.equal(nodes.length, 3);
  assert.deepEqual(nodes[0], { type: 'text', text: 'say ' });
  assert.deepEqual(nodes[1], { type: 'mark', text: 'hello' });
  assert.deepEqual(nodes[2], { type: 'text', text: ' world' });
});

test('B-021 T9: overlapping potential matches — greedy left-to-right', () => {
  // "aaa" in "aaaa" should match at index 0 ("aaa") then cursor=3, remaining "a" no match
  const frag = buildHighlightedText('aaaa', 'aaa');
  const nodes = fragmentInfo(frag);
  assert.equal(nodes.length, 2);
  assert.deepEqual(nodes[0], { type: 'mark', text: 'aaa' });
  assert.deepEqual(nodes[1], { type: 'text', text: 'a' });
});

test('B-021 T10: mark slice uses lowerQuery.length (M-3 fix validation)', () => {
  // If the code incorrectly used query.length instead of lowerQuery.length,
  // the mark text would still be correct length since they're the same.
  // But confirm the mark is exactly the right number of characters.
  const frag = buildHighlightedText('AbCdEf', 'bcd');
  const nodes = fragmentInfo(frag);
  assert.equal(nodes.length, 3);
  assert.deepEqual(nodes[0], { type: 'text', text: 'A' });
  assert.deepEqual(nodes[1], { type: 'mark', text: 'bCd' });
  assert.deepEqual(nodes[2], { type: 'text', text: 'Ef' });
  // Confirm the mark text length equals the query length
  assert.equal(nodes[1].text.length, 3);
});
