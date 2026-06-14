import { isRedisAvailable, getRedisSubscriber, publish as redisPublish } from '@/lib/redis-client';

type MessageHandler = (channel: string, message: string) => void;

const CHANNELS = {
  QUEUE_UPDATE: 'queue:updates',
  DISPLAY_CALL: 'display:calls',
} as const;

class PubSub {
  private handlers = new Map<string, Set<MessageHandler>>();
  private redisSubscribed = false;

  async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
    }
    this.handlers.get(channel)!.add(handler);

    if (isRedisAvailable() && !this.redisSubscribed) {
      try {
        const sub = getRedisSubscriber();
        sub.on('message', (ch: string, msg: string) => {
          const handlers = this.handlers.get(ch);
          if (handlers) {
            handlers.forEach((h) => h(ch, msg));
          }
        });

        for (const c of Object.values(CHANNELS)) {
          await sub.subscribe(c);
        }
        this.redisSubscribed = true;
      } catch {
        // Redis unavailable — in-memory only
      }
    }
  }

  unsubscribe(channel: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(channel);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(channel);
      }
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    // Local in-memory delivery
    const handlers = this.handlers.get(channel);
    if (handlers) {
      handlers.forEach((h) => h(channel, message));
    }

    // Cross-instance delivery via Redis
    await redisPublish(channel, message);
  }
}

export const pubSub = new PubSub();
export { CHANNELS };
