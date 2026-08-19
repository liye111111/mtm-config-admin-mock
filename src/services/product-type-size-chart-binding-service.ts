import type { ProductTypeSizeChartBindingRow, ProductTypeSizeChartBindingView } from "@/src/domain";
import { AppError, NotFoundError } from "@/src/shared/errors";
import * as bindings from "@/src/repositories/product-type-size-chart-binding-repository";
import * as charts from "@/src/repositories/size-chart-repository";

function view(row: ProductTypeSizeChartBindingRow): ProductTypeSizeChartBindingView {
  return { id: row.id, productType: row.product_type, sizeChartId: row.size_chart_id, sizeChartName: row.size_chart_name ?? "", sizeChartCode: row.size_chart_code ?? "", createdAt: row.created_at, updatedAt: row.updated_at };
}

async function findRequiredChart(shopId: string, sizeChartId: string) {
  const chart = await charts.findSizeChart(sizeChartId, shopId);
  if (!chart) throw new NotFoundError("尺码表不存在");
  return chart;
}

async function requireBindableChart(shopId: string, sizeChartId: string) {
  const chart = await findRequiredChart(shopId, sizeChartId);
  if (!chart.current_version_id) throw new AppError("尺码表发布后才能绑定自定义分类", 409);
  if (chart.status !== "active") throw new AppError("已停用尺码表不能绑定自定义分类", 409);
  return chart;
}

export async function getProductTypeBindings(shopId: string, sizeChartId: string) {
  await findRequiredChart(shopId, sizeChartId);
  return (await bindings.listBindings(shopId)).map(view);
}

export async function addProductTypeBinding(shopId: string, sizeChartId: string, productType: string) {
  await requireBindableChart(shopId, sizeChartId);
  const existing = await bindings.findBindingByProductType(shopId, productType);
  if (existing) {
    if (existing.size_chart_id === sizeChartId) return view(existing);
    throw new AppError(`自定义分类“${productType}”已绑定尺码表“${existing.size_chart_name}”`, 409);
  }
  const row = await bindings.createBinding(shopId, sizeChartId, productType);
  if (!row) throw new AppError("自定义分类绑定失败", 500);
  return view(row);
}

export async function removeProductTypeBinding(shopId: string, sizeChartId: string, bindingId: string) {
  await findRequiredChart(shopId, sizeChartId);
  const result = await bindings.deleteBinding(bindingId, shopId, sizeChartId);
  if (!result.meta.changes) throw new NotFoundError("自定义分类绑定不存在");
}
