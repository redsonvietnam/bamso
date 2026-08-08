"use client";

import { useState, useEffect } from 'react';
import { Service } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, X, Check } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export default function ServicesPanel() {
    const [services, setServices] = useState<Service[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingService, setEditingService] = useState<Service | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [formData, setFormData] = useState({ code: '', name: '', description: '', color: '#3B82F6', prefix: '', order: 0, allowedModes: ['quick', 'manual', 'qr'] as string[] });

    const fetchServices = async () => {
        try {
            const data = await apiClient.get<Service[]>('/api/services?active=false');
            setServices(data.map(s => ({ ...s, allowedModes: typeof s.allowedModes === 'string' ? JSON.parse(s.allowedModes) : s.allowedModes })));
        } catch {
            toast.error('Không thể tải danh sách dịch vụ.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        let cancelled = false;
        apiClient.get<Service[]>('/api/services?active=false').then((data) => {
            if (!cancelled) setServices(data.map(s => ({ ...s, allowedModes: typeof s.allowedModes === 'string' ? JSON.parse(s.allowedModes) : s.allowedModes })));
        }).catch(() => {
            if (!cancelled) toast.error('Không thể tải danh sách dịch vụ.');
        }).finally(() => {
            if (!cancelled) setIsLoading(false);
        });
        return () => { cancelled = true; };
    }, []);

    const handleCreate = async () => {
        if (!formData.code || !formData.name || !formData.color || !formData.prefix) {
            toast.error('Vui lòng điền đầy đủ các trường bắt buộc.');
            return;
        }

        try {
            await apiClient.post('/api/services', { ...formData, allowedModes: JSON.stringify(formData.allowedModes) });
            toast.success('Tạo dịch vụ thành công!');
            setIsCreating(false);
            setFormData({ code: '', name: '', description: '', color: '#3B82F6', prefix: '', order: 0, allowedModes: ['quick', 'manual', 'qr'] });
            fetchServices();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi tạo dịch vụ.');
        }
    };

    const handleUpdate = async () => {
        if (!editingService) return;

        try {
            await apiClient.put('/api/services', { id: editingService.id, ...formData, allowedModes: JSON.stringify(formData.allowedModes) });
            toast.success('Cập nhật thành công!');
            setEditingService(null);
            fetchServices();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi cập nhật.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Bạn có chắc muốn xóa dịch vụ này?')) return;

        try {
            await apiClient.delete(`/api/services?id=${id}`);
            toast.success('Đã xóa dịch vụ.');
            fetchServices();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi xóa dịch vụ.');
        }
    };

    const startEdit = (service: Service) => {
        setEditingService(service);
        const modes = typeof service.allowedModes === 'string' ? JSON.parse(service.allowedModes) : service.allowedModes;
        setFormData({
            code: service.code,
            name: service.name,
            description: service.description || '',
            color: service.color,
            prefix: service.prefix,
            order: service.order,
            allowedModes: Array.isArray(modes) ? modes : ['quick', 'manual', 'qr'],
        });
    };

    const cancelEdit = () => {
        setEditingService(null);
        setFormData({ code: '', name: '', description: '', color: '#3B82F6', prefix: '', order: 0, allowedModes: ['quick', 'manual', 'qr'] });
    };

    if (isLoading) return <p className="text-muted-foreground">Đang tải...</p>;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Quản lý dịch vụ</h2>
                <Button onClick={() => setIsCreating(true)} disabled={isCreating || editingService !== null}>
                    <Plus className="w-4 h-4 mr-2" /> Thêm dịch vụ
                </Button>
            </div>

            {isCreating && (
                <Card className="border-primary/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Dịch vụ mới</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ServiceForm
                            formData={formData}
                            setFormData={setFormData}
                            onSave={handleCreate}
                            onCancel={() => { setIsCreating(false); setFormData({ code: '', name: '', description: '', color: '#3B82F6', prefix: '', order: 0, allowedModes: ['quick', 'manual', 'qr'] }); }}
                            saveLabel="Tạo"
                        />
                    </CardContent>
                </Card>
            )}

            <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-muted">
                        <tr>
                            <th className="text-left p-3 font-medium">Mã</th>
                            <th className="text-left p-3 font-medium">Tên</th>
                            <th className="text-left p-3 font-medium">Prefix</th>
                            <th className="text-left p-3 font-medium">Màu</th>
                            <th className="text-left p-3 font-medium">Thứ tự</th>
                            <th className="text-left p-3 font-medium">Trạng thái</th>
                            <th className="text-right p-3 font-medium">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {services.map((s) => (
                            <tr key={s.id} className="hover:bg-muted/50">
                                <td className="p-3 font-mono">{s.code}</td>
                                <td className="p-3">{s.name}</td>
                                <td className="p-3 font-mono">{s.prefix}</td>
                                <td className="p-3">
                                    <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: s.color }} />
                                </td>
                                <td className="p-3">{s.order}</td>
                                <td className="p-3">
                                    <span className={`px-2 py-0.5 rounded-full text-xs ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                                        {s.isActive ? 'Hoạt động' : 'Ngừng'}
                                    </span>
                                </td>
                                <td className="p-3 text-right">
                                    <div className="flex justify-end gap-1">
                                        <Button variant="ghost" size="sm" onClick={() => startEdit(s)}>
                                            <Edit className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)}>
                                            <Trash2 className="w-4 h-4 text-red-500" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {editingService && (
                <Card className="border-primary/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Chỉnh sửa: {editingService.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ServiceForm
                            formData={formData}
                            setFormData={setFormData}
                            onSave={handleUpdate}
                            onCancel={cancelEdit}
                            saveLabel="Lưu"
                        />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

const MODE_LABELS: Record<string, { label: string; desc: string }> = {
    quick: { label: 'Lấy số nhanh', desc: 'Chỉ lấy số, không cần thông tin' },
    manual: { label: 'Nhập tay', desc: 'Nhập họ tên + giọng nói' },
    qr: { label: 'Quét CCCD / VNeID', desc: 'Quét mã QR trên CCCD hoặc VNeID' },
};

function ServiceForm({ formData, setFormData, onSave, onCancel, saveLabel }: {
    formData: { code: string; name: string; description: string; color: string; prefix: string; order: number; allowedModes: string[] };
    setFormData: React.Dispatch<React.SetStateAction<{ code: string; name: string; description: string; color: string; prefix: string; order: number; allowedModes: string[] }>>;
    onSave: () => void;
    onCancel: () => void;
    saveLabel: string;
}) {
    const toggleMode = (mode: string) => {
        setFormData(prev => ({
            ...prev,
            allowedModes: prev.allowedModes.includes(mode)
                ? prev.allowedModes.filter(m => m !== mode)
                : [...prev.allowedModes, mode],
        }));
    };

    return (
        <div className="grid grid-cols-2 gap-4">
            <div>
                <Label>Mã dịch vụ *</Label>
                <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="A" />
            </div>
            <div>
                <Label>Tên dịch vụ *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Dịch vụ A" />
            </div>
            <div>
                <Label>Prefix *</Label>
                <Input value={formData.prefix} onChange={(e) => setFormData({ ...formData, prefix: e.target.value })} placeholder="A" />
            </div>
            <div>
                <Label>Màu *</Label>
                <Input type="color" value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} className="h-10 w-full" />
            </div>
            <div>
                <Label>Thứ tự</Label>
                <Input type="number" value={formData.order} onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
                <Label>Mô tả</Label>
                <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Mô tả ngắn" />
            </div>
            <div className="col-span-2">
                <Label className="mb-2 block">Chế độ lấy số</Label>
                <div className="flex flex-wrap gap-3">
                    {Object.entries(MODE_LABELS).map(([key, { label, desc }]) => (
                        <label
                            key={key}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                                formData.allowedModes.includes(key)
                                    ? 'border-primary bg-primary/5 text-primary'
                                    : 'border-border text-muted-foreground hover:border-border'
                            }`}
                        >
                            <input
                                type="checkbox"
                                className="sr-only"
                                checked={formData.allowedModes.includes(key)}
                                onChange={() => toggleMode(key)}
                            />
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                                formData.allowedModes.includes(key)
                                    ? 'bg-primary border-primary text-white'
                                    : 'border-border'
                            }`}>
                                {formData.allowedModes.includes(key) && (
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                )}
                            </div>
                            <div>
                                <p className="text-sm font-medium">{label}</p>
                                <p className="text-xs text-muted-foreground">{desc}</p>
                            </div>
                        </label>
                    ))}
                </div>
            </div>
            <div className="col-span-2 flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-1" /> Hủy</Button>
                <Button onClick={onSave}><Check className="w-4 h-4 mr-1" /> {saveLabel}</Button>
            </div>
        </div>
    );
}
