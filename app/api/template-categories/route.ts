import { adminRoute } from "@/src/middleware/http";
import { parseCreateTemplateCategory } from "@/src/schemas/template-category";
import { createTemplateCategory, getTemplateCategories } from "@/src/services/template-category-service";
export async function GET(request:Request){return adminRoute(request,getTemplateCategories)}
export async function POST(request:Request){return adminRoute(request,async()=>createTemplateCategory(parseCreateTemplateCategory(await request.json())),{successStatus:201})}
