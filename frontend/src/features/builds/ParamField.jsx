import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export function ParamField({ param, value, onChange }) {
  const { type, label, name, options = [], required, placeholder, flag } = param;
  const id = `param-${name}`;
  const text = label || name;
  const heading = (
    <>
      {text}
      {required && <span className="text-bad" aria-hidden="true"> *</span>}
    </>
  );

  if (type === 'checkbox') {
    return (
      <div className="flex min-h-10 items-center justify-between gap-3">
        <Label htmlFor={id} className="font-normal">
          {text} <span className="font-mono text-xs text-muted-foreground">{flag}</span>
        </Label>
        <Switch id={id} checked={!!value} onCheckedChange={(v) => onChange(v === true)} />
      </div>
    );
  }
  if (type === 'string') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{heading}</Label>
        <Input id={id} className="h-10" required={required} value={value || ''} placeholder={placeholder || ''} onChange={(e) => onChange(e.target.value)} onBlur={(e) => onChange(e.target.value.trim())} />
      </div>
    );
  }
  if (type === 'select') {
    return (
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{heading}</legend>
        <div role="radiogroup" aria-label={text} className="flex flex-wrap gap-1.5">
          {options.map((opt) => (
            <Button key={opt} type="button" role="radio" aria-checked={value === opt} variant={value === opt ? 'default' : 'outline'} className="h-10 min-w-14" onClick={() => onChange(opt)}>
              {opt.toUpperCase()}
            </Button>
          ))}
        </div>
      </fieldset>
    );
  }
  if (type === 'multiselect') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{heading}</legend>
        <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
          {options.map((opt) => {
            const oid = `${id}-${opt}`;
            return (
              <div key={opt} className="flex min-h-10 items-center gap-2">
                <Checkbox id={oid} checked={selected.includes(opt)} onCheckedChange={(c) => onChange(c === true ? [...selected, opt] : selected.filter((x) => x !== opt))} />
                <Label htmlFor={oid} className="font-normal">{opt}</Label>
              </div>
            );
          })}
        </div>
      </fieldset>
    );
  }
  return null;
}
