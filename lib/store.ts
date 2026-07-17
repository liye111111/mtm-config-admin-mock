import { env } from "cloudflare:workers";

const seedConfig={buttonLabel:"开始定制",pricingMode:"none",steps:[{id:"fabric",code:"fabric_fit",title:"面料与版型",type:"variant"},{id:"jacket",code:"jacket",title:"西服上衣",type:"options"},{id:"trousers",code:"trousers",title:"西裤款式",type:"options"},{id:"measure",code:"measurements",title:"量体尺寸",type:"measurements"},{id:"review",code:"review",title:"配置确认",type:"review"}],measurementFields:[{code:"height",name:"身高",unit:"CM",min:140,max:210,step:1},{code:"weight",name:"体重",unit:"KG",min:40,max:180,step:1},{code:"sleeve_length",name:"袖长",unit:"CM",min:40,max:90,step:.5},{code:"trouser_length",name:"裤长",unit:"CM",min:80,max:130,step:.5},{code:"waist",name:"腰围",unit:"CM",min:50,max:160,step:.5}]};

export type TemplateRow={id:string;code:string;name:string;category:string;status:string;version:number;config_json:string;created_at:string;updated_at:string};
export function db(){if(!env.DB)throw new Error("D1 binding DB is unavailable");return env.DB}
export async function ensureDb(){const d=db();await d.batch([
 d.prepare("CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', version INTEGER NOT NULL DEFAULT 1, config_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
 d.prepare("CREATE TABLE IF NOT EXISTS template_versions (id TEXT PRIMARY KEY, template_id TEXT NOT NULL, version INTEGER NOT NULL, config_json TEXT NOT NULL, published_at TEXT NOT NULL, UNIQUE(template_id,version))"),
 d.prepare("CREATE TABLE IF NOT EXISTS product_bindings (id TEXT PRIMARY KEY, shopify_product_id TEXT NOT NULL UNIQUE, product_title TEXT NOT NULL, product_handle TEXT, template_id TEXT NOT NULL, published_version INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")]);
 const count=await d.prepare("SELECT COUNT(*) count FROM templates").first<{count:number}>();if(!count?.count){const now=new Date().toISOString();await d.batch([
 d.prepare("INSERT INTO templates VALUES (?,?,?,?,?,?,?,?,?)").bind("mens-suit-v1","mens_suit_v1","男士西服定制","西服","published",1,JSON.stringify(seedConfig),now,now),
 d.prepare("INSERT INTO template_versions VALUES (?,?,?,?,?)").bind("mens-suit-v1-v1","mens-suit-v1",1,JSON.stringify(seedConfig),now),
 d.prepare("INSERT INTO product_bindings VALUES (?,?,?,?,?,?,?,?)").bind("binding-poc","10296845205799","MTM POC 定制西服","mtm-poc-定制西服","mens-suit-v1",1,now,now)]);}}
export function serialize(row:TemplateRow){return{id:row.id,code:row.code,name:row.name,category:row.category,status:row.status,version:row.version,config:JSON.parse(row.config_json),createdAt:row.created_at,updatedAt:row.updated_at}}
