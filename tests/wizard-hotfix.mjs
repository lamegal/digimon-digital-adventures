// Run with: node --experimental-vm-modules tests/wizard-hotfix.mjs
// Real wizard/progression modules; Foundry application and document APIs are simulated.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

if (!vm.SourceTextModule) throw new Error('Run with --experimental-vm-modules');
const root = new URL('../', import.meta.url);
let assertions = 0;
const equal = (a,b,message) => { assert.equal(a,b,message); assertions++; };
const ok = (a,message) => { assert.ok(a,message); assertions++; };
const dictionaries = Object.fromEntries(['en','pt-BR'].map(lang => [lang,JSON.parse(fs.readFileSync(new URL(`lang/${lang}.json`,root)))]));
class App extends EventTarget { static emittedEvents = ['render','close']; _onRender() {} }
const context = vm.createContext({
  console, structuredClone, Event, EventTarget,
  foundry:{applications:{api:{ApplicationV2:App,HandlebarsApplicationMixin:x=>x}},utils:{deepClone:structuredClone,getProperty:(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o)}},
  game:{user:{isGM:true},i18n:{lang:'en',localize:key=>dictionaries.en[key] ?? key,format:(key,data)=>Object.entries(data).reduce((s,[k,v])=>s.replaceAll(`{${k}}`,v),dictionaries.en[key] ?? key)}},
  CONFIG:{DDA:{stages:{adult:{stageValue:3},child:{stageValue:2},baby1:{stageValue:1}}}},
  ui:{notifications:{warn(){},info(){}}}
});
const modules=new Map();
let offeredApp, savedSnapshot, openFailure = false, openCalls=0;
async function load(relative, importedNames=[]) {
  const url=new URL(relative,root), key=url.href;
  if(modules.has(key)) return modules.get(key);
  const real=['scripts/wizard/dda-digimon-wizard.js','scripts/rules/tamer-progression.js','scripts/apps/dda-partner-bonus-dp.js'].includes(relative);
  let module;
  if(real) {
    module=new vm.SourceTextModule(fs.readFileSync(url,'utf8'),{context,identifier:key,
      importModuleDynamically:async(specifier,ref)=>{
        // Simulate only the app-opening boundary; run the wizard event handling unchanged.
        if(specifier.endsWith('/dda-partner-bonus-dp.js')) {
          const m=new vm.SyntheticModule(['openPartnerBonusDpAdvancement'],function(){this.setExport('openPartnerBonusDpAdvancement',async()=>{openCalls++;if(openFailure)throw Error('open failed');return offeredApp;});},{context});
          await m.link(()=>{});await m.evaluate();return m;
        }
        throw Error('Unexpected dynamic import '+specifier);
      }});
  } else {
    module=new vm.SyntheticModule(importedNames,function(){for(const n of importedNames)this.setExport(n,n==='savePartnerFutureFormSnapshot'?async payload=>{savedSnapshot=payload.snapshot;}:n.startsWith('DDA_')?[]:()=>{});},{context,identifier:key});
  }
  modules.set(key,module);
  await module.link(async(specifier,ref)=>{
    const target=new URL(specifier,ref.identifier);
    const code=fs.readFileSync(new URL(ref.identifier),'utf8');
    const match=[...code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)].find(m=>m[2]===specifier);
    const names=match?match[1].split(',').map(n=>n.trim().split(/\s+as\s+/)[0]).filter(Boolean):[];
    return load(fileURLToPath(target).slice(fileURLToPath(root).length),names);
  });
  return module;
}
const wizardModule=await load('scripts/wizard/dda-digimon-wizard.js');await wizardModule.evaluate();
const Wizard=wizardModule.namespace.DDADigimonWizard;
const allocationModule=await load('scripts/apps/dda-partner-bonus-dp.js');await allocationModule.evaluate();
const keys=['accuracy','damage','dodge','armor','health'];
const statMap=(values={})=>Object.fromEntries(keys.map(k=>[k,values[k]??0]));
function makeWizard() {
  const w=Object.create(Wizard.prototype);
  w.mode='formSnapshot';w.rendered=true;w.steps=['stats','qualities','summary'];w.stepIndex=0;
  w.formContext={bonusDpTotal:0,tamerActor:{uuid:'Actor.tamer'},partnerActor:{system:{advancement:{bonusDp:{total:10},sharedStatBonus:statMap({accuracy:2}),sharedQualityDp:{allocated:5}}}}};
  w.data={stage:'adult',dp:{},stats:{},identity:{name:'Test',species:'Test'},derivedStatsPreview:{},qualities:{positive:[{cost:8}],negative:[]},validation:{errors:[],warnings:[]},statAllocation:Object.fromEntries(keys.map(k=>[k,{base:3,spent:k==='accuracy'?7:5,sharedBonus:k==='accuracy'?2:0,total:k==='accuracy'?10:8}]))};
  // Isolate budget behavior from unrelated catalog choice requirements.
  w._getStageOptions=()=>[{key:'adult',startingDp:25,negativeLimit:5},{key:'baby1',startingDp:0,negativeLimit:0}];
  w._getCoreDiscountBase=()=>0;w._recalculateQualityCosts=()=>({used:0,remaining:0});
  w._getSelectedQualityRequirementErrors=()=>[];w._getSelectedQualityIncompatibilityErrors=()=>[];
  w._ensureCompatibilityIdentityResolved=()=>{};w._usesInitialFormBuildsForMechanicalState=()=>false;
  w.renders=0;w._renderPreservingScroll=()=>{w.renders++;w._recalculateStageData();w._validate();};
  return w;
}
const w=makeWizard();
equal(w._getFormBonusDpAllocation().total,10,'cached context zero must not hide granted bonus');
w._recalculateStageData();equal(w.data.dp.remaining,-3);equal(w.data.dp.bonusUnallocated,3);
w.formContext.partnerActor.system.advancement.sharedQualityDp.allocated=8;
w._recalculateStageData();equal(w.data.dp.remaining,0,'allocating the three remaining quality DP unblocks the form');equal(w.data.dp.bonusUnallocated,0);
equal(w._canAdvance(),true);
w.formContext.partnerActor.system.advancement.sharedStatBonus.accuracy=4;
w.formContext.partnerActor.system.advancement.bonusDp.total=12;
w._recalculateStageData();equal(w.data.statAllocation.accuracy.total,12);equal(w.data.statAllocation.accuracy.localSpent,5);equal(w.data.dp.remaining,0);
w._recalculateStageData();equal(w.data.statAllocation.accuracy.total,12,'repeat render must not apply shared DP twice');
w.formContext.partnerActor.system.advancement.sharedStatBonus.accuracy=1;
w._recalculateStageData();equal(w.data.statAllocation.accuracy.total,9);equal(w.data.statAllocation.accuracy.localSpent,5);
const legacy=makeWizard();legacy.formContext.partnerActor.system.advancement.bonusDp.total=0;legacy.formContext.partnerActor.system.creation={bonusDp:10};
equal(legacy._getFormBonusDpAllocation().total,10,'legacy granted bonus remains available');
const jogress=makeWizard();jogress.formContext.bonusDpProfile={total:20,sharedStats:statMap({damage:3}),qualityAllocated:12};
equal(jogress._getFormBonusDpAllocation().total,20);equal(jogress._getFormBonusDpAllocation().unallocated,5);
const overspent=makeWizard();overspent.data.qualities.positive=[];overspent.data.statAllocation.damage.spent=8;overspent._recalculateStageData();
equal(overspent.data.dp.remaining,-3,'reserved Quality DP must not fund local Stat purchases');equal(overspent._canAdvance(),true);
const cap=makeWizard();cap.data.statAllocation.accuracy.spent=17;cap._recalculateStageData();equal(cap.data.statAllocation.accuracy.total,20);
cap.formContext.partnerActor.system.advancement.sharedStatBonus.accuracy=4;cap._recalculateStageData();cap._validate();
equal(cap.data.statAllocation.accuracy.localSpent,15,'preserve unsaved local points, including cap conflicts');equal(cap.data.statAllocation.accuracy.total,22);equal(cap._canAdvance(),true);
ok(cap.data.validation.warnings.some(e=>e.includes('above 20')),'explain the cap conflict instead of silently discarding points');
const baby=makeWizard();baby.data.stage='baby1';baby.data.statAllocation=Object.fromEntries(keys.map(k=>[k,{spent:0,sharedBonus:0}]));baby.data.qualities.positive=[];baby._recalculateStageData();equal(baby.data.dp.sharedStatTotal,0);equal(baby.data.dp.sharedQualityAllocated,0);
const creating=makeWizard();creating.mode='creation';equal(creating._getFormBonusDpAllocation().total,0);

