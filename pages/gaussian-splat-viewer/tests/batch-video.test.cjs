const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const source = read('camera-path.js') + '\n' + read('batch-video.js');
const context = extra => vm.createContext({ assert, console, AbortController, DOMException, WritableStream, ...extra });

test('folder selection includes nested splats, ignores other files, and exceeds 100 without truncation', () => {
    vm.runInContext(source + `
        const files = Array.from({length:105}, (_, i) => ({name: 'model'+i+'.PLY', webkitRelativePath:'folder/sub/model'+i+'.PLY'}));
        files.push({name:'notes.txt'}, {name:'video.mp4'});
        const entries = batchEntries(files);
        assert.equal(entries.length,105);
        assert.equal(entries[2].name,'model2.PLY');
        assert.equal(entries[104].name,'model104.PLY');
        assert.notEqual(batchVideoName({name:'same.splat'},0),batchVideoName({name:'same.splat'},1));
    `, context());
});

test('105-file queue loads one model at a time, saves before next load, and continues after a bad file', async () => {
    let resident = 0, finished = 0;
    const controller = new AbortController();
    const options = {
        signal: controller.signal,
        async load(entry) { assert.equal(resident,0); resident++; if (entry.id === 'batch-3') throw new Error('Malformed splat'); },
        async render(entry, index) { assert.equal(resident,1); return `${index}.mp4`; },
        async unload() { resident = 0; },
        async progress(entry, index, result, results) {
            if (!result) assert.equal(finished,index);
            else { assert.equal(resident,0); assert.equal(results.length,index+1); finished++; }
        }
    };
    const result = await vm.runInContext(source + `processBatch(batchEntries(Array.from({length:105},(_,i)=>({name:'model'+i+'.splat'}))), options)`, context({options}));
    assert.equal(result.length,105);
    assert.equal(result.filter(r => r.status === 'saved').length,104);
    assert.equal(result[3].status,'failed');
    assert.equal(resident,0);
});

test('cancellation unloads the active model and never starts the next one', async () => {
    const controller = new AbortController();
    let loads = 0, unloads = 0;
    const options = {
        signal:controller.signal,
        async load() { loads++; controller.abort(); },
        async render() { assert.fail('must not render after cancellation'); },
        async unload() { unloads++; }, async progress() {}
    };
    await assert.rejects(vm.runInContext(source + `processBatch(batchEntries([{name:'a.ply'},{name:'b.ply'}]),options)`, context({options})), {name:'AbortError'});
    assert.equal(loads,1); assert.equal(unloads,1);
});

for (const success of [true,false]) test(`streamed MP4 ${success ? 'commits only when complete' : 'aborts and removes the partial file'}`, async () => {
    const events = [];
    const directory = {
        async getFileHandle(name) { return { async createWritable() { return { async write(chunk) { events.push('write'); }, async close() { events.push('commit'); }, async abort() { events.push('abort'); } }; } }; },
        async removeEntry(name) { events.push('remove:'+name); }
    };
    const media = { StreamTarget: class { constructor(stream) { this.stream = stream; } } };
    const output = await vm.runInContext(source + `batchOutput(media,directory,'0001-a.mp4')`, context({media,directory}));
    const writer = output.target.stream.getWriter();
    await writer.write({type:'write',data:new Uint8Array([1,2]),position:0});
    await writer.close();
    assert.deepEqual(events,['write']); // Closing/cancelling the muxer must not commit.
    if (success) { await output.commit(); assert.deepEqual(events,['write','commit']); }
    else { await output.discard(); assert.deepEqual(events,['write','abort','remove:0001-a.mp4']); }
});

test('output-folder permission or disk errors stop the batch instead of skipping every file', async () => {
    const media = {};
    const directory = { async getFileHandle() { throw new Error('Permission denied'); } };
    await assert.rejects(vm.runInContext(source + `batchOutput(media,directory,'a.mp4')`,context({media,directory})), error => error.batchFatal === true);
});
