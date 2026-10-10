import { createServerFn } from "@tanstack/react-start";
import { gatewayFetch, type PaddleEnv } from "@/lib/paddle.server";
import { PADDLE_PRICE_BY_TIER } from "@/lib/plans";

const ALLOWED_PRICE_IDS = new Set<string>(Object.values(PADDLE_PRICE_BY_TIER));

export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .inputValidator((data: { priceId: string; environment: PaddleEnv }) => {
    if (!ALLOWED_PRICE_IDS.has(data?.priceId)) throw new Error("Unknown plan price.");
    if (data.environment !== "sandbox" && data.environment !== "live")
      throw new Error("Invalid environment.");
    return data;
  })
  .handler(async ({ data }) => {
    const response = await gatewayFetch(
      data.environment,
      `/prices?external_id=${encodeURIComponent(data.priceId)}`,
    );
    const result = (await response.json()) as { data?: Array<{ id: string }> };
    if (!result.data?.length) throw new Error("Price not found");
    return result.data[0]!.id;
  });
