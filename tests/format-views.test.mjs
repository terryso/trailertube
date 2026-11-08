import test from 'node:test';
import assert from 'node:assert/strict';
import {formatViews} from '../src/format-views.js';
test('formats view counts without inventing missing counts',()=>{assert.equal(formatViews('22726332'),'22.7M views');assert.equal(formatViews('10000'),'10K views');assert.equal(formatViews('0'),'0 views');for(const x of [undefined,null,'','-2','1.5',NaN])assert.equal(formatViews(x),'')});
