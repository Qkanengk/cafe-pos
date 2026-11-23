'use client';
import { useState, type FormEvent } from 'react';
import { Coffee, Plus, Circle, CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { adminSchemas, banks, type Resource } from '@/lib/admin-validation';
import { posFetch, RequestTimeoutError } from '@/lib/pos-fetch';

type Row = { id: string; name: string; [key: string]: unknown };
type Data = Partial<Record<Resource, Row[]>>;
type Field = {
  key: string;
  label: string;
  type?:
    | 'number'
    | 'password'
    | 'email'
    | 'url'
    | 'checkbox'
    | 'select'
    | 'textarea';
  options?: readonly (readonly [string, string])[];
  hint?: string;
};
const labels: Record<Resource, string> = {
  products: 'Món uống & bánh',
  categories: 'Danh mục',
  toppings: 'Topping',
  users: 'Nhân viên',
  settings: 'Cài đặt quán',
};
const singular: Record<Resource, string> = {
  products: 'món',
  categories: 'danh mục',
  toppings: 'topping',
  users: 'nhân viên',
  settings: 'cài đặt',
};
const formatPrice = (value: unknown) =>
  new Intl.NumberFormat('vi-VN').format(Number(value)) + ' ₫';
function initialValues(resource: Resource, row?: Row): Record<string, unknown> {
  const base = {
    name: '',
    sortOrder: 0,
    isAvailable: true,
    isActive: true,
    role: 'CASHIER',
    pin: '',
    password: '',
    price: 0,
    categoryId: '',
    S: 25000,
    M: 30000,
    L: 35000,
    Phần: 25000,
    portion: ((row?.variants ?? []) as { name: string }[]).some(
      (v) => v.name === 'Phần',
    ),
    ...row,
    email: row?.email ?? '',
    imageUrl: row?.imageUrl ?? '',
    toppingIds: ((row?.toppings ?? []) as { id: string }[]).map((t) => t.id),
  };
  if (resource === 'products' && row)
    for (const variant of (row.variants ?? []) as {
      name: string;
      price: number;
    }[])
      Object.assign(base, { [variant.name]: variant.price });
  return base;
}
export function AdminWorkspace({
  initialData,
  section,
}: {
  initialData: Data;
  section: 'menu' | 'staff' | 'settings';
}) {
  const resources: Resource[] =
    section === 'menu'
      ? ['products', 'categories', 'toppings']
      : section === 'staff'
        ? ['users']
        : ['settings'];
  const [resource, setResource] = useState<Resource>(resources[0]);
  const [data, setData] = useState(initialData);
  const [editing, setEditing] = useState<Row | undefined>(
    section === 'settings' ? initialData.settings?.[0] : undefined,
  );
  const [open, setOpen] = useState(section === 'settings');
  const [values, setValues] = useState<Record<string, unknown>>(
    initialValues(resources[0], initialData.settings?.[0]),
  );
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const categories = data.categories ?? [];
  const rows = data[resource] ?? [];
  const fields: Field[] =
    resource === 'categories'
      ? [
          { key: 'name', label: 'Tên danh mục' },
          {
            key: 'isActive',
            label: 'Hiển thị danh mục trên quầy',
            type: 'checkbox',
          },
          { key: 'sortOrder', label: 'Thứ tự hiển thị', type: 'number' },
        ]
      : resource === 'products'
        ? [
            { key: 'name', label: 'Tên món' },
            {
              key: 'categoryId',
              label: 'Danh mục',
              type: 'select',
              options: categories.map((c) => [c.id, c.name]),
            },
            {
              key: 'imageUrl',
              label: 'URL ảnh',
              hint: 'Ảnh công khai http/https hoặc ảnh tải từ thiết bị; PNG/JPEG/GIF/WebP tối đa 2 MB.',
            },
            { key: 'sortOrder', label: 'Thứ tự hiển thị', type: 'number' },
            {
              key: 'portion',
              label: 'Một phần (không chia size S/M/L)',
              type: 'checkbox',
            },
            ...(values.portion ? ['Phần'] : ['S', 'M', 'L']).map((key) => ({
              key,
              label: 'Giá size ' + key + ' (₫)',
              type: 'number' as const,
            })),
            { key: 'isAvailable', label: 'Đang bán', type: 'checkbox' },
          ]
        : resource === 'toppings'
          ? [
              { key: 'name', label: 'Tên topping' },
              { key: 'price', label: 'Giá (₫)', type: 'number' },
              { key: 'isAvailable', label: 'Đang bán', type: 'checkbox' },
            ]
          : resource === 'users'
            ? [
                { key: 'name', label: 'Tên nhân viên' },
                {
                  key: 'role',
                  label: 'Vai trò',
                  type: 'select',
                  options: [
                    ['CASHIER', 'Thu ngân'],
                    ['OWNER', 'Chủ quán'],
                  ],
                },
                {
                  key: 'email',
                  label: 'Email (bắt buộc với chủ quán)',
                  type: 'email',
                },
                {
                  key: 'pin',
                  label: editing ? 'PIN mới' : 'Mã PIN',
                  type: 'password',
                  hint: editing
                    ? 'Để trống để giữ nguyên PIN.'
                    : 'Nhập 4–6 chữ số.',
                },
                {
                  key: 'password',
                  label: editing ? 'Mật khẩu mới' : 'Mật khẩu chủ quán',
                  type: 'password',
                  hint: '8–72 ký tự. Để trống để giữ nguyên khi chỉnh sửa.',
                },
                { key: 'isActive', label: 'Đang hoạt động', type: 'checkbox' },
              ]
            : [
                { key: 'name', label: 'Tên quán' },
                { key: 'address', label: 'Địa chỉ' },
                {
                  key: 'bankBin',
                  label: 'Ngân hàng',
                  type: 'select',
                  options: banks.map(([bin, name]) => [
                    bin,
                    name + ' · ' + bin,
                  ]),
                },
                { key: 'bankAccount', label: 'Số tài khoản' },
                { key: 'bankAccountName', label: 'Tên chủ tài khoản' },
                {
                  key: 'receiptFooter',
                  label: 'Lời nhắn cuối hóa đơn',
                  type: 'textarea',
                },
                {
                  key: 'receiptWidth',
                  label: 'Khổ giấy in',
                  type: 'select',
                  options: [
                    ['58', '58 mm'],
                    ['80', '80 mm'],
                  ],
                },
              ];
  function edit(row?: Row) {
    setEditing(row);
    setValues(initialValues(resource, row));
    setError('');
    setOpen(true);
  }
  async function mutate(method: string, body: unknown) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await posFetch('/api/admin/' + resource, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? 'Không thể lưu dữ liệu');
      const refreshed = await posFetch('/api/admin/' + resource);
      if (!refreshed.ok)
        throw new Error(
          'Đã lưu nhưng chưa thể tải lại. Vui lòng tải lại trang.',
        );
      const next = await refreshed.json();
      setData((prev) => ({
        ...prev,
        [resource]: resource === 'settings' ? [next] : next,
      }));
      setNotice(
        method === 'DELETE' ? 'Đã xóa thành công.' : 'Đã lưu thay đổi.',
      );
      if (section !== 'settings') setOpen(false);
    } catch (e) {
      setError(
        e instanceof RequestTimeoutError
          ? 'Máy chủ không phản hồi sau 12 giây. Thay đổi có thể đã được lưu; hãy tải lại danh sách để kiểm tra trước khi lưu lại, tránh tạo bản ghi trùng.'
          : e instanceof Error
            ? e.message
            : 'Không thể kết nối máy chủ.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const payload =
      resource === 'products'
        ? {
            ...values,
            prices: values.portion
              ? { Phần: values['Phần'] }
              : { S: values.S, M: values.M, L: values.L },
          }
        : values;
    const parsed = adminSchemas[resource].safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(' · '));
      return;
    }
    if (resource === 'users' && !editing && !values.pin) {
      setError('Nhân viên mới cần mã PIN.');
      return;
    }
    await mutate(editing || resource === 'settings' ? 'PUT' : 'POST', {
      ...parsed.data,
      ...(editing ? { id: editing.id } : {}),
    });
  }
  const filtered = rows.filter(
    (row) =>
      row.name
        .toLocaleLowerCase('vi')
        .includes(query.toLocaleLowerCase('vi')) &&
      (!categoryFilter ||
        resource !== 'products' ||
        row.categoryId === categoryFilter),
  );
  const form = (
    <form onSubmit={save} className="space-y-5">
      {resource === 'products' && (
        <label className="block space-y-2">
          <span>Tải ảnh từ thiết bị (tối đa 2 MB)</span>
          <Input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 2 * 1024 * 1024) {
                setError('Ảnh không được quá 2 MB.');
                return;
              }
              setBusy(true);
              setError('');
              try {
                const form = new FormData();
                form.set('file', file);
                const response = await posFetch('/api/admin/images', {
                  method: 'POST',
                  body: form,
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error);
                setValues((current) => ({
                  ...current,
                  imageUrl: data.imageUrl,
                }));
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : 'Không thể tải ảnh.',
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      )}
      <div
        className={
          section === 'settings' ? 'grid gap-5 sm:grid-cols-2' : 'space-y-5'
        }
      >
        {resource === 'products' && (
          <fieldset>
            <legend className="mb-2 font-semibold">
              Topping cho phép (không chọn = không topping)
            </legend>
            <div className="flex flex-wrap gap-3">
              {(data.toppings ?? []).map((t) => (
                <label key={t.id} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={(values.toppingIds as string[]).includes(t.id)}
                    onChange={(e) =>
                      setValues({
                        ...values,
                        toppingIds: e.target.checked
                          ? [...(values.toppingIds as string[]), t.id]
                          : (values.toppingIds as string[]).filter(
                              (id) => id !== t.id,
                            ),
                      })
                    }
                  />
                  {t.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {fields.map((field) => (
          <label
            key={field.key}
            className={
              'block text-sm font-medium ' +
              (field.type === 'textarea' ? 'sm:col-span-2' : '')
            }
          >
            <span className="mb-2 block">{field.label}</span>
            {field.type === 'checkbox' ? (
              <span className="flex min-h-12 items-center gap-3 rounded-xl border border-stone-200 px-4">
                <input
                  type="checkbox"
                  aria-label={field.label}
                  className="h-6 w-6 accent-emerald-800"
                  checked={!!values[field.key]}
                  onChange={(e) =>
                    setValues({ ...values, [field.key]: e.target.checked })
                  }
                />{' '}
                {values[field.key] ? 'Có' : 'Không'}
              </span>
            ) : field.type === 'select' ? (
              <select
                aria-label={field.label}
                className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3"
                value={String(values[field.key] ?? '')}
                onChange={(e) =>
                  setValues({
                    ...values,
                    [field.key]:
                      field.key === 'receiptWidth'
                        ? Number(e.target.value)
                        : e.target.value,
                  })
                }
              >
                <option value="">Chọn…</option>
                {field.options?.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                aria-label={field.label}
                className="min-h-28 w-full rounded-xl border border-stone-300 p-3"
                value={String(values[field.key] ?? '')}
                onChange={(e) =>
                  setValues({ ...values, [field.key]: e.target.value })
                }
              />
            ) : ['price', 'S', 'M', 'L', 'Phần'].includes(field.key) ? (
              <MoneyInput
                aria-label={field.label}
                value={String(values[field.key] ?? '')}
                onValueChange={(value) =>
                  setValues({ ...values, [field.key]: value })
                }
              />
            ) : (
              <Input
                aria-label={field.label}
                type={field.type ?? 'text'}
                value={String(values[field.key] ?? '')}
                min={field.type === 'number' ? 0 : undefined}
                step={field.type === 'number' ? 1 : undefined}
                autoComplete={
                  field.type === 'password' ? 'new-password' : undefined
                }
                onChange={(e) =>
                  setValues({
                    ...values,
                    [field.key]:
                      field.type === 'number'
                        ? e.target.value === ''
                          ? ''
                          : Number(e.target.value)
                        : e.target.value,
                  })
                }
              />
            )}
            {field.hint && (
              <span className="mt-2 block text-xs font-normal text-stone-500">
                {field.hint}
              </span>
            )}
          </label>
        ))}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      <div className="sticky bottom-0 flex gap-3 border-t border-stone-100 bg-white py-4">
        <Button disabled={busy} type="submit">
          {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
        </Button>
        {section !== 'settings' && (
          <Button
            type="button"
            disabled={busy}
            className="bg-stone-100 text-stone-700 hover:bg-stone-200"
            onClick={() => {
              setOpen(false);
              setError('');
            }}
          >
            Hủy
          </Button>
        )}
      </div>
    </form>
  );
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-emerald-800">
            Quản lý quán
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            {section === 'menu'
              ? 'Thực đơn'
              : section === 'staff'
                ? 'Nhân viên'
                : 'Cài đặt quán'}
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            {section === 'menu'
              ? 'Chăm chút từng món, sẵn sàng cho mỗi ca bán.'
              : section === 'staff'
                ? 'Quản lý quyền truy cập và tài khoản tại quầy.'
                : 'Thông tin quán, chuyển khoản và mẫu hóa đơn.'}
          </p>
        </div>
        {section !== 'settings' && (
          <Button onClick={() => edit()}>
            <Plus size={20} className="mr-2" aria-hidden="true" />
            Thêm {singular[resource]}
          </Button>
        )}
      </header>
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}
      {section === 'settings' ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-6">
          {form}
        </section>
      ) : (
        <>
          <div
            className="flex flex-wrap gap-2 border-b border-stone-200 pb-3"
            role="tablist"
            aria-label="Nhóm quản lý"
          >
            {resources.map((key) => (
              <button
                role="tab"
                aria-selected={resource === key}
                key={key}
                className={
                  'min-h-12 rounded-xl px-5 font-semibold ' +
                  (resource === key
                    ? 'bg-emerald-800 text-white'
                    : 'bg-white text-stone-600')
                }
                onClick={() => {
                  setResource(key);
                  setQuery('');
                  setCategoryFilter('');
                  setError('');
                  setNotice('');
                }}
              >
                {labels[key]}{' '}
                <span className="ml-2 opacity-70">
                  {data[key]?.length ?? 0}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="min-w-48 flex-1">
              <Input
                aria-label="Tìm kiếm"
                placeholder={'Tìm ' + singular[resource] + '…'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {resource === 'products' && (
              <select
                aria-label="Lọc danh mục"
                className="min-h-12 rounded-xl border border-stone-300 bg-white px-4"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">Tất cả danh mục</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {error && !open && (
            <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
              {error}
            </p>
          )}
          <div
            className={
              'grid gap-4 ' +
              (resource === 'products' ? 'lg:grid-cols-2' : 'sm:grid-cols-2')
            }
          >
            {filtered.map((row) => (
              <article
                key={row.id}
                className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    {resource === 'products' && (
                      <div
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-amber-50 bg-cover bg-center text-2xl"
                        style={
                          row.imageUrl
                            ? {
                                backgroundImage:
                                  'url(' + JSON.stringify(row.imageUrl) + ')',
                              }
                            : undefined
                        }
                      >
                        {!row.imageUrl && (
                          <Coffee size={28} aria-hidden="true" />
                        )}
                      </div>
                    )}
                    <div>
                      <h2 className="text-lg font-bold">{row.name}</h2>
                      <p className="mt-1 text-sm text-stone-500">
                        {resource === 'products'
                          ? categories.find((c) => c.id === row.categoryId)
                              ?.name
                          : resource === 'users'
                            ? row.role === 'OWNER'
                              ? 'Chủ quán'
                              : 'Thu ngân'
                            : resource === 'categories'
                              ? 'Thứ tự: ' +
                                row.sortOrder +
                                (row.isActive
                                  ? ' · Đang hiển thị'
                                  : ' · Đã ẩn khỏi quầy')
                              : formatPrice(row.price)}
                      </p>
                    </div>
                  </div>
                  <button
                    className="min-h-12 rounded-lg px-3 font-semibold text-emerald-800 hover:bg-emerald-50"
                    onClick={() => edit(row)}
                  >
                    Sửa
                  </button>
                </div>
                {resource === 'products' && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {((row.variants ?? []) as { name: string; price: number }[])
                      .slice()
                      .sort(
                        (a, b) =>
                          ['S', 'M', 'L'].indexOf(a.name) -
                          ['S', 'M', 'L'].indexOf(b.name),
                      )
                      .map((variant) => (
                        <span
                          className="rounded-lg bg-stone-100 px-3 py-2 text-sm"
                          key={variant.name}
                        >
                          <b className="mr-2 text-stone-500">{variant.name}</b>
                          {formatPrice(variant.price)}
                        </span>
                      ))}
                  </div>
                )}
                {resource === 'users' && (
                  <p className="mt-3 break-all text-sm text-stone-500">
                    {String(row.email ?? 'Chưa có email')} ·{' '}
                    {row.isActive ? 'Đang hoạt động' : 'Đã ngừng hoạt động'}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
                  {resource === 'products' || resource === 'toppings' ? (
                    <button
                      disabled={busy}
                      aria-label={
                        (row.isAvailable ? 'Đánh dấu hết hàng ' : 'Mở bán ') +
                        row.name
                      }
                      onClick={() =>
                        mutate('PATCH', {
                          id: row.id,
                          isAvailable: !row.isAvailable,
                        })
                      }
                      className={
                        'min-h-12 rounded-xl px-4 text-sm font-semibold ' +
                        (row.isAvailable
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-amber-100 text-amber-900')
                      }
                    >
                      {row.isAvailable ? (
                        <CircleCheck
                          size={16}
                          className="mr-2 inline"
                          aria-hidden="true"
                        />
                      ) : (
                        <Circle
                          size={16}
                          className="mr-2 inline"
                          aria-hidden="true"
                        />
                      )}
                      {row.isAvailable ? 'Đang bán' : 'Hết hàng'}
                    </button>
                  ) : (
                    <span className="text-xs text-stone-400">
                      {resource === 'users'
                        ? 'PIN được bảo mật'
                        : 'Hiển thị theo thứ tự tăng dần'}
                    </span>
                  )}
                  <button
                    disabled={busy}
                    className="min-h-12 px-3 text-sm text-red-700"
                    onClick={() => {
                      if (
                        window.confirm(
                          'Xóa ' + row.name + '? Thao tác không thể hoàn tác.',
                        )
                      )
                        void mutate('DELETE', { id: row.id });
                    }}
                  >
                    Xóa
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!filtered.length && (
            <div className="rounded-2xl border border-dashed border-stone-300 p-12 text-center text-stone-500">
              Chưa có dữ liệu phù hợp. Thêm {singular[resource]} để bắt đầu.
            </div>
          )}
          {open && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-3"
              role="dialog"
              aria-modal="true"
              aria-labelledby="editor-title"
            >
              <section className="max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white px-6 pt-6 shadow-xl">
                <h2 id="editor-title" className="mb-6 text-2xl font-bold">
                  {editing ? 'Chỉnh sửa' : 'Thêm'} {singular[resource]}
                </h2>
                {form}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
