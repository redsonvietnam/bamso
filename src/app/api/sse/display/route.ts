import { NextRequest } from 'next/server';
import { subscribeDisplay, unsubscribeDisplay } from '@/lib/sse-broker';

export async function GET(request: NextRequest) {
    const clientId = crypto.randomUUID();

    const stream = new ReadableStream({
        start(controller) {
            subscribeDisplay(clientId, controller);
            controller.enqueue(new TextEncoder().encode(':ok\n\n'));
        },
        cancel() {
            unsubscribeDisplay(clientId);
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
        },
    });
}

export const dynamic = 'force-dynamic';
