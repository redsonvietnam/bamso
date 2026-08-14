import type { SVGProps } from 'react';
import { motion } from 'framer-motion';

interface Point {
    x: number;
    y: number;
}

function polar(cx: number, cy: number, r: number, angleDeg: number): Point {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function starPoints(cx: number, cy: number, outer: number, inner: number, points: number, rotDeg = 0): string {
    const pts: string[] = [];
    const step = 180 / points;
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const angle = rotDeg + i * step;
        const rad = (angle * Math.PI) / 180;
        pts.push(`${(cx + r * Math.cos(rad)).toFixed(2)},${(cy + r * Math.sin(rad)).toFixed(2)}`);
    }
    return pts.join(' ');
}

const SUN_TICK_ANGLES = Array.from({ length: 12 }, (_, i) => i * 30 + 15);

/**
 * Compact sun medallion for headers / emblems.
 * Colors follow `currentColor` — set via `text-*`.
 */
export function DongSonSun(props: SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" {...props}>
            <circle cx="50" cy="50" r="44" stroke="currentColor" strokeWidth="2" />
            <circle cx="50" cy="50" r="30" stroke="currentColor" strokeWidth="1.5" />
            {SUN_TICK_ANGLES.map((a) => {
                const p1 = polar(50, 50, 34, a);
                const p2 = polar(50, 50, 40, a);
                return (
                    <line
                        key={a}
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                    />
                );
            })}
            <polygon points={starPoints(50, 50, 26, 11, 6)} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <polygon points={starPoints(50, 50, 26, 11, 6, 30)} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <circle cx="50" cy="50" r="4" fill="currentColor" />
        </svg>
    );
}

/**
 * Decorative watermark layer using the Dong Son drum PNG (transparent background).
 * Positioned absolutely, ignores pointer events, and never blocks content.
 * Tune size / placement / opacity via `className`.
 */
export function PageWatermark({ className = '' }: { className?: string }) {
    return (
        <div aria-hidden="true" className={`pointer-events-none select-none absolute overflow-hidden scale-[3] ${className}`}>
            <motion.img
    src="/brand/trong-dong-dong-son.svg"
    alt=""
    draggable={false}
    className="h-full w-full object-contain"
    animate={{ rotate: -360 }}
    transition={{ ease: "linear", duration: 270, repeat: Infinity }}
/>
        </div>
    );
}
