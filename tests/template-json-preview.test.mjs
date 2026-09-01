import test from 'node:test';
import assert from 'node:assert/strict';
import { storefrontTemplatePreview } from '../app/admin/template-json-preview.ts';
import { createEmptyTemplateConfig } from '../src/schemas/template.ts';
const view=(patch={})=>({id:'child-id',code:'child-code',name:'子模板',category:'jacket',categoryLabel:'西服',status:'published',version:3,schemaVersion:3,createdAt:'',updatedAt:'',config:{...createEmptyTemplateConfig(),steps:[]},...patch});
test('组合 JSON 预览展开已发布单品，保留草稿和失效引用 ID',()=>{
  const child=view();
  const draft=view({id:'parent',code:'parent-code',category:'suit',config:{...createEmptyTemplateConfig(),templateType:'composite',components:[
    {id:'a',code:'jacket',name:'上衣',category:'jacket',childTemplateId:child.id,customizationEnabled:true,required:true,sortOrder:0},
    {id:'b',code:'trousers',name:'西裤',category:'trousers',childTemplateId:'draft-id',customizationEnabled:true,required:true,sortOrder:1},
  ]}});
  const result=storefrontTemplatePreview(draft,[child,view({id:'draft-id',status:'draft'})]);
  assert.equal(result.templateId,'parent-code');
  assert.equal(result.components[0].template.templateId,'child-code');
  assert.equal(result.components[0].template.version,3);
  assert.equal(result.components[1].childTemplateId,'draft-id');
  assert.equal('template' in result.components[1],false);
  assert.equal('template' in draft.config.components[0],false);
});
