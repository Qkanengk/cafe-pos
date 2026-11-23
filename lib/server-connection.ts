import { posFetch } from './pos-fetch';
export async function serverConnection() {
  if (!navigator.onLine)
    return { online: false, error: 'Thiết bị đang ngoại tuyến.' };
  try {
    const response = await posFetch('/api/health', { cache: 'no-store' });
    if (!response.ok)
      return {
        online: false,
        error:
          response.status === 401
            ? 'Phiên đăng nhập đã hết hạn. Kết nối và đăng nhập lại.'
            : 'Không thể kết nối máy chủ. Đơn trên thiết bị vẫn được giữ.',
      };
    return { online: true, error: '' };
  } catch {
    return {
      online: false,
      error: 'Máy chủ không phản hồi. Đơn trên thiết bị vẫn được giữ.',
    };
  }
}
