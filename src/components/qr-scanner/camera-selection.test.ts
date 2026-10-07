import { describe, expect, it } from 'vitest';
import { isIRCamera, pickBestDevice, resolveCameraSelection } from './camera-selection';

function device(deviceId: string, label: string): MediaDeviceInfo {
    return { deviceId, groupId: deviceId, kind: 'videoinput', label, toJSON: () => ({ deviceId, groupId: deviceId, kind: 'videoinput', label }) } as MediaDeviceInfo;
}

describe('QR camera selection', () => {
    it('recognizes IR / Windows Hello camera labels', () => {
        expect(isIRCamera('Integrated Camera')).toBe(false);
        expect(isIRCamera('Windows Hello Face Camera')).toBe(true);
    });

    it('prefers a labeled RGB camera over an IR camera', () => {
        const ir = device('ir-1', 'Windows Hello Face Camera');
        const rgb = device('rgb-1', 'Integrated Webcam');
        expect(pickBestDevice([ir, rgb])).toBe(rgb);
    });

    it('switches away from an IR camera when another camera is available', () => {
        const ir = device('ir-1', 'Windows Hello Face Camera');
        const rgb = device('rgb-1', 'Integrated Webcam');
        expect(resolveCameraSelection({
            currentLabel: ir.label,
            currentDeviceId: ir.deviceId,
            devices: [ir, rgb],
            selectedDeviceId: null,
            autoSelected: false,
        })).toEqual({ action: 'switch', device: rgb });
    });

    it('keeps crop mode when the only available camera is IR', () => {
        const ir = device('ir-1', 'Windows Hello Face Camera');
        expect(resolveCameraSelection({
            currentLabel: ir.label,
            currentDeviceId: ir.deviceId,
            devices: [ir],
            selectedDeviceId: null,
            autoSelected: false,
        })).toEqual({ action: 'crop' });
    });

    it('keeps an explicitly selected RGB device', () => {
        const ir = device('ir-1', 'Windows Hello Face Camera');
        const rgb = device('rgb-1', 'Integrated Webcam');
        expect(resolveCameraSelection({
            currentLabel: rgb.label,
            currentDeviceId: rgb.deviceId,
            devices: [ir, rgb],
            selectedDeviceId: rgb.deviceId,
            autoSelected: false,
        })).toEqual({ action: 'keep' });
    });

    it('does not auto-switch an explicitly selected IR device', () => {
        const ir = device('ir-1', 'Windows Hello Face Camera');
        const rgb = device('rgb-1', 'Integrated Webcam');
        expect(resolveCameraSelection({
            currentLabel: ir.label,
            currentDeviceId: ir.deviceId,
            devices: [ir, rgb],
            selectedDeviceId: ir.deviceId,
            autoSelected: false,
        })).toEqual({ action: 'keep' });
    });
});
