/**
 * Shared setup: installs the chrome mock before any storage module loads.
 * Every test file imports this FIRST, before importing from background/.
 */
import './chrome-mock.js';
