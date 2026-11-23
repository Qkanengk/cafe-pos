import { describe, it, expect } from 'vitest';
import {
  parseVndInput,
  vndInputError,
  parsePercentInput,
  parseDiscountInput,
  lineTotal,
  subtotal,
  cartTotal,
  discountAmount,
  changeDue,
  cashSuggestions,
  cashNoteSuggestions,
  vnd,
} from '../../lib/money';
import { editVndInput } from '../../lib/money-edit';
describe('Vietnamese VND input', () => {
  it('explains negative, oversized and fractional currency separately', () => {
    expect(vndInputError('-1')).toContain('không được âm');
    expect(vndInputError('9999999999999')).toContain('quá lớn');
    expect(vndInputError('1.5')).toContain('thập phân');
  });
  it('never deletes digits when cutting or deleting a selection of grouping separators', () => {
    for (const inputType of [
      'deleteByCut',
      'deleteContentBackward',
      'deleteContentForward',
    ])
      expect(
        editVndInput({
          previous: '125.000',
          text: '125000',
          caret: 3,
          inputType,
          data: null,
          rangeDeletion: true,
        }),
      ).toEqual({ value: '125000', display: '125.000', caret: 3 });
    expect(
      editVndInput({
        previous: '125.000',
        text: '125000',
        caret: 3,
        inputType: 'deleteByCut',
        data: null,
      }),
    ).toEqual({ value: '125000', display: '125.000', caret: 3 });
  });
  it('regroups append, middle insertion and digit/separator deletion while anchoring the caret to digits', () => {
    for (const [
      previous,
      text,
      caret,
      inputType,
      data,
      value,
      display,
      position,
    ] of [
      ['50.000', '50.0000', 7, 'insertText', '0', '500000', '500.000', 7],
      ['50.000', '510.000', 2, 'insertText', '1', '510000', '510.000', 2],
      ['50.000', '50.00', 5, 'deleteContentBackward', null, '5000', '5.000', 5],
      ['50.000', '5.000', 1, 'deleteContentBackward', null, '5000', '5.000', 1],
      ['50.000', '50000', 2, 'deleteContentBackward', null, '5000', '5.000', 1],
      ['50.000', '50000', 2, 'deleteContentForward', null, '5000', '5.000', 3],
      ['50.000', '', 0, 'deleteContentBackward', null, '', '', 0],
      ['', '50,000', 6, 'insertFromPaste', '50,000', '50000', '50.000', 6],
      ['50.000', '050.000', 1, 'insertText', '0', '50000', '50.000', 0],
    ] as const)
      expect(editVndInput({ previous, text, caret, inputType, data })).toEqual({
        value,
        display,
        caret: position,
      });
  });
  it('does not turn decimal or mixed currency insertion into a larger integer', () => {
    for (const text of ['1.5', '50,000.00', '50.00', '50a.00', '2147483648']) {
      const edit = editVndInput({
        previous: '50.000',
        text,
        caret: text.length,
        inputType: 'insertFromPaste',
        data: text,
      });
      expect(parseVndInput(edit.value)).toBeNaN();
      expect(edit.display).toBe('50.000');
    }
    for (const value of ['1.5', '1,5', '1.000', '101', ''])
      expect(parsePercentInput(value)).toBeNaN();
    expect(parseDiscountInput('50.000', 'AMOUNT')).toBe(50000);
    expect(parseDiscountInput('50.000', 'PERCENT')).toBeNaN();
    expect(parsePercentInput('15')).toBe(15);
    expect(parsePercentInput('0')).toBe(0);
  });
  it('accepts dots, commas, and ungrouped integer VND', () => {
    for (const value of ['500.000', '500,000', '500000', ' 500.000 ', 500000])
      expect(parseVndInput(value)).toBe(500000);
    expect(parseVndInput('1.250.000')).toBe(1250000);
    expect(parseVndInput('0')).toBe(0);
  });
  it('rejects empty, ambiguous fractions, mixed separators, and out-of-range amounts', () => {
    for (const value of [
      '',
      '500.5',
      '500,00',
      '1.000,000',
      '-1',
      'abc',
      '2147483648',
    ])
      expect(parseVndInput(value)).toBeNaN();
  });
});
describe('integer VND', () => {
  it('prices toppings per item and ignores voided lines', () => {
    expect(
      lineTotal({ price: 25000, quantity: 2, toppings: [5000, 5000] }),
    ).toBe(70000);
    expect(
      subtotal([
        { price: 25000, quantity: 2 },
        { price: 10000, quantity: 1, status: 'VOIDED' },
      ]),
    ).toBe(50000);
  });
  it('handles empty carts and zero quantities', () => {
    expect(cartTotal([])).toEqual({ subtotal: 0, discount: 0, total: 0 });
    expect(lineTotal({ price: 100, quantity: 0 })).toBe(0);
    expect(cashSuggestions(0)).toEqual([]);
  });
  it('rounds percentage half up once and caps fixed discounts', () => {
    expect(discountAmount(101, { type: 'PERCENT', value: 50 })).toBe(51);
    expect(
      cartTotal([{ price: 30000, quantity: 2 }], {
        type: 'PERCENT',
        value: 10,
      }),
    ).toEqual({ subtotal: 60000, discount: 6000, total: 54000 });
    expect(discountAmount(100, { type: 'AMOUNT', value: 200 })).toBe(100);
  });
  it('calculates exact change and useful cash suggestions', () => {
    expect(changeDue(35000, 50000)).toBe(15000);
    expect(changeDue(0, 0)).toBe(0);
    expect(cashSuggestions(35000)).toEqual([
      35000, 36000, 40000, 50000, 100000,
    ]);
  });
  it('keeps useful banknotes within a four-button payment row', () => {
    expect(cashNoteSuggestions(76500)).toEqual([76500, 100000, 200000, 500000]);
    expect(cashNoteSuggestions(500000)).toEqual([500000, 600000]);
    expect(cashNoteSuggestions(765000)).toEqual([
      765000, 766000, 770000, 780000,
    ]);
    expect(cashNoteSuggestions(0)).toEqual([]);
    for (const invalid of [-1, 0.5, NaN])
      expect(() => cashNoteSuggestions(invalid)).toThrow();
  });
  it('rejects invalid amounts, percentages, short cash and overflow', () => {
    for (const amount of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(() => vnd(amount)).toThrow();
    expect(() => discountAmount(1, { type: 'PERCENT', value: 101 })).toThrow();
    expect(() => changeDue(10, 9)).toThrow();
    expect(() =>
      lineTotal({ price: Number.MAX_SAFE_INTEGER, quantity: 2 }),
    ).toThrow();
  });
});
