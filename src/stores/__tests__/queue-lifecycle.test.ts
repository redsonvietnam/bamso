import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();

vi.mock("@/lib/api-client", () => ({
    apiClient: {
        get: (...args: unknown[]) => mockGet(...args),
    },
}));

type SSEHandler = (() => void) | null;
type SSEMessageHandler = ((event: { data: string }) => void) | null;

class MockEventSource {
    static instances: MockEventSource[] = [];
    url: string;
    onopen: SSEHandler = null;
    onmessage: SSEMessageHandler = null;
    onerror: SSEHandler = null;
    closed = false;

    constructor(url: string) {
        this.url = url;
        MockEventSource.instances.push(this);
    }

    close() {
        this.closed = true;
    }
}

function lastSource(): MockEventSource {
    const instances = MockEventSource.instances;
    const source = instances[instances.length - 1];
    if (!source) throw new Error("expected an EventSource instance");
    return source;
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const pendingTicket = (id: string) => ({ id, status: "PENDING" });

import { useQueueStore } from "@/stores/queue.store";
import { isCallNextDisabled } from "@/components/staff/QueuePanel";

beforeAll(() => {
    vi.stubGlobal("EventSource", MockEventSource);
});

afterAll(() => {
    vi.unstubAllGlobals();
});

beforeEach(() => {
    useQueueStore.getState().disconnectSSE();
    vi.clearAllMocks();
    MockEventSource.instances.length = 0;
});

describe("queue realtime lifecycle (WP-02B)", () => {
    it("exposes initial-loading synchronously while the REST load is pending", async () => {
        const gate = deferred<unknown[]>();
        mockGet.mockReturnValueOnce(gate.promise);

        const connecting = useQueueStore.getState().connectSSE("svc-1");

        expect(useQueueStore.getState().status).toBe("initial-loading");
        expect(useQueueStore.getState().tickets).toEqual([]);
        expect(useQueueStore.getState().isConnected).toBe(false);

        gate.resolve([]);
        await connecting;

        expect(useQueueStore.getState().status).toBe("connecting");
    });

    it("initial load success lands on connecting with tickets, before SSE opens", async () => {
        mockGet.mockResolvedValue([pendingTicket("t1"), pendingTicket("t2")]);

        await useQueueStore.getState().connectSSE("svc-1");

        const state = useQueueStore.getState();
        expect(state.tickets.map((t) => t.id)).toEqual(["t1", "t2"]);
        expect(state.status).toBe("connecting");
        expect(state.isConnected).toBe(false);
        expect(state.loadError).toBeNull();
        expect(MockEventSource.instances).toHaveLength(1);
    });

    it("initial load failure lands on load-error with a message, not an empty queue", async () => {
        mockGet.mockRejectedValue(new Error("boom"));

        await useQueueStore.getState().connectSSE("svc-1");

        const state = useQueueStore.getState();
        expect(state.status).toBe("load-error");
        expect(state.loadError).toBe("boom");
        expect(state.tickets).toEqual([]);
        expect(state.snapshot).toBeNull();
        expect(state.isConnected).toBe(false);
    });

    it("successful empty load is connecting, distinct from load-error", async () => {
        mockGet.mockResolvedValue([]);

        await useQueueStore.getState().connectSSE("svc-1");

        const state = useQueueStore.getState();
        expect(state.status).toBe("connecting");
        expect(state.loadError).toBeNull();
        expect(state.status).not.toBe("load-error");
    });

    it("transitions connecting to connected on SSE open", async () => {
        mockGet.mockResolvedValue([pendingTicket("t1")]);

        await useQueueStore.getState().connectSSE("svc-1");
        expect(useQueueStore.getState().status).toBe("connecting");

        lastSource().onopen?.();

        const state = useQueueStore.getState();
        expect(state.status).toBe("connected");
        expect(state.isConnected).toBe(true);
    });

    it("SSE loss after connect marks reconnecting and preserves tickets", async () => {
        mockGet.mockResolvedValue([pendingTicket("t1"), pendingTicket("t2")]);

        await useQueueStore.getState().connectSSE("svc-1");
        lastSource().onopen?.();
        expect(useQueueStore.getState().status).toBe("connected");

        lastSource().onerror?.();

        const state = useQueueStore.getState();
        expect(state.status).toBe("reconnecting");
        expect(state.isConnected).toBe(false);
        expect(state.tickets.map((t) => t.id)).toEqual(["t1", "t2"]);
        expect(state.snapshot).not.toBeNull();
    });

    it("SSE error before first connect lands on disconnected, never implying health", async () => {
        mockGet.mockResolvedValue([pendingTicket("t1")]);

        await useQueueStore.getState().connectSSE("svc-1");
        expect(useQueueStore.getState().status).toBe("connecting");

        lastSource().onerror?.();

        const state = useQueueStore.getState();
        expect(state.status).toBe("disconnected");
        expect(state.isConnected).toBe(false);
    });

    it("SSE error during load-error keeps the explicit failure state", async () => {
        mockGet.mockRejectedValue(new Error("boom"));

        await useQueueStore.getState().connectSSE("svc-1");
        expect(useQueueStore.getState().status).toBe("load-error");

        lastSource().onerror?.();

        expect(useQueueStore.getState().status).toBe("load-error");
        expect(useQueueStore.getState().isConnected).toBe(false);
    });

    it("queue actions stay available while SSE is down", async () => {
        mockGet.mockResolvedValue([pendingTicket("t1"), pendingTicket("t2")]);

        await useQueueStore.getState().connectSSE("svc-1");
        lastSource().onopen?.();
        lastSource().onerror?.();

        const state = useQueueStore.getState();
        expect(state.status).toBe("reconnecting");
        // REST-based actions are gated only by the in-flight request and
        // queue content — never by realtime connection status.
        expect(isCallNextDisabled(false, state.tickets.length)).toBe(false);
        expect(isCallNextDisabled(false, 0)).toBe(true);
        expect(isCallNextDisabled(true, state.tickets.length)).toBe(true);
    });

    it("ignores a stale REST response after a service switch (generation guard)", async () => {
        const first = deferred<unknown[]>();
        const second = deferred<unknown[]>();
        mockGet.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

        const stale = useQueueStore.getState().connectSSE("svc-a");
        const current = useQueueStore.getState().connectSSE("svc-b");

        second.resolve([pendingTicket("b1")]);
        await current;
        first.resolve([pendingTicket("a1")]);
        await stale;

        const state = useQueueStore.getState();
        expect(state.serviceId).toBe("svc-b");
        expect(state.tickets.map((t) => t.id)).toEqual(["b1"]);
        expect(MockEventSource.instances).toHaveLength(1);
        expect(MockEventSource.instances[0]?.url).toContain("svc-b");
    });

    it("disconnect resets to disconnected and clears queue state", async () => {
        mockGet.mockResolvedValue([pendingTicket("t1")]);

        await useQueueStore.getState().connectSSE("svc-1");
        lastSource().onopen?.();
        useQueueStore.getState().disconnectSSE();

        const state = useQueueStore.getState();
        expect(state.status).toBe("disconnected");
        expect(state.isConnected).toBe(false);
        expect(state.tickets).toEqual([]);
        expect(state.serviceId).toBeNull();
        expect(state.loadError).toBeNull();
    });
});
