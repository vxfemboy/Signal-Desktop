// Copyright 2024 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Single-process multi-account registry.
 *
 * Stored at <userData>/multi-accounts.json.
 * Each account gets its own subdirectory at <userData>/accounts/<uuid>/
 * (or '' for the default migrated account that uses the global userData directly).
 *
 * Only one Signal process ever runs (uses the global single-instance lock).
 * Switching accounts closes the current SQL workers and reloads the renderer
 * in-place — no new windows, no new processes.
 */

import { join } from 'node:path';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
} from 'node:fs';
import { app } from 'electron';
import { v4 as generateGuid } from 'uuid';

export type AccountEntry = {
  /** Stable unique identifier for this account entry. */
  id: string;
  /**
   * Path to this account's data directory.
   * Empty string means use the global userData directory directly (migration).
   * Otherwise, this is an absolute path to <userData>/accounts/<uuid>/.
   */
  path: string;
  /**
   * Human-readable label shown in the account switcher.
   * Updated once registration/linking completes.
   */
  displayName: string;
  /** E.164 phone number, populated after registration/linking. */
  phoneNumber?: string;
  /** Avatar color name (AxoTokens.Avatar.ColorName), persisted for non-active display. */
  color?: string;
  /** Absolute path to a cached avatar image file for non-active display. */
  avatarPath?: string;
  /** Unix timestamp (ms) when this account was added to the registry. */
  addedAt: number;
  /** Whether this is the currently active account. */
  isActive: boolean;
};

function getRegistryPath(): string {
  return join(app.getPath('userData'), 'multi-accounts.json');
}

function readRegistry(): Array<AccountEntry> {
  const registryPath = getRegistryPath();
  if (!existsSync(registryPath)) {
    return [];
  }
  try {
    const raw = readFileSync(registryPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as Array<AccountEntry>;
  } catch {
    return [];
  }
}

function writeRegistry(accounts: Array<AccountEntry>): void {
  const registryPath = getRegistryPath();
  mkdirSync(join(registryPath, '..'), { recursive: true });
  // Write to a temp file then rename so a crash mid-write can never leave a
  // truncated/corrupt multi-accounts.json (rename is atomic on POSIX).
  const tmpPath = `${registryPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(accounts, null, 2), 'utf8');
  renameSync(tmpPath, registryPath);
}

/** Return all accounts sorted oldest-first. */
export function getAllAccounts(): Array<AccountEntry> {
  return readRegistry().sort((a, b) => a.addedAt - b.addedAt);
}

/** Get the currently active account entry. */
export function getActiveAccount(): AccountEntry | undefined {
  return readRegistry().find(a => a.isActive);
}

/** Get an account entry by id. */
export function getAccountById(id: string): AccountEntry | undefined {
  return readRegistry().find(a => a.id === id);
}

/**
 * Mark the given account as active, clearing isActive on all others.
 */
export function setActiveAccount(id: string): void {
  const accounts = readRegistry();
  for (const account of accounts) {
    account.isActive = account.id === id;
  }
  writeRegistry(accounts);
}

/** Update fields on an account entry (merges). */
export function updateAccount(
  id: string,
  fields: Partial<Omit<AccountEntry, 'id'>>
): void {
  const accounts = readRegistry();
  const existing = accounts.find(a => a.id === id);
  if (existing) {
    Object.assign(existing, fields);
    writeRegistry(accounts);
  }
}

/** Add a new account entry to the registry. */
export function addAccount(entry: AccountEntry): void {
  const accounts = readRegistry();
  accounts.push(entry);
  writeRegistry(accounts);
}

/** Remove an account entry by id. */
export function removeAccount(id: string): void {
  const accounts = readRegistry().filter(a => a.id !== id);
  writeRegistry(accounts);
}

/**
 * Ensure the default account is registered and return the active entry.
 *
 * On first run (no registry), creates a default entry with path=''
 * so the existing database at the global userData root is used directly.
 * This is zero-migration for existing installs.
 */
export function ensureDefaultAccountRegistered(): AccountEntry {
  const existing = getActiveAccount();
  if (existing != null) {
    return existing;
  }

  const accounts = readRegistry();

  // If there are accounts but none is marked active, activate the first.
  const first = accounts[0];
  if (first) {
    first.isActive = true;
    writeRegistry(accounts);
    return first;
  }

  // No accounts at all — create the default entry (migration).
  const entry: AccountEntry = {
    id: generateGuid(),
    path: '', // '' = use global userData directly
    displayName: 'Signal Account',
    addedAt: Date.now(),
    isActive: true,
  };
  writeRegistry([entry]);
  return entry;
}

/**
 * After linking/registration completes, update the account with the phone
 * number and display name. If accountId is provided, updates that specific
 * account; otherwise falls back to the currently active account.
 */
export function notifyActiveAccountRegistered(
  phoneNumber: string,
  accountId?: string
): void {
  const account = accountId ? getAccountById(accountId) : getActiveAccount();
  if (account == null) {
    return;
  }
  updateAccount(account.id, {
    phoneNumber,
    displayName: phoneNumber,
  });
}
