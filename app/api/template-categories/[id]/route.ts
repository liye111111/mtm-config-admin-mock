import { route } from "@/src/middleware/http";
import { parseUpdateTemplateCategory } from "@/src/schemas/template-category";
import { removeTemplateCategory, saveTemplateCategory } from "@/src/services/template-category-service";
type Context={params:Promise<{id:string}>};
export async function PUT(request:Request,{params}:Context){const {id}=await params;return route(async()=>saveTemplateCategory(id,parseUpdateTemplateCategory(await request.json())))}
export async function DELETE(_request:Request,{params}:Context){const {id}=await params;return route(async()=>{await removeTemplateCategory(id);return null})}
