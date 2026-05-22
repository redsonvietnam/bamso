"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, X, Check } from 'lucide-react';

type StaffMember = {
    id: string;
    username: string;
    name: string;
    role: string;
    createdAt: string;
    updatedAt?: string;
};

export default function StaffPanel() {
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [formData, setFormData] = useState({ username: '', password: '', name: '', role: 'STAFF' });

    const fetchStaff = async () => {
        try {
            const res = await fetch('/api/staff');
            if (res.ok) {
                setStaff(await res.json());
            }
        } catch (error) {
            console.error('Error fetching staff:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchStaff();
    }, []);

    const handleCreate = async () => {
        if (!formData.username || !formData.password || !formData.name || !formData.role) {
            toast.error('Vui lòng điền đầy đủ các trường bắt buộc.');
            return;
        }

        try {
            const res = await fetch('/api/staff', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Lỗi tạo nhân viên.');
            }

            toast.success('Tạo nhân viên thành công!');
            setIsCreating(false);
            setFormData({ username: '', password: '', name: '', role: 'STAFF' });
            fetchStaff();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi tạo nhân viên.');
        }
    };

    const handleUpdate = async () => {
        if (!editingStaff) return;

        try {
            const body: Record<string, unknown> = { id: editingStaff.id, name: formData.name, role: formData.role };
            if (formData.password) {
                body.password = formData.password;
            }

            const res = await fetch('/api/staff', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Lỗi cập nhật.');
            }

            toast.success('Cập nhật thành công!');
            setEditingStaff(null);
            setFormData({ username: '', password: '', name: '', role: 'STAFF' });
            fetchStaff();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi cập nhật.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Bạn có chắc muốn xóa nhân viên này?')) return;

        try {
            const res = await fetch(`/api/staff?id=${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Lỗi xóa nhân viên.');

            toast.success('Đã xóa nhân viên.');
            fetchStaff();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Lỗi xóa nhân viên.');
        }
    };

    const startEdit = (member: StaffMember) => {
        setEditingStaff(member);
        setFormData({ username: member.username, password: '', name: member.name, role: member.role });
    };

    const cancelEdit = () => {
        setEditingStaff(null);
        setFormData({ username: '', password: '', name: '', role: 'STAFF' });
    };

    if (isLoading) return <p className="text-muted-foreground">Đang tải...</p>;

    const roleLabel = (role: string) => {
        switch (role) {
            case 'STAFF': return 'Nhân viên';
            case 'KIOSK': return 'Kiosk';
            case 'DISPLAY': return 'Màn hình';
            default: return role;
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Quản lý nhân viên</h2>
                <Button onClick={() => setIsCreating(true)} disabled={isCreating || editingStaff !== null}>
                    <Plus className="w-4 h-4 mr-2" /> Thêm nhân viên
                </Button>
            </div>

            {isCreating && (
                <Card className="border-primary/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Nhân viên mới</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <StaffForm
                            formData={formData}
                            setFormData={setFormData}
                            onSave={handleCreate}
                            onCancel={() => { setIsCreating(false); setFormData({ username: '', password: '', name: '', role: 'STAFF' }); }}
                            saveLabel="Tạo"
                            isNew
                        />
                    </CardContent>
                </Card>
            )}

            <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-muted">
                        <tr>
                            <th className="text-left p-3 font-medium">Username</th>
                            <th className="text-left p-3 font-medium">Tên</th>
                            <th className="text-left p-3 font-medium">Vai trò</th>
                            <th className="text-left p-3 font-medium">Ngày tạo</th>
                            <th className="text-right p-3 font-medium">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {staff.map((s) => (
                            <tr key={s.id} className="hover:bg-muted/50">
                                <td className="p-3 font-mono">{s.username}</td>
                                <td className="p-3">{s.name}</td>
                                <td className="p-3">
                                    <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                                        {roleLabel(s.role)}
                                    </span>
                                </td>
                                <td className="p-3 text-muted-foreground">{new Date(s.createdAt).toLocaleDateString('vi-VN')}</td>
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

            {editingStaff && (
                <Card className="border-primary/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Chỉnh sửa: {editingStaff.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <StaffForm
                            formData={formData}
                            setFormData={setFormData}
                            onSave={handleUpdate}
                            onCancel={cancelEdit}
                            saveLabel="Lưu"
                            isNew={false}
                        />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function StaffForm({ formData, setFormData, onSave, onCancel, saveLabel, isNew }: {
    formData: { username: string; password: string; name: string; role: string };
    setFormData: React.Dispatch<React.SetStateAction<{ username: string; password: string; name: string; role: string }>>;
    onSave: () => void;
    onCancel: () => void;
    saveLabel: string;
    isNew: boolean;
}) {
    return (
        <div className="grid grid-cols-2 gap-4">
            <div>
                <Label>Username *</Label>
                <Input
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="staff2"
                    disabled={!isNew}
                />
            </div>
            <div>
                <Label>{isNew ? 'Mật khẩu *' : 'Mật khẩu mới (để trống nếu không đổi)'}</Label>
                <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                />
            </div>
            <div>
                <Label>Họ tên *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Nguyễn Văn A" />
            </div>
            <div>
                <Label>Vai trò *</Label>
                <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                    <option value="STAFF">Nhân viên (STAFF)</option>
                    <option value="KIOSK">Kiosk</option>
                    <option value="DISPLAY">Màn hình (DISPLAY)</option>
                </select>
            </div>
            <div className="col-span-2 flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-1" /> Hủy</Button>
                <Button onClick={onSave}><Check className="w-4 h-4 mr-1" /> {saveLabel}</Button>
            </div>
        </div>
    );
}
