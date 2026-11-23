export class RequestTimeoutError extends TypeError {
  constructor() {
    super(
      'Máy chủ không phản hồi sau 12 giây. Đơn chưa bị xóa; hãy thử lại với cùng mã đơn/thanh toán.',
    );
    this.name = 'RequestTimeoutError';
  }
}
export async function posFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = (async () => {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.text();
    return new Response(
      [204, 205, 304].includes(response.status) ? null : body,
      {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      },
    );
  })();
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new RequestTimeoutError());
      controller.abort();
    }, 12000);
  });
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
