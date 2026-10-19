import {test,expect,vi,beforeEach} from 'vitest'
const mocks=vi.hoisted(()=>({rulesFor:vi.fn(),organizerAction:vi.fn()}))
vi.mock('../../src/services/competition-workflow.service.js',()=>mocks)
import {startSession,completeSession} from '../../src/services/competition-session.service.js'
beforeEach(()=>vi.clearAllMocks())
test('new official session cannot start without acknowledged rules',async()=>{mocks.rulesFor.mockResolvedValue(null);await expect(startSession('e','owner')).rejects.toMatchObject({statusCode:409});expect(mocks.organizerAction).not.toHaveBeenCalled()})
test('ownership/preflight is delegated to the atomic session start operation',async()=>{mocks.rulesFor.mockResolvedValue({id:'v'});mocks.organizerAction.mockResolvedValue({id:'s',event_id:'e',status:'active',rules_version:'v'});await expect(startSession('e','owner')).resolves.toMatchObject({id:'s',eventId:'e',rulesVersion:'v'});expect(mocks.organizerAction).toHaveBeenCalledWith('e','owner','start')})
test('unavailable migration does not create a legacy session',async()=>{mocks.rulesFor.mockRejectedValue(new Error('migrations required'));await expect(startSession('e','owner')).rejects.toThrow('migrations');expect(mocks.organizerAction).not.toHaveBeenCalled()})
test('end-performance is separate from final event publication',async()=>{mocks.rulesFor.mockResolvedValue({id:'v'});mocks.organizerAction.mockResolvedValue({id:'s',event_id:'e',status:'completed'});await completeSession('e','owner');expect(mocks.organizerAction).toHaveBeenCalledWith('e','owner','end-performance')})
