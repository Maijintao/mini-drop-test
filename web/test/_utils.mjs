#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function readFile(relPath) {
  return fs.readFile(path.join(rootDir, relPath), 'utf8');
}

export function compact(text) {
  return text.replace(/\s+/g, ' ');
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function mustContain(text, needle, label = needle) {
  assert(text.includes(needle), `missing ${label}`);
}

export function mustMatch(text, regex, label = regex.toString()) {
  assert(regex.test(text), `missing ${label}`);
}

export function report(name, detail = '') {
  console.log(`${name}${detail ? ` - ${detail}` : ''}`);
}
