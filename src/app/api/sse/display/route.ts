import { subscribeDisplay, unsubscribeDisplay } from '@/lib/sse-broker';
import { recoverPendingDisplayEvents } from '@/lib/display-recovery';

export async function GET() {
    const clientId = crypto.randomUUID();

    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();

            // CORE-06 recovery: recover all PENDING display call events from
            // today before subscribing for live events. This handles:
            // - process crash after CALL-NEXT commit but before transport
            // - display disconnect while event was created
            // - server restart with undelivered events
            //
            // Uses the shared production recovery function (display-recovery.ts).
            const { events, markDelivered } = await recoverPendingDisplayEvents();

            for (const event of events) {
                const payload = JSON.stringify({
                    type: 'DISPLAY_CALL',
                    eventId: event.eventId,
                    ticketNumber: event.ticketNumber,
                    pos: event.pos,
                    customerName: event.customerName || null,
                    ...(event.nextTicketNumber && { nextTicketNumber: event.nextTicketNumber }),
                });
                controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
            }

            // Mark events as DELIVERED after sending them.
            // If process crashes before this, events stay PENDING and will be
            // re-sent on next reconnect (at-least-once delivery).
            await markDelivered();

            // Subscribe for live events after recovery events are sent.
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
