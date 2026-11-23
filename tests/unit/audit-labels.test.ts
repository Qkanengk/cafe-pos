import { it, expect } from 'vitest';
import {
  auditActionLabel,
  auditEntityLabel,
  auditDescription,
} from '../../lib/audit-labels';
it('renders readable Vietnamese, not technical JSON or credentials', () => {
  expect(auditActionLabel('DISCOUNT')).toBe('Áp dụng giảm giá');
  expect(auditEntityLabel('categories')).toBe('Danh mục');
  expect(
    auditDescription({
      name: 'Cà phê',
      amount: 5000,
      ownerPin: '1111',
      token: 'secret',
      entityId: 'uuid',
    }),
  ).toBe('Tên: Cà phê · Số tiền: 5.000 ₫');
  expect(auditDescription(null)).toContain('Không có');
  expect(auditActionLabel('UNKNOWN')).not.toBe('UNKNOWN');
});
