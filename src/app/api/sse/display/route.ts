import { subscribeDisplay, unsubscribeDisplay } from '@/lib/sse-broker';
import { recoverPendingDisplayEvents } from '@/lib/display-recovery';

export async function GET() {
    const clientId = crypto.randomUUID();

    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            const { events, markDelivered } = await recoverPendingDisplayEvents();

            for (const event of events) {
                const payload = JSON.stringify({
                    type: 'DISPLAY_CALL',
                    eventId: event.eventId,
                    ticketNumber: event.ticketNumber,
                    pos: event.pos,
                    customerName: event.customerName,
                    ...(event.nextTicketNumber ? { nextTicketNumber: event.nextTicketNumber } : {}),
                });
                controller.enqueue(encoder.encode('data: ' + payload + '\n\n'));
            }

            await markDelivered();
            subscribeDisplay(clientId, controller);
            controller.enqueue(encoder.encode(':ok\n\n'));
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
