import DisplayBoard from '@/components/display/DisplayBoard';

export const metadata = {
    title: 'Bảng Hiển Thị Hàng Đợi',
    description: 'Màn hình hiển thị số thứ tự đang được gọi và hàng đợi.',
};

export default function DisplayPage() {
    return <DisplayBoard />;
}