import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThankYouOverlay from '@/components/customer/ThankYouOverlay';

describe('ThankYouOverlay — C3 non-blocking completion feedback', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  let container: HTMLDivElement;
  let root: Root;

  const renderOverlay = (supersedeKey: string | null = null) => {
    act(() => {
      root.render(
        <div data-testid="underlying-board">
          <div>Thông tin hàng chờ</div>
          <ThankYouOverlay
            ticketNumber="A12"
            serviceName="Cấp giấy tờ"
            servicePrefix="A"
            serviceColor="#123456"
            message="Cảm ơn bạn đã sử dụng dịch vụ"
            supersedeKey={supersedeKey}
            onDismiss={vi.fn()}
          />
        </div>
      );
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('renders as a non-blocking status card while underlying board content remains present', () => {
    renderOverlay();

    expect(container.querySelector('[data-testid="underlying-board"]')).toBeTruthy();
    const status = container.querySelector('[role="status"]');
    expect(status).toBeTruthy();
    expect(status?.className).not.toContain('inset-0');
    expect(status?.className).not.toContain('bg-background');
    expect(status?.textContent).toContain('Cảm ơn bạn đã sử dụng dịch vụ');
    expect(status?.textContent).toContain('A12');
  });

  it('auto-dismisses after the short completion-feedback window', () => {
    const onDismiss = vi.fn();

    act(() => {
      root.render(
        <ThankYouOverlay
          ticketNumber="A12"
          serviceName="Cấp giấy tờ"
          servicePrefix="A"
          serviceColor="#123456"
          message="Đã phục vụ xong"
          onDismiss={onDismiss}
        />
      );
    });

    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3499);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses when a new display/queue supersession key arrives', () => {
    const onDismiss = vi.fn();

    act(() => {
      root.render(
        <ThankYouOverlay
          ticketNumber="A12"
          serviceName="Cấp giấy tờ"
          servicePrefix="A"
          serviceColor="#123456"
          message="Đã phục vụ xong"
          supersedeKey="call-1"
          onDismiss={onDismiss}
        />
      );
    });

    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      root.render(
        <ThankYouOverlay
          ticketNumber="A12"
          serviceName="Cấp giấy tờ"
          servicePrefix="A"
          serviceColor="#123456"
          message="Đã phục vụ xong"
          supersedeKey="call-2"
          onDismiss={onDismiss}
        />
      );
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('preserves configured thank-you text instead of replacing it with a hardcoded message', () => {
    renderOverlay();
    expect(container.textContent).toContain('Cảm ơn bạn đã sử dụng dịch vụ');
  });
});
