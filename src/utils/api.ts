export const API_BASE = "http://localhost:8005";

export class ApiError extends Error {
    constructor(public message: string, public status?: number) {
        super(message);
    }
}

export const apiGet = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) {
        throw new ApiError(`Request failed with status ${res.status}`, res.status);
    }
    return res.json();
};

export const apiPost = async <T>(path: string, body: FormData | object): Promise<T> => {
    const headers: HeadersInit = {};
    let finalBody: BodyInit;

    if (body instanceof FormData) {
        finalBody = body;
        // Content-Type header auto-set by browser for FormData
    } else {
        headers['Content-Type'] = 'application/json';
        finalBody = JSON.stringify(body);
    }

    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers,
        body: finalBody
    });

    if (!res.ok) {
        let msg = `Request failed with status ${res.status}`;
        try {
            const errData = await res.json();
            if (errData.detail) msg = errData.detail;
        } catch { }
        throw new ApiError(msg, res.status);
    }
    return res.json();
};
