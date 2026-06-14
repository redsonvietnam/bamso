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
    const [formData, setFormData] = useState({ code: '', name: '', description: '', color: '#3B82F6', prefix: '', order: 0 });

    const fetchServices = async () => {
        try {
            const data = await apiClient.get<Service[]>('/api/services?active=false');
            setServices(data);
        } catch {
            toast.error('Không thể tải danh sách dịch vụ.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        let cancelled = false;
        apiClient.get<Service[]>('/api/services?active=false').then((data) => {
            if (!cancelled) setServices(data);
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
            await apiClient.post('/api/services', formData);
            toast.success('Tạo dịch vụ thành công!');
            setIsCreating(false);
            setFormData({ code: '', name: '', description: '', color: '#3B82F6', prefix: '', order: 0 });
            fetchServices();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi tạo dịch vụ.');
        }
    };

    const handleUpdate = async () => {
        if (!editingService) return;

        try {
            await apiClient.put('/api/services', { id: editingService.id, ...formData });
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
        setFormData({
            code: service.code,
            name: service.name,
            description: service.description || '',
            color: service.color,
            prefix: service.prefix,
            order: service.order,
        });
    };

    const cancelEdit = () => {
        setEditingService(null);
        setFormData({ code: '', name: '', description: '', color: '#3B82F6', prefix: '', order: 0 });
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
                            onCancel={() => { setIsCreating(false); setFormData({ code: '', name: '', description: '', color: '#3B82F6', prefix: '', order: 0 }); }}
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
                                    <span className={`px-2 py-0.5 rounded-full text-xs ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
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

function ServiceForm({ formData, setFormData, onSave, onCancel, saveLabel }: {
    formData: { code: string; name: string; description: string; color: string; prefix: string; order: number };
    setFormData: React.Dispatch<React.SetStateAction<{ code: string; name: string; description: string; color: string; prefix: string; order: number }>>;
    onSave: () => void;
    onCancel: () => void;
    saveLabel: string;
}) {
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
            <div className="col-span-2 flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-1" /> Hủy</Button>
                <Button onClick={onSave}><Check className="w-4 h-4 mr-1" /> {saveLabel}</Button>
            </div>
        </div>
    );
}
