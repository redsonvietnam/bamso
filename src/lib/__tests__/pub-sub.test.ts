import { describe, it, expect, vi } from 'vitest';
import { pubSub } from '@/lib/pub-sub';

describe('pubSub (in-memory)', () => {
  it('delivers message to subscribers', async () => {
    const cb = vi.fn();
    await pubSub.subscribe('QUEUE_UPDATE', cb);
    await pubSub.publish('QUEUE_UPDATE', 'test message');
    expect(cb).toHaveBeenCalledWith('QUEUE_UPDATE', 'test message');
  });

  it('does not deliver to different channel', async () => {
    const cb = vi.fn();
    await pubSub.subscribe('QUEUE_UPDATE', cb);
    await pubSub.publish('DISPLAY_CALL', 'other message');
    expect(cb).not.toHaveBeenCalled();
  });

  it('stops delivering after unsubscribe', async () => {
    const cb = vi.fn();
    const handler: (channel: string, message: string) => void = (ch, msg) => cb(ch, msg);
    await pubSub.subscribe('QUEUE_UPDATE', handler);
    pubSub.unsubscribe('QUEUE_UPDATE', handler);
    await pubSub.publish('QUEUE_UPDATE', 'test');
    expect(cb).not.toHaveBeenCalled();
  });
});
