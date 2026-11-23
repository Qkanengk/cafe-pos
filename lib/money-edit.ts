import { parseVndInput } from './money';

export function editVndInput({
  previous,
  text,
  caret,
  inputType,
  data,
}: {
  previous: string;
  text: string;
  caret: number;
  inputType: string;
  data: string | null;
}) {
  let before = text.slice(0, caret).replace(/\D/g, '').length;
  let digits = text.replace(/[.,]/g, '');
  const oldDigits = previous.replace(/\D/g, '');
  const separators = (s: string) => s.replace(/\d/g, '');
  const deleting = inputType.startsWith('delete');
  const digitInsertion =
    /^\d+$/.test(data ?? '') ||
    (inputType === 'insertText' &&
      separators(text) === separators(previous) &&
      digits.length > oldDigits.length);
  const maskedEdit =
    (previous === '' || Number.isFinite(parseVndInput(previous))) &&
    (deleting || digitInsertion) &&
    /^[\d.]*$/.test(text) &&
    separators(text).length <= separators(previous).length;
  if (maskedEdit && deleting && digits === oldDigits && text !== previous) {
    const index = inputType.endsWith('Backward') ? before - 1 : before;
    if (index >= 0 && index < digits.length) {
      digits = digits.slice(0, index) + digits.slice(index + 1);
      if (inputType.endsWith('Backward')) before--;
    }
  }
  const amount = parseVndInput(maskedEdit ? digits : text);
  if (text === '') return { value: '', display: '', caret: 0 };
  if (!Number.isFinite(amount))
    return {
      value: text,
      display: previous,
      caret: Math.min(caret, previous.length),
    };
  const value = String(amount),
    display = new Intl.NumberFormat('vi-VN').format(amount);
  before = Math.max(
    0,
    before -
      Math.max(
        0,
        (maskedEdit ? digits.length : text.replace(/\D/g, '').length) -
          value.length,
      ),
  );
  let position = 0,
    count = 0;
  while (position < display.length && count < before) {
    if (/\d/.test(display[position])) count++;
    position++;
  }
  return { value, display, caret: position };
}
