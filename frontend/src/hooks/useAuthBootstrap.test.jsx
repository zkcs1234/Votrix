import {StrictMode} from 'react'
import {render, act} from '@testing-library/react'
import {test, expect, vi} from 'vitest'
const state=vi.hoisted(()=>({refresh:vi.fn(),finish:vi.fn()}))
vi.mock('@/services/api',()=>({refreshSession:state.refresh}))
vi.mock('@/store/auth.store',()=>({useAuthStore:selector=>selector({finishBootstrap:state.finish})}))
import {useAuthBootstrap} from './useAuthBootstrap'
function Probe(){useAuthBootstrap();return null}
test('StrictMode remount completes only the current bootstrap effect',async()=>{
 let resolve;const shared=new Promise(r=>{resolve=r});state.refresh.mockReturnValue(shared)
 render(<StrictMode><Probe/></StrictMode>)
 await act(async()=>{resolve();await shared})
 expect(state.finish).toHaveBeenCalledTimes(1)
})
test('a rejected obsolete refresh does not clear a newly logged-in identity',async()=>{
 state.finish.mockClear();state.refresh.mockRejectedValue(new Error('Authentication identity changed during refresh'))
 render(<Probe/>);await act(async()=>{})
 expect(state.finish).toHaveBeenCalledTimes(1)
})
