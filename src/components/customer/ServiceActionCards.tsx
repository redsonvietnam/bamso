import { useRef, useState } from 'react';
import { Service } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Ticket, User, QrCode } from 'lucide-react';

export type ServiceActionMode = 'citizen' | 'citizen-name-first' | 'kiosk';
export type ServiceTicketMode = 'quick' | 'manual' | 'qr';

export function parseModes(modes: Service['allowedModes'] | string[] | null | undefined): string[] {
    if (!modes || (Array.isArray(modes) && modes.length === 0)) return [];
    if (Array.isArray(modes)) return modes;
    try {
        const parsed = JSON.parse(modes);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function getServiceActionModes(mode: ServiceActionMode): ServiceTicketMode[] {
    switch (mode) {
        case 'citizen':
        case 'citizen-name-first':
            return ['quick'];
        case 'kiosk':
            return ['manual', 'qr'];
    }
}

export function isServiceModeAllowed(service: Pick<Service, 'allowedModes'>, mode: ServiceTicketMode): boolean {
    return parseModes(service.allowedModes).includes(mode);
}

interface ServiceActionCardsProps {
    services: Service[];
    mode: ServiceActionMode;
    disabled?: boolean;
    onQuick: (service: Service, customerName: string) => void;
    onManual: (service: Service, customerName?: string) => void;
    onQr: (service: Service) => void;
    compact?: boolean;
}

export function ServiceActionCards({ services, mode, disabled, onQuick, onManual, onQr, compact = false }: ServiceActionCardsProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {services.map((service) => (
                <ServiceActionCard
                    key={service.id}
                    service={service}
                    mode={mode}
                    disabled={disabled}
                    compact={compact}
                    onQuick={onQuick}
                    onManual={onManual}
                    onQr={onQr}
                />
            ))}
        </div>
    );
}

function ServiceActionCard({
    service,
    mode,
    disabled,
    compact,
    onQuick,
    onManual,
    onQr,
}: {
    service: Service;
    mode: ServiceActionMode;
    disabled?: boolean;
    compact?: boolean;
    onQuick: (service: Service, customerName: string) => void;
    onManual: (service: Service, customerName?: string) => void;
    onQr: (service: Service) => void;
}) {
    const [customerName, setCustomerName] = useState('');
    const [validationError, setValidationError] = useState('');
    const [isNameEntryOpen, setIsNameEntryOpen] = useState(false);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const quickAllowed = isServiceModeAllowed(service, 'quick');
    const manualAllowed = isServiceModeAllowed(service, 'manual');
    const qrAllowed = isServiceModeAllowed(service, 'qr');

    const handleCitizenSubmit = () => {
        const trimmedName = customerName.trim();
        if (!trimmedName) {
            setValidationError('Vui lòng nhập tên.');
            return;
        }

        setValidationError('');
        if (mode === 'citizen-name-first') {
            onQuick(service, trimmedName);
        } else {
            onManual(service, trimmedName);
        }
    };

    return (
        <Card className="sketch-radius riso-paper-card glass-card border-2 shadow-md">
            <CardHeader className={compact ? 'pb-2 md:pb-4 text-center' : 'pb-4 text-center'}>
                <div
                    className={compact
                        ? 'mx-auto mb-1 flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-white md:mb-3 md:h-14 md:w-14 md:text-2xl'
                        : 'mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold text-white sm:h-14 sm:w-14 sm:text-2xl'}
                    style={{ backgroundColor: service.color }}
                    aria-hidden="true"
                >
                    {service.prefix}
                </div>
                <CardTitle className="text-base sm:text-xl">{service.name}</CardTitle>
                {service.description && (
                    <CardDescription className={compact ? 'hidden md:block mt-1 text-sm' : 'mt-1 text-sm'}>
                        {service.description}
                    </CardDescription>
                )}
            </CardHeader>
            <CardContent className="pt-0">
                {mode === 'citizen' && quickAllowed && (
                    <Button
                        type="button"
                        className="h-20 w-full min-w-0 flex-col gap-1 px-2 text-xs sm:h-24 sm:text-sm"
                        onClick={() => onQuick(service, '')}
                        disabled={disabled}
                        aria-label={'Lấy nhanh cho dịch vụ ' + service.name}
                    >
                        <Ticket className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                        <span className="truncate">Lấy nhanh</span>
                    </Button>
                )}

                {mode === 'citizen-name-first' && quickAllowed && (
                    <div className="space-y-2">
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Input
                                type="text"
                                value={customerName}
                                onChange={(event) => {
                                    setCustomerName(event.target.value);
                                    if (validationError) setValidationError('');
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') handleCitizenSubmit();
                                }}
                                placeholder="Họ và tên"
                                aria-label={'Họ và tên cho dịch vụ ' + service.name}
                                aria-invalid={Boolean(validationError)}
                                className="h-11 min-w-0 flex-1"
                                disabled={disabled}
                            />
                            <Button
                                type="button"
                                className="h-11 shrink-0 sm:min-w-28"
                                onClick={handleCitizenSubmit}
                                disabled={disabled}
                                aria-label={'Lấy số cho dịch vụ ' + service.name}
                            >
                                <Ticket className="mr-2 h-4 w-4" aria-hidden="true" />
                                Lấy số
                            </Button>
                        </div>
                        {validationError && (
                            <p className="text-sm text-destructive" role="alert">
                                {validationError}
                            </p>
                        )}
                    </div>
                )}

                {mode === 'kiosk' && (
                    <div className="space-y-3">
                        <div className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${isNameEntryOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`} aria-hidden={!isNameEntryOpen}>
                            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-3">
                                <Label htmlFor={`kiosk-name-${service.id}`} className="text-sm font-semibold">Họ và tên</Label>
                                <Input
                                    ref={nameInputRef}
                                    id={`kiosk-name-${service.id}`}
                                    value={customerName}
                                    onChange={(event) => {
                                        setCustomerName(event.target.value);
                                        if (validationError) setValidationError('');
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') handleCitizenSubmit();
                                        if (event.key === 'Escape') {
                                            setIsNameEntryOpen(false);
                                            setValidationError('');
                                        }
                                    }}
                                    placeholder="Nguyễn Văn A"
                                    aria-label={'Họ và tên cho dịch vụ ' + service.name}
                                    aria-invalid={Boolean(validationError)}
                                    aria-describedby={validationError ? `kiosk-name-error-${service.id}` : undefined}
                                    className="h-11 min-w-0 w-full"
                                    disabled={disabled}
                                />
                                {validationError && (
                                    <p id={`kiosk-name-error-${service.id}`} className="text-sm text-destructive" role="alert">{validationError}</p>
                                )}
                                <div className="flex gap-2 pt-1">
                                    <Button type="button" className="h-11 min-w-0 flex-1" onClick={handleCitizenSubmit} disabled={disabled} aria-label={'Xác nhận lấy số cho dịch vụ ' + service.name}>
                                        <Ticket className="mr-2 h-4 w-4" aria-hidden="true" />
                                        Lấy số
                                    </Button>
                                    <Button type="button" variant="ghost" className="h-11 shrink-0 px-3" onClick={() => { setIsNameEntryOpen(false); setValidationError(''); }} disabled={disabled} aria-label={'Hủy nhập tên cho dịch vụ ' + service.name}>
                                        Hủy
                                    </Button>
                                </div>
                            </div>
                        </div>
                        {!isNameEntryOpen && (
                            <div className="grid grid-cols-2 gap-2 sm:gap-3">
                                {manualAllowed && (
                                    <Button type="button" variant="outline" className="h-20 min-w-0 flex-col gap-1 px-2 text-xs sm:h-24 sm:text-sm" onClick={() => {
                                        setIsNameEntryOpen(true);
                                        setValidationError('');
                                        requestAnimationFrame(() => nameInputRef.current?.focus());
                                    }} disabled={disabled} aria-label={'Nhập tên cho dịch vụ ' + service.name} aria-expanded={false}>
                                        <User className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                                        <span className="truncate">Nhập tên</span>
                                    </Button>
                                )}
                                {qrAllowed && (
                                    <Button type="button" variant="outline" className="h-20 min-w-0 flex-col gap-1 px-2 text-xs sm:h-24 sm:text-sm" onClick={() => onQr(service)} disabled={disabled} aria-label={'Quét CCCD cho dịch vụ ' + service.name}>
                                        <QrCode className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                                        <span className="truncate">Quét CCCD</span>
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
