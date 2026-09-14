import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { DmMessageGroup } from '../../../src/components/dm/DmMessageGroup';
import { resetForDmTests } from '../../dm-helpers';
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
    expect(container.querySelector('.dm-msg-you')).toHaveTextContent('(You)');
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
});