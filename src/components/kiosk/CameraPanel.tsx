'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import QRScanner from '../qr-scanner/QRScanner';
import { Ticket, Service } from '@prisma/client';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";


export default function CameraPanel() {
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);

  useEffect(() => {
    async function fetchServices() {
      try {
        const data = await apiClient.get<Service[]>('/api/services');
        setServices(data);
        if (data.length > 0) {
          setSelectedServiceId(data[0].id);
        }
      } catch (error) {
        logger.error('Failed to fetch services:', error);
        toast.error('Không thể tải danh sách dịch vụ.');
      }
    }
    fetchServices();
  }, []);

  const handleScanSuccess = useCallback(async (text: string) => {
    if (!selectedServiceId) {
      toast.error('Vui lòng chọn một dịch vụ trước khi quét.');
      return;
    }
    try {
      const response = await apiClient.post<Ticket>('/api/tickets/new-from-cccd', { 
        cccdData: text, 
        serviceId: selectedServiceId 
      });
      toast.success(`Lấy số thành công! Số của bạn là ${response.ticketNumber}.`);
    } catch (error) {
      logger.error('Failed to get ticket from CCCD scan:', error);
      toast.error('Không thể lấy số từ CCCD. Vui lòng thử lại.');
    }
  }, [selectedServiceId]);

  const handleScanError = useCallback((error: string) => {
    logger.error('QRScanner Error:', error);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center bg-card rounded-2xl p-6 text-center border border-border shadow-sm w-full max-w-sm aspect-square">
      <h2 className="text-2xl font-bold text-foreground">Lấy số bằng CCCD</h2>
      <p className="text-muted-foreground mt-2 mb-4">Chạm chọn dịch vụ, sau đó đưa CCCD vào khung quét.</p>

      <div className="w-full mb-4">
        <RadioGroup 
          onValueChange={setSelectedServiceId} 
          value={selectedServiceId || ''}
          className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2"
        >
          {services.map(service => (
            <div key={service.id} className="flex items-center space-x-2 p-2 bg-muted rounded-lg border border-border hover:border-primary hover:bg-card transition-colors cursor-pointer">
              <RadioGroupItem value={service.id} className="flex-shrink-0" />
              <Label className="text-sm font-medium text-muted-foreground cursor-pointer">{service.name}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div className="w-full aspect-square bg-muted rounded-lg overflow-hidden relative">
        {isCameraEnabled ? (
          <QRScanner onScanSuccess={handleScanSuccess} onScanError={handleScanError} debugMode={true} />
        ) : (
          <div className="flex items-center justify-center h-full bg-muted">
            <p className="text-muted-foreground">Camera đang tắt</p>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-2 mt-4 justify-center">
        <Switch 
          id="camera-toggle" 
          checked={isCameraEnabled}
          onCheckedChange={setIsCameraEnabled}
        />
        <Label htmlFor="camera-toggle">Bật/Tắt Camera</Label>
      </div>
    </div>
  );
}