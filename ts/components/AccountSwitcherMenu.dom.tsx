// Copyright 2024 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import { DropdownMenu } from 'radix-ui';

import type { LocalizerType } from '../types/Util.std.ts';
import { AxoDropdownMenu } from '../axo/AxoDropdownMenu.dom.tsx';
import { AxoAvatar } from '../axo/AxoAvatar.dom.tsx';
import { AxoSymbol } from '../axo/AxoSymbol.dom.tsx';
import { AxoTokens } from '../axo/AxoTokens.std.ts';
import { tw } from '../axo/tw.dom.tsx';
import { getInitials } from '../util/getInitials.std.ts';

export type AccountInfo = Readonly<{
  id: string;
  displayName: string;
  /** AvatarColorType string — only set for the current account via live Redux. */
  color?: string;
  /** attachment:// URL — only valid for the currently active account. */
  avatarUrl?: string;
  isCurrent: boolean;
}>;

export type Props = Readonly<{
  accounts: ReadonlyArray<AccountInfo>;
  i18n: LocalizerType;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}>;

// Reuse the same item styles as AxoDropdownMenu.Item so this row blends in.
const accountItemStyles = tw(
  'col-span-full grid grid-cols-subgrid items-center truncate p-1.5',
  'curved-md type-body-medium',
  'outline-0 data-highlighted:bg-fill-secondary-pressed',
  'forced-colors:text-[CanvasText]',
  'forced-colors:data-highlighted:bg-[Highlight]',
  'forced-colors:data-highlighted:text-[HighlightText]',
  'forced-color-adjust-none'
);

function AccountAvatar({
  account,
}: {
  account: AccountInfo;
}): React.JSX.Element {
  const colorName =
    account.color != null &&
    AxoTokens.Avatar.getAllColorNames().includes(
      account.color as AxoTokens.Avatar.ColorName
    )
      ? (account.color as AxoTokens.Avatar.ColorName)
      : 'A200';

  const initials =
    getInitials(account.displayName) ?? account.displayName[0] ?? '?';

  return (
    <AxoAvatar.Root size={28}>
      <AxoAvatar.Content label={null}>
        {account.avatarUrl != null ? (
          <AxoAvatar.Image
            src={account.avatarUrl}
            srcWidth={256}
            srcHeight={256}
            blur={false}
            fallbackIcon="person"
            fallbackColor={colorName}
          />
        ) : (
          <AxoAvatar.Initials initials={initials} color={colorName} />
        )}
      </AxoAvatar.Content>
    </AxoAvatar.Root>
  );
}

export function AccountSwitcherMenu({
  accounts,
  i18n,
  onSwitch,
  onAdd,
  onRemove,
}: Props): React.JSX.Element {
  const currentAccount = accounts.find(a => a.isCurrent);
  const otherAccounts = accounts.filter(a => !a.isCurrent);

  return (
    <>
      <AxoDropdownMenu.Header label={i18n('icu:multiAccount__accounts')} />
      {accounts.length > 0 && <AxoDropdownMenu.Separator />}
      {otherAccounts.map(account => (
        // Use DropdownMenu.Item directly so we can control the full layout
        // (avatar + name + trailing remove button) without ItemText's truncate.
        <DropdownMenu.Item
          key={account.id}
          className={accountItemStyles}
          textValue={account.displayName}
          onSelect={() => onSwitch(account.id)}
        >
          {/* col 1: avatar */}
          <span className={tw('col-start-1 me-1.5')}>
            <AccountAvatar account={account} />
          </span>
          {/* col 2: name + trailing remove button */}
          <span className={tw('col-start-2 flex min-w-0 items-center gap-1.5')}>
            <span className={tw('flex-1 truncate text-start')}>
              {account.displayName}
            </span>
            <button
              type="button"
              aria-label={i18n('icu:multiAccount__removeAccount')}
              className={tw(
                'shrink-0 rounded-sm p-0.5 opacity-40',
                'hover:opacity-100 focus-visible:opacity-100',
                'hover:text-label-primary'
              )}
              onClick={e => {
                e.stopPropagation();
                e.preventDefault();
                onRemove(account.id);
              }}
            >
              <AxoSymbol.Icon size={14} symbol="minus-circle" label={null} />
            </button>
          </span>
        </DropdownMenu.Item>
      ))}
      {currentAccount && (
        <AxoDropdownMenu.CheckboxItem
          checked
          disabled
          onCheckedChange={() => undefined}
          onSelect={event => event.preventDefault()}
        >
          {currentAccount.displayName}
        </AxoDropdownMenu.CheckboxItem>
      )}
      <AxoDropdownMenu.Separator />
      <AxoDropdownMenu.Item symbol="plus" onSelect={onAdd}>
        {i18n('icu:multiAccount__addAccount')}
      </AxoDropdownMenu.Item>
    </>
  );
}
