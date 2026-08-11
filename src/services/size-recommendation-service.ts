import type { MockSizeRecommendationInput } from "@/src/schemas/storefront";
import { NotFoundError } from "@/src/shared/errors";
import * as templates from "@/src/repositories/template-repository";

export async function recommendMockSize(shopId: string, input: MockSizeRecommendationInput) {
  if (!await templates.findPublishedTemplateForProduct(shopId, input.productId)) throw new NotFoundError("商品没有已发布的定制配置");
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const recommendedSize = input.availableSizes[random[0] % input.availableSizes.length];
  return {
    mock: true,
    recommendationVersion: 1,
    recommendedSize,
    confidence: "mock" as const,
    basedOnMeasurements: Object.keys(input.measurements),
  };
}