// Save/cancel/reopen lifecycle in the real async action, with a fake allocation app.
const event={preventDefault(){}};const live=makeWizard();offeredApp=new App();
await Promise.all([live._onAllocateFormBonus(event),live._onAllocateFormBonus(event)]);equal(openCalls,1,'double click opens once');
offeredApp.dispatchEvent(new Event('render'));equal(live.renders,0,'unchanged draft is not committed');
live.formContext.partnerActor.system.advancement.sharedQualityDp.allocated=8;offeredApp.dispatchEvent(new Event('render'));equal(live.renders,1);equal(live.data.dp.remaining,0);
live.formContext.partnerActor.system.advancement.sharedStatBonus.accuracy=4;live.formContext.partnerActor.system.advancement.bonusDp.total=12;offeredApp.dispatchEvent(new Event('render'));equal(live.data.statAllocation.accuracy.total,12);
offeredApp.dispatchEvent(new Event('close'));equal(live.renders,2,'close must not duplicate a saved allocation');equal(live._bonusAllocationOpen,false);
live.formContext.partnerActor.system.advancement.sharedStatBonus.accuracy=5;offeredApp.dispatchEvent(new Event('render'));equal(live.renders,2,'listener is removed on close');
offeredApp=new App();await live._onAllocateFormBonus(event);live.rendered=false;live.formContext.partnerActor.system.advancement.sharedStatBonus.accuracy=6;offeredApp.dispatchEvent(new Event('close'));equal(live.renders,2,'allocation must not reopen a closed wizard');
const cancel=makeWizard();offeredApp=new App();await cancel._onAllocateFormBonus(event);offeredApp.dispatchEvent(new Event('close'));equal(cancel.data.statAllocation.accuracy.spent,7);equal(cancel.renders,0);
openFailure=true;const failed=makeWizard();await assert.rejects(()=>failed._onAllocateFormBonus(event),/open failed/);assertions++;equal(failed._bonusAllocationOpen,false);openFailure=false;

