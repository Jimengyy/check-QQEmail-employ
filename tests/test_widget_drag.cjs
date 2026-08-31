const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../client/widget/drag.js'), 'utf8');

function fixture(moveOverride) {
    const frames = [], moves = [], errors = [], windowEvents = {};
    const window = {addEventListener: (name, fn) => windowEvents[name] = fn};
    function region() {
        const handlers = {}, captured = new Set(), classes = new Set();
        return {
            handlers, captured, classes,
            classList: {add: name => classes.add(name), remove: name => classes.delete(name)},
            addEventListener: (name, fn) => handlers[name] = fn,
            setPointerCapture: id => captured.add(id),
            hasPointerCapture: id => captured.has(id),
            releasePointerCapture: id => captured.delete(id),
            emit(name, x = 0, y = 0, extras = {}) {
                handlers[name]({pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1,
                    screenX: x, screenY: y, target: {closest: () => null}, preventDefault() {}, ...extras});
            },
        };
    }
    const regions = Array.from({length: 5}, region);
    vm.runInNewContext(source, {window, requestAnimationFrame: fn => {frames.push(fn); return frames.length;}});
    window.setupWidgetDragging({regions, enabled: () => true,
        move: (x, y) => {moves.push([x, y]); return moveOverride?.(x, y);}, onError: error => errors.push(error)});
    const flush = async () => {while (frames.length) await frames.shift()();};
    return {regions, moves, errors, frames, windowEvents, flush};
}

test('title and all four edges preserve complete movement, including release coordinates', async () => {
    const f = fixture();
    for (const r of f.regions) {
        r.emit('pointerdown', 100, 100);
        r.emit('pointermove', 110, 120);
        r.emit('pointerup', 115, 125, {buttons: 0});
        await f.flush();
        assert.equal(r.captured.size, 0);
        assert.equal(r.classes.size, 0);
    }
    assert.deepEqual(f.moves, Array(5).fill([15, 25]));
});

test('stationary hold, small jitter, right click and interactive controls do not move window', async () => {
    const f = fixture(), r = f.regions[0];
    r.emit('pointerdown', 0, 0);
    r.emit('pointermove', 1, 1);
    r.emit('pointerup', 1, 1, {buttons: 0});
    r.emit('pointerdown', 0, 0, {button: 2});
    r.emit('pointermove', 30, 30);
    r.emit('pointerdown', 0, 0, {target: {closest: () => ({tagName: 'BUTTON'})}});
    r.emit('pointermove', 30, 30);
    await f.flush();
    assert.deepEqual(f.moves, []);
});

test('pointer cancellation, capture loss, blur and missed mouseup discard queued motion', async () => {
    for (const reason of ['pointercancel', 'lostpointercapture', 'blur', 'mouseupOutside']) {
        const f = fixture(), r = f.regions[1];
        r.emit('pointerdown'); r.emit('pointermove', 20, 20);
        if (reason === 'blur') f.windowEvents.blur();
        else if (reason === 'mouseupOutside') r.emit('pointermove', 50, 50, {buttons: 0});
        else r.emit(reason);
        await f.flush();
        assert.deepEqual(f.moves, [], reason);
        assert.equal(r.captured.size, 0);
    }
});

test('slow native bridge serializes calls and coalesces subsequent deltas', async () => {
    let resolve;
    const f = fixture(() => new Promise(r => {resolve = r;})), region = f.regions[2];
    region.emit('pointerdown'); region.emit('pointermove', 10, 10);
    const first = f.frames.shift()();
    region.emit('pointermove', 20, 20); region.emit('pointerup', 30, 30, {buttons: 0});
    assert.equal(f.moves.length, 1);
    resolve(); await first;
    const second = f.frames.shift()();
    assert.deepEqual(f.moves, [[10, 10], [20, 20]]);
    resolve(); await second;
});

test('native bridge failure releases capture and permits a later gesture', async () => {
    const f = fixture(() => {throw new Error('bridge unavailable');}), r = f.regions[3];
    r.emit('pointerdown'); r.emit('pointermove', 20, 20);
    await f.flush();
    assert.equal(f.errors.length, 1);
    assert.equal(r.captured.size, 0);
    r.emit('pointerdown'); assert.equal(r.captured.size, 1);
});
