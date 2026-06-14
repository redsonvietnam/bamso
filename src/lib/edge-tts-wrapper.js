/**
 * Microsoft Edge TTS client
 * Implements the WebSocket protocol to use Microsoft Edge's Read Aloud service
 * for Vietnamese text-to-speech - no API key required.
 */

const { default: WebSocket } = await import('ws');

const BASE_URL = 'speech.platform.bing.com/consumer/speech/synthesize/readaloud';
const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

function uuid() {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

/**
 * Generate audio (Buffer) from text using Microsoft Edge TTS.
 * @param {string} text - Text to speak
 * @param {string} voice - Voice ID (e.g. 'vi-VN-HoaiMyNeural')
 * @returns {Promise<Buffer>} MP3 audio buffer
 */
async function tts(text, voice = 'vi-VN-HoaiMyNeural') {
    const wsUrl = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${TOKEN}&ConnectionId=${uuid()}`;

    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl, {
            host: 'speech.platform.bing.com',
            origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.66 Safari/537.36 Edg/103.0.1264.44',
            },
        });

        const audioChunks = [];

        ws.on('message', (rawData, isBinary) => {
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
}

export { tts };
