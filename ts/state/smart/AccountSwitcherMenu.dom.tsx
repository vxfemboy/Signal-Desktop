// Copyright 2024 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { getIntl } from '../selectors/user.std.ts';
import { getMe } from '../selectors/conversations.dom.ts';
import {
  AccountSwitcherMenu,
  type AccountInfo,
} from '../../components/AccountSwitcherMenu.dom.tsx';
import { AxoDropdownMenu } from '../../axo/AxoDropdownMenu.dom.tsx';

export function SmartAccountSwitcherMenu(): React.JSX.Element {
  const i18n = useSelector(getIntl);
  const me = useSelector(getMe);
  const [rawAccounts, setRawAccounts] = useState<ReadonlyArray<AccountInfo>>(
    []
  );

  const loadAccounts = useCallback(async () => {
    const list = await window.IPC.getAccountsList();
    setRawAccounts(list);
  }, []);

  useEffect(() => {
    void loadAccounts();
    window.addEventListener('focus', loadAccounts);
    return () => {
      window.removeEventListener('focus', loadAccounts);
    };
  }, [loadAccounts]);

  // Persist the current profile name and color to the registry so other
  // sessions can display them, then reload the list.
  const lastSyncedTitle = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (me.title && me.title !== lastSyncedTitle.current) {
      lastSyncedTitle.current = me.title;
      window.IPC.updateAccountProfile(me.title, me.color ?? undefined);
      void loadAccounts();
    }
  }, [me.title, me.color, loadAccounts]);

  // Cache the current account's avatar so the switcher can show it when this
  // account is not active (i.e. when viewed from another account's window).
  const lastSyncedAvatarUrl = useRef<string | undefined>(undefined);
  useEffect(() => {
    const { avatarUrl } = me;
    if (!avatarUrl || avatarUrl === lastSyncedAvatarUrl.current) {
      return;
    }
    lastSyncedAvatarUrl.current = avatarUrl;
    void (async () => {
      try {
        const response = await fetch(avatarUrl);
        if (!response.ok) return;
        const buffer = new Uint8Array(await response.arrayBuffer());
        await window.IPC.cacheAccountAvatar(buffer);
        void loadAccounts();
      } catch {
        // Non-fatal — avatar just won't show for this account when inactive
      }
    })();
  }, [me.avatarUrl, loadAccounts]);

  // For the current account, use live Redux values as immediate overrides
  // (the registry update above is async and may lag by one render).
  const accounts = rawAccounts.map(account =>
    account.isCurrent && me.title
      ? {
          ...account,
          displayName: me.title,
          avatarUrl: me.avatarUrl ?? undefined,
          color: me.color ?? undefined,
        }
      : account
  );

  return (
    <AxoDropdownMenu.Root>
      <AxoDropdownMenu.Trigger>
        <button
          type="button"
          className="NavTabs__Item NavTabs__Item--AccountSwitcher"
          aria-label={i18n('icu:multiAccount__accountSwitcher')}
        >
          <span className="NavTabs__ItemButton">
            <span className="NavTabs__ItemContent">
              <span className="NavTabs__ItemIcon NavTabs__ItemIcon--AccountSwitcher" />
            </span>
          </span>
        </button>
      </AxoDropdownMenu.Trigger>
      <AxoDropdownMenu.Content>
        <AccountSwitcherMenu
          accounts={accounts}
          i18n={i18n}
          onSwitch={id => window.IPC.switchToAccount(id)}
          onAdd={() => window.IPC.addAccount()}
          onRemove={id => window.IPC.removeAccount(id)}
        />
      </AxoDropdownMenu.Content>
    </AxoDropdownMenu.Root>
  );
}
