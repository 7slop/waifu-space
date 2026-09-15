import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { DmMessageList } from '../../../src/components/dm/DmMessageList';
import { dmState, setDmState } from '../../../src/lib/dm/store';
import { resetForDmTests } from '../../dm-helpers';
import type { DmMessage } from '../../../src/lib/dm/types';

const mk = (id: string, senderId: string, createdAt: string, content = 'hi'): DmMessage => ({
  id,
  conversationId: 'c1',
  senderId,
  content,
  messageType: 'text',
  createdAt
});

function seed(messages: DmMessage[]) {
  setDmState('conversations', [
    {
      id: 'c1',
      type: 'dm',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: '2025-01-02T00:00:00.000Z',
      lastReadAt: null,
      unreadCount: 0,
      lastMessage: null,
      otherUser: { id: 'u-bob', username: 'Bob', presenceStatus: 'online' }
    }
  ]);
  setDmState('activeConversationId', 'c1');
  setDmState('messages', { ...dmState.messages, c1: messages });
}

describe('DmMessageList', () => {
  beforeEach(() => {
    cleanup();
    resetForDmTests();
  });

  it('shows an empty-state message when there are no messages', () => {
    seed([]);
    const { container } = render(() => <DmMessageList />);
    expect(container.querySelector('.dm-no-messages')).toBeInTheDocument();
  });

  it('renders a day divider between different days', () => {
    seed([
      mk('m1', 'u-bob', '2025-01-01T10:00:00.000Z'),
      mk('m2', 'u-bob', '2025-01-02T10:00:00.000Z')
    ]);
    const { container } = render(() => <DmMessageList />);
    expect(container.querySelectorAll('[data-testid="dm-day-divider"]').length).toBeGreaterThanOrEqual(2);
  });

  it('groups consecutive messages from the same author', () => {
    seed([
      mk('m1', 'u-bob', '2025-01-01T10:00:00.000Z'),
      mk('m2', 'u-bob', '2025-01-01T10:01:00.000Z'),
      mk('m3', 'u-me', '2025-01-01T10:02:00.000Z')
    ]);
    const { container } = render(() => <DmMessageList />);
    const headers = container.querySelectorAll('.dm-msg-header');
    // m1 (header), m2 (continuation), m3 (header) -> 2 full headers
    expect(headers.length).toBe(2);
    expect(container.querySelectorAll('.dm-msg-cont').length).toBe(1);
  });

  it('shows a single avatar for a run of media messages', () => {
    const media = (id: string, createdAt: string): DmMessage => ({
      ...mk(id, 'u-bob', createdAt),
      messageType: 'gif',
      mediaUrl: 'https://media.tenor.com/foo.gif'
    });
    seed([
      media('m1', '2025-01-01T10:00:00.000Z'),
      media('m2', '2025-01-01T10:01:00.000Z'),
      media('m3', '2025-01-01T10:02:00.000Z')
    ]);
    const { container } = render(() => <DmMessageList />);
    expect(container.querySelectorAll('[data-testid="dm-avatar"]').length).toBe(1);
    expect(container.querySelectorAll('.dm-msg-cont').length).toBe(2);
  });

  it('renders a load-older button while more history exists', () => {
    seed([mk('m1', 'u-bob', '2025-01-01T10:00:00.000Z')]);
    setDmState('hasOlder', 'c1', true);
    const { container } = render(() => <DmMessageList />);
    expect(container.querySelector('[data-testid="dm-load-older"]')).toBeInTheDocument();
  });
});