import {expect,test} from 'vitest'
import {competitionRetryDelay} from './competitionRetry'
test('retry delay handles server seconds/date, missing and malformed headers with bounded values',()=>{expect(competitionRetryDelay({response:{headers:{'retry-after':'60'}}})).toBe(60000);expect(competitionRetryDelay({response:{headers:{'retry-after':'invalid'}}})).toBe(15000);expect(competitionRetryDelay({response:{headers:{'retry-after':'-2'}}})).toBe(1000);expect(competitionRetryDelay({response:{headers:{'retry-after':'999999'}}})).toBe(3600000)})
