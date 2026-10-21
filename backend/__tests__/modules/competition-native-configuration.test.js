import { expect, test } from 'vitest'
import { validateNativeConfiguration, nativeCriteriaReadiness } from '../../src/modules/competition-native-configuration.js'
const uid=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const single=(method='weighted_average')=>({structure:'single',rounds:[],criteria:[{id:uid(1),name:'Technique',roundId:null,percentage:100,minScore:1,maxScore:10,minorCriteria:[{id:uid(2),name:'Precision',minScore:1,maxScore:10}]}],scoringConfig:{calculationMethod:method,tiePolicy:'shared',decimalPlaces:2}})
test.each(['weighted_average','sum','rank_based','highest_score','lowest_removal','manual'])('preserves selection of existing %s method without calculating scores',method=>{
 const source=single(method),copy=structuredClone(source)
 expect(validateNativeConfiguration(source)).toEqual(copy);expect(source).toEqual(copy);expect(nativeCriteriaReadiness(source).allReady).toBe(true)
})
test('single phase retains NULL criterion scope and requires no fake round',()=>{
 const config=single();expect(validateNativeConfiguration(config).rounds).toEqual([])
 config.rounds=[{id:uid(3),name:'Fake',displayOrder:0}];expect(()=>validateNativeConfiguration(config)).toThrow('single phase has no rounds')
})
test('multiple-round setup requires at least two rounds',()=>{
 const config=single();config.structure='multiple';config.rounds=[{id:uid(3),name:'Final',displayOrder:0}];config.criteria[0].roundId=uid(3)
 expect(()=>validateNativeConfiguration(config)).toThrow('at least two named rounds')
 config.rounds.push({id:uid(4),name:'Preliminary',displayOrder:1})
 config.criteria.push({...config.criteria[0],id:uid(5),roundId:uid(4),minorCriteria:[{...config.criteria[0].minorCriteria[0],id:uid(6)}]})
 expect(validateNativeConfiguration(config).rounds).toHaveLength(2)
})
test('draft weights can be partial but readiness is incomplete in that scope',()=>{
 const config=single();config.criteria[0].percentage=50
 expect(validateNativeConfiguration(config)).toEqual(config);expect(nativeCriteriaReadiness(config).allReady).toBe(false)
 config.criteria[0].percentage=101;expect(()=>validateNativeConfiguration(config)).toThrow('positive percentage')
})
test('minor criteria retain equal-averaging rules, configured bounds and unique identities',()=>{
 const config=single();config.criteria[0].minorCriteria[0].weight=100
 expect(()=>validateNativeConfiguration(config)).toThrow('Unsupported configuration fields')
 delete config.criteria[0].minorCriteria[0].weight;config.criteria[0].minorCriteria[0].maxScore=1
 expect(()=>validateNativeConfiguration(config)).toThrow('valid existing score bounds')
})
test('overall minor percentages must match their major and are accepted as direct round weights',()=>{
 const cfg=single();cfg.criteria[0].percentage=30;cfg.scoringConfig.minorWeightBasis='overall'
 cfg.criteria[0].minorCriteria=[{id:uid(2),name:'Projection',minScore:1,maxScore:10,percentage:10},{id:uid(3),name:'Engagement',minScore:1,maxScore:10,percentage:10},{id:uid(4),name:'Technique',minScore:1,maxScore:10,percentage:10}]
 expect(validateNativeConfiguration(cfg)).toEqual(cfg);expect(nativeCriteriaReadiness(cfg).allReady).toBe(false)
 cfg.criteria[0].percentage=100;expect(()=>validateNativeConfiguration(cfg)).toThrow('total 100%')
})
test('major criterion may be scored directly without artificial minors',()=>{
 const config=single();config.criteria[0].minorCriteria=[]
 expect(validateNativeConfiguration(config).criteria[0].minorCriteria).toEqual([])
})
test('multiple rounds own separate criteria with explicit order and destination',()=>{
 const cfg=single();cfg.structure='multiple';cfg.rounds=[{id:uid(3),name:'Preliminary',displayOrder:0,advancementType:'top_n',advancementValue:3,nextRoundId:uid(4)},{id:uid(4),name:'Final',displayOrder:1}];cfg.criteria=[{...cfg.criteria[0],minorCriteria:[],roundId:uid(3)},{...cfg.criteria[0],id:uid(5),minorCriteria:[],roundId:uid(4)}]
 expect(nativeCriteriaReadiness(validateNativeConfiguration(cfg)).allReady).toBe(true)
 cfg.rounds[1].advancementType='manual';expect(()=>validateNativeConfiguration(cfg)).toThrow('last round cannot advance')
})
test('ordinal percentage carry and different round methods are rejected explicitly',()=>{
 const cfg=single('rank_based');cfg.structure='multiple';cfg.rounds=[{id:uid(3),name:'Preliminary',displayOrder:0,progression:'weighted',weight:20},{id:uid(4),name:'Final',displayOrder:1,progression:'weighted',weight:80}];cfg.criteria=[]
 expect(()=>validateNativeConfiguration(cfg)).toThrow('Ordinal placements')
 cfg.scoringConfig.calculationMethod='weighted_average';cfg.rounds[0].calculationMethod='sum';expect(()=>validateNativeConfiguration(cfg)).toThrow('Different round methods')
})
test('deduction units and parent scopes cannot be silently changed',()=>{
 const cfg=single('rank_based');cfg.scoringConfig.deductionRules=[{id:'offense',description:'Penalty',amount:5,units:'seconds'}]
 expect(()=>validateNativeConfiguration(cfg)).toThrow('method and unit semantics')
 cfg.scoringConfig.deductionRules[0].units='placements';cfg.scoringConfig.deductionRules[0].criteriaId=uid(99)
 expect(()=>validateNativeConfiguration(cfg)).toThrow('another criterion scope')
})
test('judge deduction mode and configured judge-owned rules persist through native validation',()=>{
 const cfg=single();cfg.scoringConfig.deductionMode='judge';cfg.scoringConfig.deductionRules=[{id:'late-start',description:'Late start',amount:2,units:'points',roundId:null,criteriaId:null,appliedBy:'judge',perViolation:false,maxOccurrences:1}]
 expect(validateNativeConfiguration(cfg)).toEqual(cfg)
})
test('unimplemented options are rejected instead of being ignored',()=>{
 const cfg=single();cfg.scoringConfig.perDivision=true
 expect(()=>validateNativeConfiguration(cfg)).toThrow('Unsupported configuration fields')
})
test('new input defaults and minor precision persist without changing historical defaults',()=>{
 const cfg=single();cfg.scoringConfig={...cfg.scoringConfig,inputDecimalPlaces:1,defaultMinScore:1,defaultMaxScore:10,singleRoundName:'Final Performance'};cfg.criteria[0].minorCriteria[0].decimalPlaces=2
 expect(validateNativeConfiguration(cfg)).toEqual(cfg)
 cfg.criteria[0].minorCriteria[0].decimalPlaces=7;expect(()=>validateNativeConfiguration(cfg)).toThrow('between 0 and 6')
 delete cfg.criteria[0].minorCriteria[0].decimalPlaces;cfg.scoringConfig.inputDecimalPlaces=1.5;expect(()=>validateNativeConfiguration(cfg)).toThrow('Invalid inputDecimalPlaces')
 cfg.scoringConfig.inputDecimalPlaces=1;cfg.scoringConfig.defaultMaxScore=1;expect(()=>validateNativeConfiguration(cfg)).toThrow('default score bounds')
})
test('points basis validates major maximums and allows guideline-only minors',()=>{
 const cfg=single()
 cfg.scoringConfig.criterionBasis='points'
 delete cfg.criteria[0].percentage
 delete cfg.criteria[0].minorCriteria[0].minScore
 delete cfg.criteria[0].minorCriteria[0].maxScore
 expect(validateNativeConfiguration(cfg)).toEqual(cfg)
 expect(nativeCriteriaReadiness(cfg).allReady).toBe(true)
})
test('duplicate names are rejected within a round or major scope without forbidding reuse in another round',()=>{
 const cfg=single();cfg.criteria[0].percentage=50;cfg.criteria.push({...cfg.criteria[0],id:uid(88),name:' technique ',minorCriteria:[]})
 expect(()=>validateNativeConfiguration(cfg)).toThrow('Major criterion names must be unique')
 cfg.criteria.pop();cfg.criteria[0].percentage=100;cfg.criteria[0].minorCriteria.push({...cfg.criteria[0].minorCriteria[0],id:uid(89),name:' PRECISION '})
 expect(()=>validateNativeConfiguration(cfg)).toThrow('Minor criterion names must be unique')
})
