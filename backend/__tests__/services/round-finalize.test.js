import {test,expect,vi,beforeEach} from 'vitest'
const mocks=vi.hoisted(()=>({rulesFor:vi.fn(),organizerAction:vi.fn()}))
vi.mock('../../src/services/competition-workflow.service.js',()=>mocks)
import {finalizeRound} from '../../src/services/competition-session.service.js'
beforeEach(()=>vi.clearAllMocks())
test('legacy results cannot be overwritten by ordinary finalize or force',async()=>{mocks.rulesFor.mockResolvedValue(null);for(const options of [{},{force:true}])await expect(finalizeRound('e','owner','r',options)).rejects.toMatchObject({statusCode:409});expect(mocks.organizerAction).not.toHaveBeenCalled()})
test('versioned advancement requires a calculation identity and explicit context',async()=>{mocks.rulesFor.mockResolvedValue({id:'v'});mocks.organizerAction.mockResolvedValue({id:'decision'});await finalizeRound('e','owner','r',{calculationId:'verified',reason:'Reviewed qualifiers'});expect(mocks.organizerAction).toHaveBeenCalledWith('e','owner','advancement',expect.objectContaining({roundId:'r',calculationId:'verified'}))})
test('advancement transaction failure is returned without destructive fallback',async()=>{mocks.rulesFor.mockResolvedValue({id:'v'});mocks.organizerAction.mockRejectedValue(new Error('verified input stale'));await expect(finalizeRound('e','owner','r',{calculationId:'old'})).rejects.toThrow('stale')})
