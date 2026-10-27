/**
 * Safe HTTP & JSON response helpers for WorkshopTrack.
 * Prevents "Unexpected token 'A', \"A server e\"... is not valid JSON"
 * when reverse proxies, Vercel serverless functions, or gateways return
 * plain-text or HTML error pages instead of application/json.
 */

export class ApiResponseError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = 'ApiResponseError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const rawApiBase = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || ''
)
  .trim()
  .replace(/^['"]+|['"]+$/g, '');

const API_BASE_URL = rawApiBase.endsWith('/')
  ? rawApiBase.slice(0, -1)
  : rawApiBase;

if (import.meta.env.DEV && API_BASE_URL && !/^https?:\/\//i.test(API_BASE_URL)) {
  console.warn(
    '[WorkshopTrack Config Debug] VITE_API_BASE_URL sebaiknya diawali http:// atau https:// (atau dikosongkan untuk same-origin /api).'
  );
}

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

export function safeJsonParse<T = unknown>(raw: string): T | null {
  if (!raw || typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

function sanitizePlainTextSnippet(raw: string): string {
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

export function buildNonJsonErrorMessage(
  status: number,
  contentType: string,
  rawBody: string,
  endpointLabel: string
): string {
  const upper = rawBody.toUpperCase();
  const trimmed = rawBody.trimStart();

  // Detect Vercel serverless plain-text / platform errors ("A server error has occurred...")
  if (
    trimmed.startsWith('A server error has occurred') ||
    upper.includes('FUNCTION_INVOCATION_FAILED') ||
    upper.includes('FUNCTION_INVOCATION_TIMEOUT') ||
    upper.includes('NO_RESPONSE_FROM_FUNCTION') ||
    upper.includes('BODY_NOT_A_STRING_FROM_FUNCTION')
  ) {
    return `Terjadi gangguan pada server backend (${endpointLabel}, HTTP ${status}). Pastikan variabel environment database (SQL_HOST, SQL_PORT, SQL_USER, SQL_PASSWORD, SQL_DB_NAME, SQL_SSL) dan konfigurasi Firebase telah diatur dengan benar pada server deployment.`;
  }

  if (upper.includes('DEPLOYMENT_NOT_FOUND') || upper.includes('NOT_FOUND')) {
    return `Endpoint API (${endpointLabel}) tidak ditemukan di server (HTTP ${status}). Periksa konfigurasi routing API pada server atau vercel.json.`;
  }

  // Detect HTML responses (e.g. SPA index.html fallback or Nginx/Gateway error page)
  if (
    contentType.includes('text/html') ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html')
  ) {
    if (status >= 500) {
      return `Server mengalami gangguan internal (HTTP ${status}) saat mengakses ${endpointLabel}. Coba muat ulang beberapa saat lagi atau periksa log server.`;
    }
    return `Endpoint ${endpointLabel} mengembalikan halaman HTML bukan data JSON (HTTP ${status}). Pastikan backend API berjalan dan rewrite /api aktif.`;
  }

  const snippet = sanitizePlainTextSnippet(rawBody);
  if (status >= 500) {
    return snippet
      ? `Gangguan server (HTTP ${status}): ${snippet}`
      : `Terjadi kesalahan internal pada server backend (HTTP ${status}).`;
  }

  return snippet
    ? `Respons server bukan JSON yang valid (HTTP ${status}): ${snippet}`
    : `Format respons server tidak dikenali pada ${endpointLabel} (HTTP ${status}).`;
}

export async function parseSafeJsonResponse<T>(
  response: Response,
  endpointLabel: string
): Promise<T> {
  const status = response.status;
  const contentType = (
    response.headers.get('content-type') || ''
  ).toLowerCase();
  const rawBody = await response.text();

  if (import.meta.env.DEV) {
    if (!response.ok || !contentType.includes('application/json')) {
      console.warn('[WorkshopTrack HTTP Debug]', {
        endpoint: endpointLabel,
        status,
        ok: response.ok,
        contentType: contentType || '(kosong)',
        bodyPreview: sanitizePlainTextSnippet(rawBody),
      });
    }
  }

  if (!rawBody.trim()) {
    if (!response.ok) {
      throw new ApiResponseError(
        `Permintaan ke ${endpointLabel} gagal dengan status HTTP ${status} (respons kosong).`,
        status
      );
    }
    return {} as T;
  }

  const looksLikeJson =
    contentType.includes('application/json') ||
    contentType.includes('+json');

  if (!looksLikeJson) {
    const trimmed = rawBody.trim();
    const isJsonShape =
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'));

    if (!isJsonShape) {
      throw new ApiResponseError(
        buildNonJsonErrorMessage(status, contentType, rawBody, endpointLabel),
        status
      );
    }
  }

  const parsed = safeJsonParse<Record<string, unknown>>(rawBody);
  if (parsed === null) {
    throw new ApiResponseError(
      buildNonJsonErrorMessage(status, contentType, rawBody, endpointLabel),
      status
    );
  }

  if (!response.ok) {
    const serverMessage =
      (typeof parsed.error === 'string' && parsed.error.trim()) ||
      (typeof parsed.message === 'string' && parsed.message.trim()) ||
      `Permintaan ke ${endpointLabel} gagal (HTTP ${status}).`;
    const serverCode =
      typeof parsed.code === 'string' ? parsed.code : undefined;

    throw new ApiResponseError(serverMessage, status, serverCode);
  }

  return parsed as unknown as T;
}

const PATCHED_FLAG = '__workshopTrackSafeJsonPatched__';

/**
 * Guards global Response.prototype.json so even third-party SDKs or direct .json()
 * calls never throw raw V8 "Unexpected token 'A', \"A server e\"... is not valid JSON"
 * when a server or gateway returns plain-text or HTML errors.
 */
export function installGlobalJsonSafetyGuard(): void {
  if (typeof Response === 'undefined' || !Response.prototype) {
    return;
  }

  const proto = Response.prototype as Response & {
    [PATCHED_FLAG]?: boolean;
  };
  if (proto[PATCHED_FLAG]) {
    return;
  }

  Object.defineProperty(proto, PATCHED_FLAG, {
    value: true,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  proto.json = async function safeResponseJson(this: Response): Promise<unknown> {
    const status = this.status;
    const contentType = (this.headers?.get('content-type') || '').toLowerCase();
    const rawText = await this.text();
    const trimmed = rawText.trim();

    let endpointLabel = 'server';
    if (this.url) {
      try {
        const u = new URL(this.url);
        endpointLabel = u.pathname || this.url;
      } catch {
        endpointLabel = this.url;
      }
    }

    if (!trimmed) {
      if (!this.ok) {
        throw new ApiResponseError(
          `Permintaan ke ${endpointLabel} gagal dengan respons kosong (HTTP ${status}).`,
          status
        );
      }
      return {};
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      if (import.meta.env.DEV) {
        console.warn('[WorkshopTrack SafeJSON Guard] Respons non-JSON terdeteksi:', {
          endpoint: endpointLabel,
          status,
          contentType: contentType || '(kosong)',
          bodyPreview: sanitizePlainTextSnippet(rawText),
        });
      }
      throw new ApiResponseError(
        buildNonJsonErrorMessage(status, contentType, rawText, endpointLabel),
        status
      );
    }
  };
}
