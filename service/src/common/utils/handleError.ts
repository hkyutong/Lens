import axios from 'axios';
import { sanitizeClientErrorMessage } from './sanitizeClientErrorMessage';

export function handleError(error: { response: { status: any }; message: string }) {
  const statusCode = Number(
    axios.isAxiosError(error) && error.response ? error.response.status : 0,
  );
  const rawMessage = axios.isAxiosError(error)
    ? (error.response?.data as any)?.message || error.message
    : error?.message;
  return sanitizeClientErrorMessage(rawMessage || '', statusCode);
}
