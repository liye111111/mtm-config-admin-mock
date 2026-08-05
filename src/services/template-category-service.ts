import type { CreateTemplateCategoryInput, UpdateTemplateCategoryInput } from "@/src/schemas/template-category";
import { AppError, NotFoundError } from "@/src/shared/errors";
import * as categories from "@/src/repositories/template-category-repository";

function view(row: NonNullable<Awaited<ReturnType<typeof categories.findCategory>>>) { return { id:row.id,code:row.code,name:row.name,sortOrder:row.sort_order,templateCount:Number(row.template_count ?? 0),createdAt:row.created_at,updatedAt:row.updated_at }; }
export async function getTemplateCategories() { return (await categories.listCategories()).map(view); }
export async function createTemplateCategory(input: CreateTemplateCategoryInput) { if(await categories.findCategoryByCode(input.code)) throw new AppError("品类编码已存在",409); return view(await categories.createCategory(input)); }
export async function saveTemplateCategory(id:string,input:UpdateTemplateCategoryInput) { const row=await categories.updateCategory(id,input); if(!row) throw new NotFoundError("品类不存在"); return view(row); }
export async function removeTemplateCategory(id:string) { const row=await categories.findCategory(id); if(!row) throw new NotFoundError("品类不存在"); if(Number(row.template_count)>0) throw new AppError(`该品类下已有 ${row.template_count} 个模板，不能删除`,409); await categories.deleteCategory(id); }
