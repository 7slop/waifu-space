import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@solidjs/testing-library';
import { DmUserProfilePanel } from '../../../src/components/dm/DmUserProfilePanel';
import { dmState, setDmState } from '../../../src/lib/dm/store';
import { resetForDmTests, stubFetch, flush } from '../../dm-helpers';

const profile = {
  id: 'u-bob',
  username: 'Bob',
  avatarUrl: 'https://img/bob.png',
  bio: 'Hello from Bob',
  createdAt: '2025-01-01T00:00:00.000Z',
  stats: { coins: 123, bondLevel: 5, defenseHighWave: 12, totalVictories: 8, goblinsDefeated: 42 },
  waifu: { name: 'Akari', personality: 'tsundere', appearance: {} }
};

describe('DmUserProfilePanel', () => {
  beforeEach(() => {
    cleanup();
    resetForDmTests();
  });

  it('loads and renders the profile over the API', async () => {
    const restore = stubFetch({
      '/api/dm/users/u-bob/profile': () => ({ body: { success: true, profile } })
    });
    const onClose = vi.fn();
    const { container } = render(() => <DmUserProfilePanel userId="u-bob" onClose={onClose} />);
    await waitFor(() => expect(container.querySelector('[data-testid="dm-profile-name"]')).toHaveTextContent('Bob'));
    expect(container.querySelector('[data-testid="dm-profile-bio"]')).toHaveTextContent('Hello from Bob');
    expect(container.textContent).toContain('123');
    expect(container.textContent).toContain('5');
    restore();
  });

  it('closes when the close button is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(() => <DmUserProfilePanel userId="u-bob" onClose={onClose} />);
    fireEvent.click(container.querySelector('[data-testid="dm-profile-close"]')!);
    expect(onClose).toHaveBeenCalled();
  });

  it('starts a conversation from the message button', async () => {
    const restore = stubFetch({
      '/api/dm/users/u-bob/profile': () => ({ body: { success: true, profile } }),
      '/api/dm/conversations/c9/messages': () => ({ body: { success: true, messages: [] } }),
      '/api/dm/conversations': (url, init) => {
        if (init.method === 'POST') {
          return {
            body: {
              success: true,
              conversation: { id: 'c9', type: 'dm', createdAt: '2025-01-03T00:00:00.000Z', updatedAt: '2025-01-03T00:00:00.000Z', lastReadAt: null, unreadCount: 0, lastMessage: null, otherUser: { id: 'u-bob', username: 'Bob', presenceStatus: 'online' } }
            }
          };
        }
        return { body: { success: true, conversations: [] } };
      }
    });
    const onClose = vi.fn();
    const { container } = render(() => <DmUserProfilePanel userId="u-bob" onClose={onClose} />);
    await waitFor(() => expect(container.querySelector('[data-testid="dm-profile-name"]')).toHaveTextContent('Bob'));
    fireEvent.click(container.querySelector('[data-testid="dm-profile-message"]')!);
    await flush();
    expect(dmState.activeConversationId).toBe('c9');
    expect(onClose).toHaveBeenCalled();
    restore();
  });
});