import { useState } from 'react';
import TextField, { type TextFieldProps } from '@mui/material/TextField';

/**
 * A text field for a value that also changes from elsewhere (e.g. the view
 * centre while panning). Shows the external value unless the user is editing,
 * and commits on Enter or blur. `parse` returns null for invalid input.
 */
export function CommitField<T>({
  value,
  format,
  parse,
  onCommit,
  ...rest
}: {
  value: T;
  format: (v: T) => string;
  parse: (s: string) => T | null;
  onCommit: (v: T) => void;
} & Omit<TextFieldProps, 'value' | 'onChange' | 'error'>) {
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && parse(draft) === null;
  const commit = () => {
    if (draft === null) return;
    const v = parse(draft);
    if (v !== null) onCommit(v);
    setDraft(null);
  };
  return (
    <TextField
      size="small"
      fullWidth
      {...rest}
      value={draft ?? format(value)}
      error={invalid}
      helperText={invalid ? 'Not a valid number' : rest.helperText}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
      slotProps={{
        ...rest.slotProps,
        htmlInput: {
          spellCheck: false,
          style: {
            fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
            fontSize: 13,
          },
          ...(rest.slotProps?.htmlInput as object | undefined),
        },
      }}
    />
  );
}
