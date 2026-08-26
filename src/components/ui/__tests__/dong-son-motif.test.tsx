import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PageWatermark } from '../dong-son-motif';

describe('PageWatermark', () => {
    it('renders without opacity prop — no inline opacity style', () => {
        const html = renderToString(<PageWatermark className="opacity-[0.10]" />);
        expect(html).not.toMatch(/style="[^"]*opacity/);
        expect(html).toContain('opacity-[0.10]');
    });

    it('applies opacity via inline style when prop is provided', () => {
        const html = renderToString(<PageWatermark opacity={0.8} />);
        expect(html).toContain('style="opacity:0.8"');
    });

    it('opacity=0 makes watermark fully transparent', () => {
        const html = renderToString(<PageWatermark opacity={0} />);
        expect(html).toContain('style="opacity:0"');
    });

    it('opacity=1 makes watermark fully opaque', () => {
        const html = renderToString(<PageWatermark opacity={1} />);
        expect(html).toContain('style="opacity:1"');
    });

    it('preserves all other className classes when opacity prop is provided', () => {
        const html = renderToString(
            <PageWatermark
                className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[31.25rem] w-[31.25rem]"
                opacity={0.5}
            />
        );
        expect(html).toContain('left-1/2');
        expect(html).toContain('pointer-events-none');
        expect(html).toContain('style="opacity:0.5"');
    });

    it('does not add inline style when opacity is undefined (backward compat)', () => {
        const html = renderToString(
            <PageWatermark className="left-1/2 top-1/2 opacity-[0.15]" />
        );
        expect(html).not.toMatch(/style="[^"]*opacity/);
        expect(html).toContain('opacity-[0.15]');
    });
});
