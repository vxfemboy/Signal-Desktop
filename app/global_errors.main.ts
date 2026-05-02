// Copyright 2018 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { WebContents } from 'electron';
import { app, dialog, clipboard } from 'electron';
import os from 'node:os';

import * as Errors from '../ts/types/errors.std.ts';
import { drop } from '../ts/util/drop.std.ts';
import { redactAll } from '../ts/util/privacy.node.ts';
import { createLogger } from '../ts/logging/log.std.ts';
import { reallyJsonStringify } from '../ts/util/reallyJsonStringify.std.ts';
import type { LocaleType } from './locale.node.ts';

const log = createLogger('global_errors');

// We use hard-coded strings until we're able to update these strings from the locale.
let quitText = 'Quit';
let copyErrorAndQuitText = 'Copy error and quit';

// Registered by main.main.ts to reload the renderer after a recoverable crash.
// Receives the crashed webContents so the handler can ignore non-main windows.
// Returns true if it handled (restarted) the crash, false to fall through to
// the fatal-error path.
let rendererRestartHandler:
  | ((webContents: WebContents) => Promise<boolean>)
  | undefined;

export function registerRendererRestartHandler(
  fn: (webContents: WebContents) => Promise<boolean>
): void {
  rendererRestartHandler = fn;
}

function handleError(prefix: string, error: Error): void {
  const formattedError = Errors.toLogFormat(error);
  // oxlint-disable-next-line no-console
  console.error(`${prefix}:`, formattedError);
  log.error(`${prefix}:`, formattedError);

  if (app.isReady()) {
    // title field is not shown on macOS, so we don't use it
    const buttonIndex = dialog.showMessageBoxSync({
      buttons: [quitText, copyErrorAndQuitText],
      defaultId: 0,
      detail: redactAll(formattedError),
      message: prefix,
      noLink: true,
      type: 'error',
    });

    if (buttonIndex === 1) {
      clipboard.writeText(
        `${prefix}\n\n${redactAll(formattedError)}\n\n` +
          `App Version: ${app.getVersion()}\n` +
          `OS: ${os.platform()}`
      );
    }
  } else {
    dialog.showErrorBox(prefix, formattedError);
  }

  app.exit(1);
}

export const updateLocale = (locale: LocaleType): void => {
  quitText = locale.i18n('icu:quit');
  copyErrorAndQuitText = locale.i18n('icu:copyErrorAndQuit');
};

function _getError(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }

  const errorString = reallyJsonStringify(reason);
  return new Error(`Promise rejected with a non-error: ${errorString}`);
}

export const addHandler = (): void => {
  app.on('render-process-gone', (_event, webContents, details) => {
    const { reason, exitCode } = details;

    if (reason === 'clean-exit') {
      return;
    }

    // For a killed (hung) renderer, attempt to reload it automatically rather
    // than terminating the whole app.  A crashed renderer (SIGSEGV etc.) has
    // an unrecoverable native failure, so we still exit in that case.
    if (reason === 'killed' && rendererRestartHandler) {
      log.warn(
        `render-process-gone: renderer was killed (Exit Code: ${exitCode}), attempting auto-restart`
      );
      drop(
        (async () => {
          try {
            // The handler returns false when the crashed webContents isn't the
            // main window it knows how to restart; fall through to fatal in
            // that case.
            const handled = await rendererRestartHandler?.(webContents);
            if (!handled) {
              handleError(
                'Render process is gone',
                new Error(`Reason: ${reason}, Exit Code: ${exitCode}`)
              );
            }
          } catch (err) {
            log.error('render-process-gone: auto-restart failed', err);
            handleError(
              'Render process is gone (restart failed)',
              new Error(`Reason: ${reason}, Exit Code: ${exitCode}`)
            );
          }
        })()
      );
      return;
    }

    handleError(
      'Render process is gone',
      new Error(`Reason: ${reason}, Exit Code: ${exitCode}`)
    );
  });

  process.on('uncaughtException', (reason: unknown) => {
    handleError('Unhandled Error', _getError(reason));
  });

  process.on('unhandledRejection', (reason: unknown) => {
    handleError('Unhandled Promise Rejection', _getError(reason));
  });
};
