import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { downloadCsv, downloadExcel } from './exportReport'

beforeEach(()=>vi.useFakeTimers())
afterEach(()=>{vi.runOnlyPendingTimers();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers()})

test('browser CSV download uses literal-safe text and retains numeric totals',()=>{
 let payload
 vi.stubGlobal('Blob',class {constructor(parts,options){payload={text:parts.join(''),type:options.type}}})
 vi.stubGlobal('URL',{createObjectURL:()=> 'blob:fixture',revokeObjectURL:vi.fn()})
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 downloadCsv('competition.csv',[{contestant:'=1+1',score:89.33},{contestant:'Pending',score:null}])
 expect(payload).toEqual({text:'"contestant","score"\n"\'=1+1","89.33"\n"Pending",""',type:'text/csv;charset=utf-8'})
 expect(click).toHaveBeenCalledTimes(1)
})

test('SpreadsheetML download keeps formula-looking names explicitly typed as text',()=>{
 let text
 vi.stubGlobal('Blob',class {constructor(parts){text=parts.join('')}})
 vi.stubGlobal('URL',{createObjectURL:()=> 'blob:fixture',revokeObjectURL:vi.fn()})
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 downloadExcel('competition',[{name:'Results',rows:[{contestant:'=1+1',score:89.33}]}])
 expect(text).toContain('<Data ss:Type="String">=1+1</Data>')
 expect(text).toContain('<Data ss:Type="Number">89.33</Data>')
 expect(text).not.toContain('ss:Formula')
})
