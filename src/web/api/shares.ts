import { API_V1_SHARES } from "../../shared/api.js";
import {
  buildCreateShareBody,
  parseCreateShareResponse,
  parseGetShareResponse,
  type CreateShareResponse,
} from "../../shared/share-api.js";
import { type ShareId, type TtlSeconds } from "../../shared/limits.js";

export class ShareApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(status > 0 ? `share request failed (${status})` : "share request failed");
    this.name = "ShareApiError";
    this.status = status;
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
    throw new ShareApiError(response.status);
  }

  const parsed = parseCreateShareResponse(await response.json());
  if (!parsed) {
    throw new ShareApiError(0);
  }

  return parsed;
}

export async function getShare(id: string): Promise<Uint8Array | null> {
  const response = await fetch(`${API_V1_SHARES}/${id}`);
  if (!response.ok) {
    return null;
  }

  const parsed = parseGetShareResponse(await response.json());
  if (!parsed) {
    return null;
  }

  return parsed.envelope;
}

export type { CreateShareResponse, ShareId };
