import { describe, expect, test } from 'vitest'
import { csvCell, serializeCsv } from '../../../shared/csv-export.js'

describe('spreadsheet CSV text safety', () => {
  test.each(['=1+1','+SUM(1,2)','-2+3','@SUM(1,2)',' \t=1+1','\uFEFF=1+1','\tordinary text','\rtext'])('exports potentially interpreted text as a literal: %j', value => {
    expect(csvCell(value)).toBe(`"'${value}"`)
  })
  test('preserves actual numeric score values, valid zero, blank incomplete cells and CSV escaping', () => {
    expect(serializeCsv([{name:'A "quoted", entry',score:-3.25,zero:0,missing:null},{name:'Second',score:90,zero:0,missing:undefined}]))
      .toBe('"name","score","zero","missing"\n"A ""quoted"", entry","-3.25","0",""\n"Second","90","0",""')
  })
  test('protects dynamic headers and handles later row fields', () => {
    expect(serializeCsv([{'=1+1':'safe'},{'other':'value'}])).toBe('"\'=1+1","other"\n"safe",""\n"","value"')
    expect(serializeCsv([])).toBe('')
  })
})
