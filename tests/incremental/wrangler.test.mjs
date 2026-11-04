import test from 'node:test';import assert from 'node:assert/strict';import {runWrangler} from '../../incremental/wrangler.mjs';
test('captures a successful deployment receipt',async()=>{const output=await runWrangler(['-e','process.stdout.write("receipt")'],{command:process.execPath});assert.equal(output,'receipt')});
test('failure output is not exposed in error messages',async()=>{await assert.rejects(runWrangler(['-e','process.stderr.write("sensitive");process.exit(2)'],{command:process.execPath}),error=>error.message.includes('failed: 2')&&!error.message.includes('sensitive'))});
test('bounds process duration',async()=>{await assert.rejects(runWrangler(['-e','setInterval(()=>{},1000)'],{command:process.execPath,timeoutMs:30}),/timed out/)});
