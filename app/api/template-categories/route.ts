import { route } from "@/src/middleware/http";
import { parseCreateTemplateCategory } from "@/src/schemas/template-category";
import { createTemplateCategory, getTemplateCategories } from "@/src/services/template-category-service";
export async function GET(){return route(getTemplateCategories)}
export async function POST(request:Request){return route(async()=>createTemplateCategory(parseCreateTemplateCategory(await request.json())),{successStatus:201})}
