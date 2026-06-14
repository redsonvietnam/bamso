import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

// Vietnamese Edge TTS voices list
const EDGE_VOICES = [
    { id: 'vi-VN-HoaiMyNeural', name: 'Hoài My (Nữ)' },
    { id: 'vi-VN-NamMinhNeural', name: 'Nam Minh (Nam)' },
    { id: 'vi-VN-LanAnhNeural', name: 'Lan Anh (Nữ, Tự nhiên)' },
    { id: 'vi-VN-NguyenBaoNeural', name: 'Nguyên Bảo (Nam, Tự nhiên)' },
    { id: 'vi-VN-MyDuyenNeural', name: 'My Duyên (Nữ)' },
    { id: 'vi-VN-MyLinhNeural', name: 'My Linh (Nữ, Tự nhiên)' },
    { id: 'vi-VN-QuynhChiNeural', name: 'Quỳnh Chi (Nữ)' },
    { id: 'vi-VN-BichNgocNeural', name: 'Bích Ngọc (Nữ, Tự nhiên)' },
    { id: 'vi-VN-ThiLeNeural', name: 'Thi Lệ (Nữ, Tự nhiên)' },
];

/** POST handler - supports getVoices, edge, google providers */
export async function POST(request: NextRequest) {
    const { provider, text, voice } = await request.json();

    if (provider === 'getVoices') {
        return Response.json(EDGE_VOICES);
    }

    if (!text) {
        return new Response('Missing text parameter', { status: 400 });
    }

    if (provider === 'edge') {
        return handleEdgeTts(text, voice);
    }

    return handleGoogleTts(text);
}

/**
 * Google Translate TTS Proxy
 */
async function handleGoogleTts(text: string) {
    const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(text)}`;

    try {
        const res = await fetch(googleTtsUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });

        if (!res.ok) throw new Error('Failed to fetch from Google TTS');

        const audioData = await res.arrayBuffer();

        return new Response(audioData, {
            headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (error) {
        logger.error('Google TTS Proxy Error:', error);
        return new Response('Internal Server Error', { status: 500 });
    }
}

/**
 * Microsoft Edge TTS via WebSocket
 * Dynamically imports 'ws' at runtime (server-side only).
 */
async function handleEdgeTts(text: string, voiceName?: string) {
    try {
        const { default: WebSocket } = await import('ws');
        const voice = voiceName || 'vi-VN-HoaiMyNeural';

        const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
        const BASE_URL = 'speech.platform.bing.com/consumer/speech/synthesize/readaloud';

        const uuid = () => 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });

        const wsUrl = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${TOKEN}&ConnectionId=${uuid()}`;

        const audioBuffer = await new Promise<Buffer>((resolve, reject) => {
            const ws = new WebSocket(wsUrl, {
                host: 'speech.platform.bing.com',
                origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.66 Safari/537.36 Edg/103.0.1264.44',
                },
            });

            const audioChunks: Buffer[] = [];

            ws.on('message', (rawData: Buffer, isBinary: boolean) => {
                if (!isBinary) {
                    const data = rawData.toString('utf8');
                    if (data.includes('turn.end')) {
                        resolve(Buffer.concat(audioChunks));
                        ws.close();
                    }
                    return;
                }
                const data = Buffer.from(rawData);
                const separator = 'Path:audio\r\n';
                const idx = data.indexOf(separator);
                if (idx >= 0) {
                    audioChunks.push(data.subarray(idx + separator.length));
                }
            });

            ws.on('error', reject);

            ws.on('open', () => {
                // Send speech config
                const speechConfig = JSON.stringify({
                    context: {
                        synthesis: {
                            audio: {
                                metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
                                outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
                            },
                        },
                    },
                });
                const configMsg = `X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${speechConfig}`;
                ws.send(configMsg, { compress: true }, (err) => {
                    if (err) return reject(err);

                    // Send SSML
                    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'>`
                        + `<voice name='${voice}'><prosody rate='+0%' volume='+0%' pitch='+0Hz'>`
                        + `${text}</prosody></voice></speak>`;
                    const ssmlMsg = `X-RequestId:${uuid()}\r\nContent-Type:application/ssml+xml\r\n`
                        + `X-Timestamp:${new Date().toISOString()}Z\r\nPath:ssml\r\n\r\n${ssml}`;
                    ws.send(ssmlMsg, { compress: true }, (ssmlErr) => {
                        if (ssmlErr) reject(ssmlErr);
                    });
                });
            });
        });

        return new Response(new Uint8Array(audioBuffer), {
            headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (error) {
        logger.error('Edge TTS Error:', error);
        return new Response('Internal Server Error', { status: 500 });
    }
}

/** Legacy GET support (backward compatibility) */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get('text');
    const provider = searchParams.get('provider') || 'google';
    const voice = searchParams.get('voice') || undefined;

    if (!text) {
        return new Response('Missing text parameter', { status: 400 });
    }

    if (provider === 'edge') {
        return handleEdgeTts(text, voice);
    }

    return handleGoogleTts(text);
}