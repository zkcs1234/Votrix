import {expect,test} from 'vitest'
import {collectRows} from '../../src/foundation/collectRows.js'
test('complete reads follow the reported count even when a provider caps pages',async()=>{
 const rows=Array.from({length:7},(_,id)=>({id}))
 const result=await collectRows(()=>({range:async offset=>({data:rows.slice(offset,offset+2),count:rows.length,error:null})}))
 expect(result.data).toEqual(rows)
})
test('a changed record set cannot silently become a complete official input',async()=>{
 const result=await collectRows(()=>({range:async()=>({data:[],count:5,error:null})}))
 expect(result.error).not.toBeNull();expect(result.data).toBeNull()
})
