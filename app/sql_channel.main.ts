// Copyright 2018 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { ipcMain } from 'electron';

import type { MainSQL } from '../ts/sql/main.main.ts';
import { remove as removeUserConfig } from './user_config.main.ts';
import { remove as removeEphemeralConfig } from './ephemeral_config.main.ts';

type SQLInstance = Pick<
  MainSQL,
  | 'sqlReadSerialized'
  | 'sqlWriteSerialized'
  | 'pauseWriteAccess'
  | 'resumeWriteAccess'
  | 'removeDB'
>;

/**
 * Maps webContents ID → the SQL instance for that account window.
 * Populated by registerWindow(), cleared by unregisterWindow().
 */
const windowSqlMap = new Map<number, SQLInstance>();

let initialized = false;

// Resolves the per-window key-erase action. Supplied by the main process so the
// erase targets the requesting window's account rather than always wiping the
// global config (which holds the default account's key material).
let eraseKeyForWindow: ((webContentsId: number) => void) | undefined;

const SQL_READ_KEY = 'sql-channel:read';
const SQL_WRITE_KEY = 'sql-channel:write';
const SQL_REMOVE_DB_KEY = 'sql-channel:remove-db';
const ERASE_SQL_KEY = 'erase-sql-key';
const PAUSE_WRITE_ACCESS = 'pause-sql-writes';
const RESUME_WRITE_ACCESS = 'resume-sql-writes';

function wrapResult<Params extends Array<unknown>, T>(
  fn: (...params: Params) => Promise<T>
): (
  ...params: Params
) => Promise<{ ok: true; value: T } | { ok: false; error: Error }> {
  return async function wrappedIpcSqlMethod(...params) {
    try {
      return {
        ok: true,
        value: await fn(...params),
      };
    } catch (error) {
      return {
        ok: false,
        error,
      };
    }
  };
}

/** Register a SQL instance for a specific account window. */
export function registerWindow(webContentsId: number, sql: SQLInstance): void {
  windowSqlMap.set(webContentsId, sql);
}

/** Remove the SQL registration when a window is destroyed. */
export function unregisterWindow(webContentsId: number): void {
  windowSqlMap.delete(webContentsId);
}

function getSQLForWindow(webContentsId: number, channel: string): SQLInstance {
  const sql = windowSqlMap.get(webContentsId);
  if (!sql) {
    throw new Error(
      `${channel}: No SQL instance for webContents ${webContentsId}`
    );
  }
  return sql;
}

/** Register IPC handlers once. Handlers route by event.sender.id. */
export function initialize(options?: {
  eraseKeyForWindow?: (webContentsId: number) => void;
}): void {
  if (initialized) {
    throw new Error('sqlChannels: already initialized!');
  }
  initialized = true;
  eraseKeyForWindow = options?.eraseKeyForWindow;

  ipcMain.handle(
    SQL_READ_KEY,
    wrapResult(function ipcSqlReadHandler(event, callName, serialized) {
      const sql = getSQLForWindow(event.sender.id, SQL_READ_KEY);
      return sql.sqlReadSerialized(callName, serialized);
    })
  );

  ipcMain.handle(
    SQL_WRITE_KEY,
    wrapResult(function ipcSqlWriteHandler(event, callName, serialized) {
      const sql = getSQLForWindow(event.sender.id, SQL_WRITE_KEY);
      return sql.sqlWriteSerialized(callName, serialized);
    })
  );

  ipcMain.handle(SQL_REMOVE_DB_KEY, event => {
    const sql = getSQLForWindow(event.sender.id, SQL_REMOVE_DB_KEY);
    return sql.removeDB();
  });

  ipcMain.handle(ERASE_SQL_KEY, event => {
    // Erase only the requesting window's account key. The injected resolver
    // handles per-account directories; fall back to the global config only when
    // no resolver is registered (single-account / legacy path).
    if (eraseKeyForWindow) {
      eraseKeyForWindow(event.sender.id);
      return;
    }
    removeUserConfig();
    removeEphemeralConfig();
  });

  ipcMain.handle(PAUSE_WRITE_ACCESS, event => {
    const sql = getSQLForWindow(event.sender.id, PAUSE_WRITE_ACCESS);
    return sql.pauseWriteAccess();
  });

  ipcMain.handle(RESUME_WRITE_ACCESS, event => {
    const sql = getSQLForWindow(event.sender.id, RESUME_WRITE_ACCESS);
    return sql.resumeWriteAccess();
  });
}
