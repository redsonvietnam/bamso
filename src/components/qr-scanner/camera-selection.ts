const IR_KEYWORDS = ['ir', 'infrared', 'depth', 'hello', 'face', 'windows hello'];
const RGB_KEYWORDS = ['integrated', 'webcam', 'rgb', 'hd', 'front', 'camera', 'built-in'];

export function isIRCamera(label: string): boolean {
    const lower = label.toLowerCase();
    return IR_KEYWORDS.some(k => lower.includes(k));
}

export function isRGBCamera(label: string): boolean {
    const lower = label.toLowerCase();
    return RGB_KEYWORDS.some(k => lower.includes(k));
}

export function pickBestDevice(devices: MediaDeviceInfo[]): MediaDeviceInfo | null {
    const rgb = devices.find(d => d.label && isRGBCamera(d.label) && !isIRCamera(d.label));
    if (rgb) return rgb;
    const nonIR = devices.find(d => d.label && !isIRCamera(d.label));
    if (nonIR) return nonIR;
    const anyLabeled = devices.find(d => d.label);
    if (anyLabeled) return anyLabeled;
    return devices[0] ?? null;
}

export type CameraSelection =
    | { action: 'switch'; device: MediaDeviceInfo }
    | { action: 'crop' }
    | { action: 'keep' };

export function resolveCameraSelection(options: {
    currentLabel: string;
    currentDeviceId?: string;
    devices: MediaDeviceInfo[];
    selectedDeviceId: string | null;
    autoSelected: boolean;
}): CameraSelection {
    const { currentLabel, currentDeviceId, devices, selectedDeviceId, autoSelected } = options;

    if (selectedDeviceId || autoSelected) return { action: 'keep' };

    const isIR = isIRCamera(currentLabel);
    if (isIR && devices.length > 1) {
        const best = pickBestDevice(devices);
        if (best && best.deviceId !== currentDeviceId) {
            return { action: 'switch', device: best };
        }
    }

    if (isIR || devices.length <= 1 || !currentLabel.trim()) {
        return { action: 'crop' };
    }

    return { action: 'keep' };
}