// Actual progression window input handler uses the same total as its header.
const BonusApp=allocationModule.namespace.DDAPartnerBonusDpAdvancement;const bonus=Object.create(BonusApp.prototype);
bonus.partnerActor=legacy.formContext.partnerActor;bonus._draft={sharedStatBonus:statMap({accuracy:2}),qualityAllocated:5};
const input={value:'8',max:'8',addEventListener(type,fn){this.listener=fn;}};
const totalNode={textContent:''};bonus.element={querySelectorAll:()=>[],querySelector:s=>s==='[data-bonus-quality]'?input:s==='[data-bonus-unallocated]'?totalNode:null};
bonus._onRender({},{});input.listener({currentTarget:input});equal(bonus._draft.qualityAllocated,8,'legacy bonus can actually be assigned in the allocation UI');equal(totalNode.textContent,'0');

const evolution=fs.readFileSync(new URL('scripts/combat/evolution.js',root),'utf8');
const expr=evolution.match(/const totalBonusDp = requestedBonusProfile[\s\S]*?: standardBonusDp\);/)[0];
for(const [value,expected] of [[null,10],[undefined,10],[0,0],[5,5]]) equal(vm.runInNewContext(expr+'totalBonusDp',{requestedBonusProfile:null,options:{bonusDpTotal:value},standardBonusDp:10}),expected);
// Save the edited form through the real snapshot builder, preserving the grant
// and attacks. Only the final Foundry persistence boundary is mocked.
const save=makeWizard();save.stepIndex=2;save.formContext.partnerActor.uuid='Actor.partner';save.formContext.partnerActor.name='Partner';
save.formContext.snapshot={sourceFormUuid:'Actor.adult'};save.formContext.formTemplateActor={uuid:'Actor.adult',name:'Adult',system:{stage:'adult'}};
save.formContext.partnerActor.system.advancement.sharedQualityDp.allocated=8;
save._syncInputsFromHtml=()=>{};save._isFutureFormWizard=()=>true;
save._getFutureFormAttackItems=()=>[{_id:'attack1',type:'attack',name:'Thunder Ball',system:{range:'ranged'}}];
save._buildQualityItemDataFromSelection=q=>({type:'quality',name:'Quality',system:{cost:q.cost}});
save.close=()=>{};await save._onSaveFormSnapshot(event);
equal(savedSnapshot.sourceFormUuid,'Actor.adult');equal(savedSnapshot.creation.dp.bonus,10);
equal(savedSnapshot.creation.dp.sharedQualityAllocated,8);equal(savedSnapshot.creation.dp.spentBaseStats,25);
equal(savedSnapshot.mainStats.accuracy.base,10);equal(savedSnapshot.items[0]._id,'attack1');equal(savedSnapshot.items[0].system.range,'ranged');

// An incomplete, over-budget form is still saved; attacks and signed balance survive.
save.data.statAllocation.damage.spent+=7;save.formContext.partnerActor.system.advancement.sharedQualityDp.allocated=10;
await save._onSaveFormSnapshot(event);equal(savedSnapshot.creation.dp.remaining,-7);equal(save.data.validation.errors.length,0);
ok(save.data.validation.warnings.length>0);equal(savedSnapshot.items[0]._id,'attack1');

