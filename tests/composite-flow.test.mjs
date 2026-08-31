import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureComponentsStep } from '../src/domain/composite-flow.ts';
import { createEmptyTemplateConfig, templateConfigSchema } from '../src/schemas/template.ts';
import { createTemplate, publishTemplate } from '../src/services/template-service.ts';

const step = (code,type,sortOrder) => ({id:code,code,title:code,type,sortOrder,enabled:true,required:true,optionGroups:[]});
test('补齐组合入口保留独立步骤、量体配置，重复执行不重复创建',()=>{
  const config={...createEmptyTemplateConfig(),templateType:'composite',steps:[step('components','options',0),step('measurements','measurements',1),step('review','review',2)]};
  const original=config.steps.slice();
  ensureComponentsStep(config);ensureComponentsStep(config);
  assert.equal(config.steps.length,4);
  assert.equal(config.steps[0].type,'components');
  assert.equal(config.steps[0].code,'components_1');
  assert.deepEqual(config.steps.slice(1),original);
  templateConfigSchema.parse(config);
  config.steps[0].enabled=false;
  ensureComponentsStep(config);
  assert.equal(config.steps.length,4);assert.equal(config.steps[0].enabled,true);
});
test('组合模板可发布：组合入口 + 独立选项 + 量体 + 确认；缺失或重复入口给出准确错误',async()=>{
  const childConfig={...createEmptyTemplateConfig(),steps:[step('review','review',0)]};
  const child=await createTemplate({name:'child',category:'jacket',config:childConfig});
  await publishTemplate(child.id,{name:'child',code:'composite_test_child',category:'jacket',config:childConfig});
  const config={...createEmptyTemplateConfig(),templateType:'composite',components:[{id:'jacket',code:'jacket',name:'上衣',category:'jacket',childTemplateId:child.id,customizationEnabled:true,required:true,sortOrder:0}],steps:[step('extras','options',0),step('measurements','measurements',1),step('review','review',2)]};
  const parent=await createTemplate({name:'组合测试',category:'suit',config});
  const input={name:'组合测试',code:'composite_test_parent',category:'suit',config};
  await assert.rejects(publishTemplate(parent.id,input),/缺少组合入口/);
  ensureComponentsStep(config);
  const result=await publishTemplate(parent.id,input);
  assert.equal(result.status,'published');assert.equal(result.config.steps.length,4);
  config.steps.push(step('duplicate','components',4));
  await assert.rejects(publishTemplate(parent.id,input),/组合入口重复/);
});
