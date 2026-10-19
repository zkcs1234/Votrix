import {readFileSync,writeFileSync} from 'node:fs'
const original=readFileSync('backend/scripts/test-competition-phase9-browser-extended.mjs','utf8');let s=original.slice(0,original.indexOf(' const dashboard='))
s+=`
 for(const carry of ['back_to_zero','carry_forward','weighted']){
  console.log('Browser carry '+carry);const c=id(),pre=id(),final=id(),criteria=[{id:id(),roundId:pre,name:'Pre technique',percentage:100,minScore:0,maxScore:10,minorCriteria:[]},{id:id(),roundId:final,name:'Final technique',percentage:100,minScore:0,maxScore:10,minorCriteria:[]}]
  namedRpc('competition_create_child',{p_event:event,p_actor:owner,p_id:c,p_name:'Browser '+carry,p_type:null});namedRpc('competition_add_entry',{p_event:event,p_competition:c,p_actor:owner,p_entry:master,p_number:null})
  const cfg={structure:'multiple',rounds:[{id:pre,name:'Preliminary',displayOrder:0,progression:carry==='weighted'?'weighted':'back_to_zero',...(carry==='weighted'?{weight:50}:{}),advancementType:'none',nextRoundId:final},{id:final,name:'Final',displayOrder:1,progression:carry,...(carry==='weighted'?{weight:50}:{})}],criteria,scoringConfig:{calculationMethod:'weighted_average',decimalPlaces:2,tiePolicy:'shared'}}
  namedRpc('competition_save_native_configuration',{p_event:event,p_competition:c,p_actor:owner,p_revision:array('competitions',\`id='\${c}'\`)[0].setup_revision,p_config:cfg});for(const ep of [enrollment,enrollment2])namedRpc('competition_assign_native_judge',{p_event:event,p_competition:c,p_actor:owner,p_participant:ep,p_round:null,p_remove:false})
  const current=array('competitions',\`id='\${c}'\`)[0];namedRpc('competition_freeze_native_rules',{p_event:event,p_competition:c,p_actor:owner,p_setup:current.setup_revision,p_input:current.input_revision})
  const live=await tab(owner,'live'),j1=await tab(judge,'judge'),j2=await tab(judge2,'judge'),tabulation=await tab(owner,'tabulation');for(const page of [live,j1,j2,tabulation]){await field(page,'Competition',c);await field(page,'Round',c+':'+pre)}
  let review
  for(const [index,round]of[pre,final].entries()){
   if(index)for(const page of [live,j1,j2,tabulation,review])await field(page,'Round',c+':'+round)
   await click(live,'Start scoring');await openGates(live)
   for(const [page,score]of[[j1,index?6:7],[j2,index?7:8]]){await wait(page,\`!!document.querySelector('input[type="number"]:not(:disabled)')\`);await evaluate(page,\`(()=>{const n=document.querySelector('input[type="number"]:not(:disabled)');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'\${score}');n.dispatchEvent(new Event('input',{bubbles:true}))})()\`);await click(page,'Lock');await click(page,'Submit Round');await wait(page,\`document.body.innerText.includes('Round submitted')\`)}
   await click(live,'Close scoring');if(!index){await field(tabulation,'Independent reviewer',reviewEnrollment);await click(tabulation,'Appoint reviewer');review=await tab(reviewer,'review');await field(review,'Competition',c);await field(review,'Round',c+':'+pre)}
   await click(tabulation,'Calculate official results');await field(review,'Review reason','Independent carry source verification');await click(review,'Verify calculation');await field(tabulation,'Review reason','Explicit finalized carry basis');await click(tabulation,'Finalize official calculation')
   const snapshot=rpc('competition_child_tabulation_snapshot',literal(event),literal(c),literal(owner),literal(round),'false');assert.equal(snapshot.calculation.output_snapshot.results[0].finalScore,index?({back_to_zero:65,carry_forward:140,weighted:70})[carry]:75)
   if(!index){await click(tabulation,'Review qualification');await click(tabulation,'Confirm reviewed qualifiers');await wait(tabulation,\`!document.body.innerText.includes('Confirm qualifier roster')&&!document.querySelector('[role="alert"]')\`)}
  }
  scenarios.push('Actual Preliminary/Final browser controls calculate '+carry+' with unchanged engine and confirmed roster');for(const page of [live,j1,j2,tabulation,review])await call('Page.close',{},page)
 }
 assert.deepEqual(JSON.parse(sql(\`BEGIN TRANSACTION READ ONLY;\${catalog}ROLLBACK;\`,template)),source)
 writeFileSync(path.join(out,'browser-carry.json'),JSON.stringify({passed:true,database,scenarios,requestCount:requests.length,setup:'Reviewed SQL RPC fixture configuration; live/scoring/qualification/tabulation/review/finalization use actual browser UI',hosted:false,syntheticJwtIssuance:true,localPostgrestAdapter:true},null,2));console.log('PASS all three compatible carry browser journeys')
`
s+=original.slice(original.indexOf('}finally{'));writeFileSync('backend/scripts/test-competition-phase9-browser-carry.mjs',s,{flag:'wx'})
