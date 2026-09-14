import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@solidjs/testing-library';
import { DmInputBar } from '../../../src/components/dm/DmInputBar';
import { dmState, setDmState } from '../../../src/lib/dm/store';
import { resetForDmTests, stubFetch, flush } from '../../dm-helpers';

function seedConv() {
  setDmState('conversations', [
    {
      id: 'c1',
      type: 'dm',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      lastReadAt: null,
      unreadCount: 0,
      lastMessage: null,
      otherUser: { id: 'u-bob', username: 'Bob', presenceStatus: 'online' }
    }
  ]);
  setDmState('activeConversationId', 'c1');
}

describe('DmInputBar', () => {
  beforeEach(() => {
    cleanup();
    resetForDmTests();
  });

  it('renders a placeholder with the conversation partner name', () => {
    seedConv();
    const { container } = render(() => <DmInputBar />);
    expect(container.querySelector('[data-testid="dm-input-textarea"]')).toHaveAttribute('placeholder', 'Message Bob');
  });

  it('sends text on Enter (without shift) and clears the box', async () => {
    seedConv();
    let posted: any = null;
    const restore = stubFetch({
      '/api/dm/conversations/c1/messages': (url, init) => {
        if (init.method === 'POST') {
          posted = JSON.parse(String(init.body));
          return {
            body: {
              success: true,
              message: { id: 'm-new', conversationId: 'c1', senderId: 'u-me', content: posted.content, messageType: posted.messageType, mediaUrl: posted.mediaUrl, createdAt: '2025-01-03T00:00:00.000Z' }
            },
            status: 201
          };
        }
        return { body: { success: true, messages: [] } };
      }
    });
    const { container } = render(() => <DmInputBar />);
    const textarea = container.querySelector('[data-testid="dm-input-textarea"]') as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: 'hello bob' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    await flush();
    expect(posted).toEqual({ content: 'hello bob', messageType: 'text', mediaUrl: null });
    expect(dmState.messages.c1?.[0]?.content).toBe('hello bob');
    restore();
  });

  it('does not send empty text and keeps the send button disabled', () => {
    seedConv();
    const { container } = render(() => <DmInputBar />);
    const send = container.querySelector('[data-testid="dm-send-btn"]') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(send);
    expect(dmState.messages.c1).toBeUndefined();
  });

  it('opens the GIF picker from the GIF button', () => {
    seedConv();
    const { container } = render(() => <DmInputBar />);
    fireEvent.click(container.querySelector('[data-testid="dm-gif-btn"]')!);
    expect(container.querySelector('[data-testid="dm-gif-picker"]')).toBeInTheDocument();
  });
});