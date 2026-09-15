import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@solidjs/testing-library';
import { DmMessageGroup, parseDmSystemContent } from '../../../src/components/dm/DmMessageGroup';
import { dmState, setDmState } from '../../../src/lib/dm/store';
import { resetForDmTests, stubFetch, flush } from '../../dm-helpers';
import type { DmMessage } from '../../../src/lib/dm/types';

const msg = (over: Partial<DmMessage>): DmMessage => ({
  id: 'm1',
  conversationId: 'c1',
  senderId: 'u-bob',
  content: 'hello',
  messageType: 'text',
  createdAt: '2025-01-01T10:00:00.000Z',
  ...over
});

describe('DmMessageGroup', () => {
  beforeEach(() => {
    cleanup();
    resetForDmTests();
  });

  it('renders author + time when it heads a group', () => {
    const { container } = render(() => (
      <DmMessageGroup message={msg({})} showAvatar senderName="Bob" myUserId="u-me" />
    ));
    expect(container.querySelector('.dm-msg-header')).toBeInTheDocument();
    expect(container.querySelector('.dm-msg-author')).toHaveTextContent('Bob');
    expect(container.querySelector('.dm-msg-time')).toBeInTheDocument();
    const avatar = container.querySelector('[data-testid="dm-avatar"]');
    expect(avatar).toBeInTheDocument();
  });

  it('omits author + avatar for continuation rows', () => {
    const { container } = render(() => (
      <DmMessageGroup message={msg({})} showAvatar={false} senderName="Bob" myUserId="u-me" />
    ));
    expect(container.querySelector('.dm-msg-cont')).toBeInTheDocument();
    expect(container.querySelector('.dm-msg-author')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="dm-avatar"]')).not.toBeInTheDocument();
  });

  it('marks own messages', () => {
    const { container } = render(() => (
      <DmMessageGroup message={msg({ senderId: 'u-me' })} showAvatar senderName="me" myUserId="u-me" />
    ));
    const row = container.querySelector('.dm-msg');
    expect(row).toHaveClass('dm-msg-own');
    expect(container.querySelector('.dm-msg-you')).not.toBeInTheDocument();
  });

  it('renders a gif message as an embedded image', () => {
    const { container } = render(() => (
      <DmMessageGroup
        message={msg({ messageType: 'gif', mediaUrl: 'https://media.tenor.com/foo.gif' })}
        showAvatar
        senderName="Bob"
        myUserId="u-me"
      />
    ));
    const img = container.querySelector('img.dm-msg-media');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://media.tenor.com/foo.gif');
  });

  it('renders plain text content with emoji-friendly rendering', () => {
    const { container } = render(() => (
      <DmMessageGroup message={msg({ content: 'hi there' })} showAvatar senderName="Bob" myUserId="u-me" />
    ));
    expect(container.querySelector('.dm-msg-content')).toHaveTextContent('hi there');
  });

  it('fires onAuthorClick for the avatar and the author name', () => {
    const clicks: string[] = [];
    const { container } = render(() => (
      <DmMessageGroup
        message={msg({})}
        showAvatar
        senderName="Bob"
        myUserId="u-me"
        onAuthorClick={(senderId) => clicks.push(senderId)}
      />
    ));
    fireEvent.click(container.querySelector('.dm-msg-avatar-btn')!);
    fireEvent.click(container.querySelector('.dm-msg-author')!);
    expect(clicks).toEqual(['u-bob', 'u-bob']);
  });

  it('renders a video message as an embedded <video>', () => {
    const { container } = render(() => (
      <DmMessageGroup
        message={msg({ messageType: 'video', mediaUrl: 'https://example.com/clip.mp4' })}
        showAvatar
        senderName="Bob"
        myUserId="u-me"
      />
    ));
    const video = container.querySelector('video.dm-msg-media');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('src', 'https://example.com/clip.mp4');
  });

  it('marks a media message as favorited when it matches a saved favorite', () => {
    setDmState('gifFavorites', [
      { id: 'https://media.tenor.com/foo.gif', url: 'https://media.tenor.com/foo.gif', preview: 'https://media.tenor.com/foo.gif', width: 480, height: 270, title: null }
    ]);
    const { container } = render(() => (
      <DmMessageGroup
        message={msg({ messageType: 'gif', mediaUrl: 'https://media.tenor.com/foo.gif' })}
        showAvatar
        senderName="Bob"
        myUserId="u-me"
      />
    ));
    expect(container.querySelector('.dm-msg-fav-btn')).toHaveClass('favorited');
  });

  it('renders reaction pills and marks the user own reaction', () => {
    const { container } = render(() => (
      <DmMessageGroup
        message={msg({ reactions: [{ emoji: '👍', count: 2, userIds: ['u-bob', 'u-me'] }] })}
        showAvatar
        senderName="Bob"
        myUserId="u-me"
      />
    ));
    const pill = container.querySelector('.dm-reaction-btn')!;
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveClass('mine');
    expect(pill.querySelector('.dm-reaction-count')).toHaveTextContent('2');
  });

  it('toggles an existing reaction off (POST) and keeps the store authoritative', async () => {
    setDmState('activeConversationId', 'c1');
    const message = msg({ reactions: [{ emoji: '👍', count: 2, userIds: ['u-bob', 'u-me'] }] });
    setDmState('messages', 'c1', [message]);
    let posted: any = null;
    const restore = stubFetch({
      '/api/dm/reactions': (url, init) => {
        posted = JSON.parse(String(init.body));
        return {
          body: {
            success: true,
            messageId: 'm1',
            emoji: '👍',
            action: 'remove',
            reactions: [{ emoji: '👍', count: 1, userIds: ['u-bob'] }]
          }
        };
      }
    });
    const { container } = render(() => (
      <DmMessageGroup message={message} showAvatar senderName="Bob" myUserId="u-me" />
    ));
    fireEvent.click(container.querySelector('.dm-reaction-btn')!);
    await flush();
    expect(posted).toEqual({ messageId: 'm1', emoji: '👍' });
    expect(dmState.messages.c1?.[0]?.reactions?.[0]).toMatchObject({ count: 1, userIds: ['u-bob'] });
    restore();
  });

  it('opens the quick-reaction menu from the + button and adds a reaction', async () => {
    setDmState('activeConversationId', 'c1');
    const message = msg({});
    setDmState('messages', 'c1', [message]);
    let posted: any = null;
    const restore = stubFetch({
      '/api/dm/reactions': (url, init) => {
        posted = JSON.parse(String(init.body));
        return {
          body: {
            success: true,
            messageId: 'm1',
            emoji: '❤️',
            action: 'add',
            reactions: [{ emoji: '❤️', count: 1, userIds: ['u-me'] }]
          }
        };
      }
    });
    const { container } = render(() => (
      <DmMessageGroup message={message} showAvatar senderName="Bob" myUserId="u-me" />
    ));
    fireEvent.click(container.querySelector('[data-testid="dm-reaction-add"]')!);
    expect(container.querySelector('[data-testid="dm-reaction-quick"]')).toBeInTheDocument();
    const button = Array.from(container.querySelectorAll('[data-testid^="dm-reaction-menu-"]'))
      .find((el) => el.getAttribute('aria-label') === '❤️') as HTMLElement;
    fireEvent.click(button);
    await flush();
    expect(posted).toEqual({ messageId: 'm1', emoji: '❤️' });
    expect(dmState.messages.c1?.[0]?.reactions?.[0]).toMatchObject({ emoji: '❤️', count: 1 });
    restore();
  });

  it('expands the quick-reaction menu into the full emoji picker', async () => {
    setDmState('activeConversationId', 'c1');
    const message = msg({});
    setDmState('messages', 'c1', [message]);
    let posted: any = null;
    const restore = stubFetch({
      '/api/dm/reactions': (url, init) => {
        posted = JSON.parse(String(init.body));
        return {
          body: {
            success: true,
            messageId: 'm1',
            emoji: '😀',
            action: 'add',
            reactions: [{ emoji: '😀', count: 1, userIds: ['u-me'] }]
          }
        };
      }
    });
    const { container } = render(() => (
      <DmMessageGroup message={message} showAvatar senderName="Bob" myUserId="u-me" />
    ));
    fireEvent.click(container.querySelector('[data-testid="dm-reaction-add"]')!);
    fireEvent.click(container.querySelector('[data-testid="dm-reaction-quick-more"]')!);
    expect(container.querySelector('[data-testid="dm-emoji-picker"]')).toBeInTheDocument();
    const item = container.querySelector('[aria-label="😀"]');
    expect(item).not.toBeNull();
    fireEvent.click(item!);
    await flush();
    expect(posted).toEqual({ messageId: 'm1', emoji: '😀' });
    expect(container.querySelector('[data-testid="dm-emoji-picker"]')).not.toBeInTheDocument();
    restore();
  });

  it('renders system messages centered with an icon, no avatar or reactions', () => {
    const { container } = render(() => (
      <DmMessageGroup
        message={msg({ messageType: 'system', content: '{"kind":"call-missed","callType":"voice"}' })}
        showAvatar
        senderName="Bob"
        myUserId="u-me"
      />
    ));
    expect(container.querySelector('[data-testid="dm-message-system"]')).toBeInTheDocument();
    expect(container.querySelector('.dm-system-text')).toHaveTextContent('Missed call');
    expect(container.querySelector('.dm-system-icon.missed')).toBeInTheDocument();
    expect(container.querySelector('.dm-msg-avatar')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="dm-reactions-row"]')).not.toBeInTheDocument();
  });

  it('parseDmSystemContent handles a JSON payload and falls back to plain-kind text', () => {
    expect(parseDmSystemContent('{"kind":"call-started","callType":"video"}')).toEqual({ kind: 'call-started', callType: 'video' });
    expect(parseDmSystemContent('call-started')).toEqual({ kind: 'call-started' });
    expect(parseDmSystemContent('')).toEqual({ kind: '' });
  });
});