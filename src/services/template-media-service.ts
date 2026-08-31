import { z } from "zod";
import type { ImageReference, TemplateConfig } from "@/src/domain";
import { imageReferenceSchema, resolveFilesSchema } from "@/src/schemas/media";
import { parseWithSchema } from "@/src/schemas/parse";
import { queryShopifyFiles } from "@/src/integrations/shopify-admin";
import { AppError } from "@/src/shared/errors";

const responseSchema = z.object({
  data: z.object({ nodes: z.array(z.object({
    __typename: z.string(), id: z.string(), fileStatus: z.string().optional(), alt: z.string().nullable().optional(),
    image: z.object({ url: z.string(), altText: z.string().nullable().optional(), width: z.number(), height: z.number() }).nullable().optional(),
  }).nullable()) }).nullable().optional(),
  errors: z.array(z.object({ message: z.string(), extensions: z.object({ code: z.string().optional() }).passthrough().optional() })).optional(),
});

export function parseShopifyImages(payload: unknown, ids: string[]): ImageReference[] {
  const result = responseSchema.safeParse(payload);
  if (!result.success) throw new AppError("Shopify 图片响应格式无效", 502);
  if (result.data.errors?.length) {
    const denied = result.data.errors.some((error) => error.extensions?.code === "ACCESS_DENIED");
    throw new AppError(denied ? "缺少 Shopify 文件读取权限，请确认 read_files 授权及员工权限" : "Shopify 图片查询失败，请重试", denied ? 403 : 502);
  }
  const nodes = result.data.data?.nodes;
  if (!nodes || nodes.length !== ids.length) throw new AppError("Shopify 图片查询结果不完整", 502);
  return ids.map((id, index) => {
    const file = nodes[index];
    if (!file) throw new AppError(`图片不存在或不属于当前店铺：${id}`, 404);
    if (file.id !== id || file.__typename !== "MediaImage") throw new AppError("请选择当前店铺的图片文件", 422);
    if (file.fileStatus !== "READY" || !file.image) throw new AppError(`图片尚未就绪或处理失败，请稍后重选：${id}`, 422);
    const image = imageReferenceSchema.safeParse({ fileId: file.id, url: file.image.url, alt: file.alt || file.image.altText || "", width: file.image.width, height: file.image.height });
    if (!image.success) throw new AppError("Shopify 图片详情无效", 502);
    return image.data;
  });
}

export async function resolveImages(request: Request, shopId: string, input: unknown) {
  const { ids } = parseWithSchema(resolveFilesSchema, input);
  return parseShopifyImages(await queryShopifyFiles(request, shopId, ids), ids);
}

// 保存和发布时重新查询当前店铺，防止绕过选择器提交其他店铺文件或伪造 URL。
export async function canonicalizeTemplateImages(request: Request, shopId: string, config: TemplateConfig): Promise<TemplateConfig> {
  const refs = config.steps.flatMap((step) => [step.defaultPreviewImage, ...step.optionGroups.flatMap((group) => group.options.flatMap((option) => [option.displayImage, option.previewImage]))])
    .filter((image): image is ImageReference => Boolean(image));
  const ids = [...new Set(refs.map((image) => image.fileId))];
  if (ids.length > 250) throw new AppError("单个模板最多关联 250 张不同图片，请拆分模板", 422);
  const images = new Map<string, ImageReference>();
  for (let index = 0; index < ids.length; index += 50) {
    for (const image of await resolveImages(request, shopId, { ids: ids.slice(index, index + 50) })) images.set(image.fileId, image);
  }
  const lookup = (image?: ImageReference) => image ? images.get(image.fileId) : undefined;
  return { ...config, steps: config.steps.map((step) => ({ ...step,
    defaultPreviewImage: lookup(step.defaultPreviewImage),
    optionGroups: step.optionGroups.map((group) => ({ ...group, options: group.options.map((option) => ({ ...option,
      displayImage: lookup(option.displayImage), previewImage: lookup(option.previewImage),
    })) })),
  })) };
}
