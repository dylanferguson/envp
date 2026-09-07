import {
  buildCreateShareBody,
  parseCreateShareResponse,
  parseGetShareResponse,
  type CreateShareResponse,
} from "./share-api.js";
import { type ShareId, type TtlSeconds } from "../lib/limits.js";
import { formatHttpError } from "../lib/http-error.js";

const API_V1_SHARES = "/api/v1/shares";

export class ShareApiError extends Error {
  readonly status: number;
  readonly statusText: string;

  constructor(status: number, statusText = "") {
    super(formatHttpError(status, statusText));
    this.name = "ShareApiError";
    this.status = status;
    this.statusText = statusText;
  }
}

export async function createShare(
  envelope: Uint8Array,
  ttl: TtlSeconds,
): Promise<CreateShareResponse> {
  const response = await fetch(API_V1_SHARES, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: buildCreateShareBody(ttl, envelope),
  });

  if (!response.ok) {
    throw new ShareApiError(response.status, response.statusText);
  }

  const parsed = parseCreateShareResponse(await response.json());
  if (!parsed) {
    throw new ShareApiError(0);
  }

  return parsed;
}

export async function getShare(id: ShareId): Promise<Uint8Array | null> {
  const response = await fetch(`${API_V1_SHARES}/${id}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new ShareApiError(response.status, response.statusText);
  }

  const parsed = parseGetShareResponse(await response.json());
  if (!parsed) {
    return null;
  }

  return parsed.envelope;
}

export type { CreateShareResponse, ShareId };
