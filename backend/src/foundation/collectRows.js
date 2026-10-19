// Preserve completeness when a provider caps a page below our requested size.
export async function collectRows(createQuery, pageSize=500) {
  const rows=[]
  for(let offset=0;;){
    const {data,error,count}=await createQuery().range(offset,offset+pageSize-1)
    if(error)return {data:null,error}
    const page=data??[];rows.push(...page);offset+=page.length
    if(count!=null&&offset>=count||count==null&&page.length<pageSize)return {data:rows,error:null}
    if(!page.length)return {data:null,error:{message:'STALE_RECORD_SET: Refresh before calculating'}}
  }
}