// Buying and ranking a Quality must both work with a negative budget.
const purchase=makeWizard();purchase.data.qualities.positive=[];purchase.data.statAllocation.damage.spent+=5;
purchase.formContext.partnerActor.system.advancement.sharedQualityDp.allocated=0;
const quality={id:'budget-test',name:'Budget Test',kind:'positive',tier:'starting',baseCost:2,perRank:true,rank:{value:1,max:3}};
purchase._getAvailableQualities=()=>[quality];purchase._checkQualityAvailability=()=>({available:true});purchase._getQualityEffectiveMaxForWizard=()=>3;
purchase._getQualityIncompatibilityConflict=()=>null;purchase._getDigizoidGainForceRequirementFailure=()=>null;purchase._getQualityRequirementFailure=()=>null;
purchase._getQualityPurchaseCostInfo=()=>({effectiveCost:2});purchase._getQualityRankIncreaseCostInfo=()=>({effectiveCost:2});
purchase._calculateSelectedQualityCost=(_q,rank)=>2*rank;purchase._getQualityFullCost=(_q,rank)=>2*rank;
purchase._getQualityAvailabilityLabel=()=>'';purchase._getQualityCostLabel=()=>'';purchase._getQualityOriginalNameForDisplay=()=>'';purchase._getQualityRankLabel=()=>'';
purchase._recalculateStageData();equal(purchase.data.dp.remaining,-5);equal(purchase._prepareQualityForBrowser(quality).canBuy,true);
const buyEvent={preventDefault(){},currentTarget:{dataset:{qualityId:'budget-test'}}};
await purchase._onAddQuality(buyEvent);equal(purchase.data.qualities.positive.length,1);equal(purchase.data.dp.remaining,-7);
await purchase._onAddQuality(buyEvent);equal(purchase.data.qualities.positive[0].rank.value,2);equal(purchase.data.dp.remaining,-9);

// Reproduce the reported -5 base-DP form and use the real allocation save/sync path.
const progression=modules.get(new URL('scripts/rules/tamer-progression.js',root).href).namespace;
const partner={uuid:'Actor.symbare',type:'digimon',name:'Symbare Angoramon',isOwner:true,system:{stage:'adult',stageValue:3,
 mainStats:Object.fromEntries(keys.map(k=>[k,{base:9,bonus:0,qualityBonus:0}])),
 advancement:{bonusDp:{total:6},sharedStatBonus:statMap(),sharedQualityDp:{allocated:0}},
 creation:{dp:{base:25,spentBaseStats:30,spentBaseQualities:0}},evolution:{formSnapshots:{}}},
 async update(changes){for(const [path,value] of Object.entries(changes)){const bits=path.split('.');let o=this;for(const k of bits.slice(0,-1))o=o[k]??={};o[bits.at(-1)]=value;}}};
equal(progression.getPartnerBonusDpFormStatus(partner).forms[0].baseRemaining,-5);
let result=await progression.updatePartnerBonusDpAllocation(partner,{sharedStatBonus:statMap(),qualityAllocated:6});
equal(result.ok,true);equal(result.needsReview,true);equal(partner.system.advancement.sharedQualityDp.allocated,6);
equal(result.forms[0].baseRemaining,-5,'keep the discrepancy visible');
result=await progression.updatePartnerBonusDpAllocation(partner,{sharedStatBonus:statMap(),qualityAllocated:9});
equal(result.ok,true);equal(result.needsReview,true);equal(partner.system.advancement.sharedQualityDp.allocated,9,'do not silently trim user allocation');
equal(progression.getPartnerBonusDpAllocation(partner).qualityAllocated,9);
context.game.user.isGM=false;partner.isOwner=false;
result=await progression.updatePartnerBonusDpAllocation(partner,{qualityAllocated:1});equal(result.ok,false,'document ownership is still required');
equal(partner.system.advancement.sharedQualityDp.allocated,9);context.game.user.isGM=true;
// The UI also retains a manually entered allocation above the nominal budget.
input.value='13';input.listener({currentTarget:input});equal(bonus._draft.qualityAllocated,13);

const template=fs.readFileSync(new URL('templates/wizard/digimon-wizard.hbs',root),'utf8');
const literalKeys=[...template.matchAll(/{{localize "([^"]+)"/g)].map(m=>m[1]);
for(const [lang,dictionary] of Object.entries(dictionaries)) {
 ok(literalKeys.every(k=>typeof dictionary[k]==='string'),`${lang}: all wizard template keys exist`);
 for(const key of ['FormAttacksHint','AllocateBonus','AllocateBonusHint','SharedStatsOverCap']) ok(dictionary['DDA.DigimonWizard.'+key],`${lang}: ${key}`);
}
console.log(`${assertions} regression assertions passed (actual wizard and progression modules; simulated Foundry APIs).`);
