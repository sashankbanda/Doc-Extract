export const API_BASE = "http://localhost:8005";

export interface HighlightResponse {
    page: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export interface StatusResponse {
    status: string;
    detail?: string;
    whisper_hash: string;
}

export interface RetrieveResponse {
    result_text: string;
    line_metadata: any[]; // Using any[] for now as structure is complex list of lists
    confidence_metadata?: any;
    metadata?: any;
    whisper_hash: string;
    original_filename: string;
}

export interface UploadResponse {
    whisper_hash: string;
    file_name: string;
    mode_used: string;
}

export async function apiUpload(file: File): Promise<UploadResponse> {
    console.log("[API] Uploading file:", file.name, "size:", file.size);
    const fd = new FormData();
    fd.append("file", file);

    const response = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: fd,
    });

    console.log("[API] Upload response status:", response.status, response.statusText);

    if (!response.ok) {
        const error = await response.json();
        console.error("[API] Upload error:", error);
        throw new Error(error.detail || "Upload failed");
    }

    const data = await response.json();
    console.log("[API] Upload success, response:", data);
    return data;
}

export async function apiStatus(hash: string): Promise<StatusResponse> {
    console.log("[API] Checking status for hash:", hash);
    const response = await fetch(`${API_BASE}/status?whisper_hash=${hash}`);

    if (!response.ok) {
        const error = await response.json();
        console.error("[API] Status check error:", error);
        throw new Error(error.detail || "Failed to fetch status");
    }

    const data = await response.json();
    console.log("[API] Status response:", data);
    return data;
}

export async function apiRetrieve(hash: string): Promise<RetrieveResponse> {
    console.log("[API] Retrieving data for hash:", hash);
    const response = await fetch(`${API_BASE}/retrieve?whisper_hash=${hash}`);

    if (!response.ok) {
        const error = await response.json();
        console.error("[API] Retrieve error:", error);
        throw new Error(error.detail || "Failed to retrieve results");
    }

    const data = await response.json();
    console.log("[API] Retrieve success, result_text length:", data.result_text?.length, "line_metadata length:", data.line_metadata?.length);
    return data;
}

export async function apiHighlight(
    hash: string,
    line: number,
    width: number,
    height: number
): Promise<HighlightResponse> {
    console.log("[API] Getting highlight for hash:", hash, "line:", line, "dimensions:", width, "x", height);
    const response = await fetch(
        `${API_BASE}/highlight?whisper_hash=${hash}&line=${line}&target_width=${width}&target_height=${height}`
    );

    if (!response.ok) {
        const error = await response.json();
        console.error("[API] Highlight error:", error);
        throw new Error(error.detail || "Failed to fetch highlight");
    }

    const data = await response.json();
    console.log("[API] Highlight response:", data);
    return data;
}

// Flat, lossless item format from backend
export interface StructuredItem {
    // Original label as seen in the document
    source_key: string;
    // Canonical field name from mapping.md (e.g. "policyNumber"), if known
    canonical_name?: string | null;
    value: string;
    line_numbers: number[];
    semantic_type: string; // e.g., "claim.number", "claim.claimant", "policy.number", "unknown"
}

// Backend response: flat array of items
export interface StructuredDataResponse {
    whisper_hash: string;
    items: StructuredItem[]; // Flat array - all items preserved, no grouping
    metadata?: any;
}

// Frontend-organized format for UI display (built heuristically from items)
// Each key maps to an array of values (no merging, all preserved)
// Also carries the original flat items so downstream layout layers
// can reason about document structure without re-fetching from backend.
export interface OrganizedStructuredData {
    items: StructuredItem[];
    sections: {
        Claims?: Array<Record<string, Array<{ value: string; line_numbers: number[] }>>>;
        "Policy Info"?: Record<string, Array<{ value: string; line_numbers: number[] }>>;
        Summary?: Record<string, Array<{ value: string; line_numbers: number[] }>>;
        "Report Info"?: Record<string, Array<{ value: string; line_numbers: number[] }>>;
        Other?: Record<string, Array<{ value: string; line_numbers: number[] }>>;
    };
}

export async function getStructuredDocument(hash: string): Promise<StructuredDataResponse | null> {
    console.log("[API] Getting existing structured data for hash:", hash);
    const response = await fetch(`${API_BASE}/structure/${hash}`, {
        method: "GET",
    });

    if (response.status === 404) {
        // Structured data doesn't exist yet - this is normal
        return null;
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Failed to get structured document" }));
        console.error("[API] Get structured error:", error);
        throw new Error(error.detail || "Failed to get structured document");
    }

    const data = await response.json();
    console.log("[API] Get structured success, data:", data);
    return data;
}

export async function structureDocument(hash: string, model_id?: string, save: boolean = true): Promise<StructuredDataResponse> {
    console.log("[API] Structuring document for hash:", hash, "model:", model_id, "save:", save);
    let url = `${API_BASE}/structure/${hash}`;
    const params = new URLSearchParams();
    if (model_id) params.append("model_id", model_id);
    if (!save) params.append("save", "false");

    if (Array.from(params).length > 0) {
        url += `?${params.toString()}`;
    }

    const response = await fetch(url, {
        method: "POST",
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Failed to structure document" }));
        console.error("[API] Structure error:", error);
        throw new Error(error.detail || "Failed to structure document");
    }

    const data = await response.json();
    console.log("[API] Structure success, data:", data);
    return data;
}

export async function updateStructuredDocument(hash: string, items: StructuredItem[]): Promise<StructuredDataResponse> {
    console.log("[API] Updating structured data for hash:", hash);
    const response = await fetch(`${API_BASE}/structure/${hash}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ items }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Failed to update structured document" }));
        console.error("[API] Update structured error:", error);
        throw new Error(error.detail || "Failed to update structured document");
    }

    const data = await response.json();
    console.log("[API] Update structured success, data:", data);
    return data;
}

export async function apiResetSession(): Promise<any> {
    console.log("[API] Resetting session (clearing input/output files)");
    const response = await fetch(`${API_BASE}/admin/reset`, {
        method: "POST",
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Failed to reset session" }));
        console.error("[API] Reset session error:", error);
        throw new Error(error.detail || "Failed to reset session");
    }

    const data = await response.json();
    console.log("[API] Reset session success:", data);
    return data;
}

// Key Management API
export async function apiGetKeys(): Promise<Record<string, boolean>> {
    const response = await fetch(`${API_BASE}/keys`);
    if (!response.ok) throw new Error("Failed to fetch keys");
    return response.json();
}

export async function apiSetKey(provider: string, key: string): Promise<void> {
    const response = await fetch(`${API_BASE}/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key }),
    });
    if (!response.ok) throw new Error("Failed to set key");
}

export async function apiDeleteKey(provider: string): Promise<void> {
    const response = await fetch(`${API_BASE}/keys/${provider}`, {
        method: "DELETE",
    });
    if (!response.ok) throw new Error("Failed to delete key");
}
