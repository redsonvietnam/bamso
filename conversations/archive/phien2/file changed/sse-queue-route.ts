import { NextRequest } from 'next/server';
import { subscribeQueue, unsubscribeQueue } from '@/lib/sse-broker';
import { authenticateOptional } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const serviceId = searchParams.get('serviceId');
    const clientId = crypto.randomUUID();
    const session = await authenticateOptional();

    const stream = new ReadableStream({
        start(controller) {
            subscribeQueue(clientId, controller, serviceId, session?.role ?? null);
            controller.enqueue(new TextEncoder().encode(':ok\n\n'));
        },
        cancel() {
            unsubscribeQueue(clientId);
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
