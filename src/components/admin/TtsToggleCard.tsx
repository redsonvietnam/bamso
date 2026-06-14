import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface TtsToggleCardProps {
  enabled: boolean;
  onToggle: (value: string) => void;
}

export function TtsToggleCard({ enabled, onToggle }: TtsToggleCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bật/Tắt thông báo giọng nói</CardTitle>
        <CardDescription>Cho phép hệ thống đọc số thứ tự và thông báo bằng giọng nói</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => { onToggle(e.target.checked ? 'true' : 'false'); }}
              className="w-5 h-5"
            />
            <span className="text-sm">{enabled ? 'Đang bật' : 'Đang tắt'}</span>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
