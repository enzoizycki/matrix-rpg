export class APIError extends Error {
  constructor(message: string, public code = "REQUEST_FAILED", public status = 0) {
    super(message);
    this.name = "APIError";
  }
}

export async function responseJSON<T>(response: Response): Promise<T> {
  let data: unknown;
  try { data = JSON.parse(await response.text()); } catch { data = null; }
  const object = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
  if (!response.ok || !object) {
    const fallback = response.status === 413
      ? "O envio ultrapassa o limite de tamanho. Envie até 50 MB no total."
      : [408, 504].includes(response.status)
        ? "O servidor demorou para responder. Tente novamente."
        : `Não foi possível concluir a operação (HTTP ${response.status}). Tente novamente.`;
    throw new APIError(typeof object?.error === "string" ? object.error : fallback,
      typeof object?.code === "string" ? object.code : "REQUEST_FAILED", response.status);
  }
  return object as T;
}

export async function requestJSON<T>(url: string, options: RequestInit = {}): Promise<T> {
  return responseJSON<T>(await fetch(url, { cache: "no-store", ...options }));
}

export function uploadForm<T>(url: string, form: FormData, signal: AbortSignal, onProgress: (percent: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    xhr.open("POST", url);
    xhr.timeout = 115_000;
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100));
    };
    xhr.upload.onload = () => onProgress(100);
    xhr.onload = () => {
      cleanup();
      responseJSON<T>(new Response(xhr.responseText, { status: xhr.status || 502 }))
        .then(resolve, reject);
    };
    xhr.onerror = () => { cleanup(); reject(new APIError("A conexão caiu durante o envio. Seu arquivo continua selecionado; tente novamente.", "NETWORK_ERROR")); };
    xhr.ontimeout = () => { cleanup(); reject(new APIError("O envio demorou além do limite. Tente um PDF menor ou verifique a conexão.", "UPLOAD_TIMEOUT")); };
    xhr.onabort = () => { cleanup(); reject(new APIError("Envio cancelado. Você pode tentar novamente.", "CANCELLED")); };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { cleanup(); reject(new APIError("Envio cancelado.", "CANCELLED")); return; }
    xhr.send(form);
  });
}
