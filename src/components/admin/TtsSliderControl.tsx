import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

interface TtsSliderControlProps {
  cardTitle: string;
  cardDescription: string;
  value: string;
  min: string;
  max: string;
  step: string;
  displayValue: string;
  isLoading: boolean;
  onValueChange: (value: string) => void;
  onSave: () => void;
}

export function TtsSliderControl({
  cardTitle, cardDescription, value, min, max, step, displayValue,
  isLoading, onValueChange, onSave,
}: TtsSliderControlProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <span className="text-sm font-mono w-12 text-center">{displayValue}</span>
          <div className="flex-1 max-w-xs">
            <input
              type="range" min={min} max={max} step={step}
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              className="w-full"
            />
          </div>
          <Button size="sm" onClick={onSave} disabled={isLoading}>
            <Check className="w-4 h-4 mr-1" /> Lưu
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
