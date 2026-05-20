import { NextRequest } from 'next/server';

/**
 * API Proxy cho Google Translate TTS
 * Giúp tránh lỗi CORS và cho phép caching âm thanh ở phía trình duyệt/CDN.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get('text');

    if (!text) {
        return new Response('Missing text parameter', { status: 400 });
    }

    // URL Google Translate TTS (Vietnamese)
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
                'Cache-Control': 'public, max-age=31536000, immutable', // Cache mạnh mẽ cho các cụm từ lặp lại
            },
        });
    } catch (error) {
        console.error('TTS Proxy Error:', error);
        return new Response('Internal Server Error', { status: 500 });
    }
}