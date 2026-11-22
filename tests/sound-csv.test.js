import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
import { SOUND_DATA } from '../audio/sound-data.js';
import { SOUND_PARAMETERS, parseSounds, serializeSounds, validateParameter } from '../audio/sound-csv.js';
import { buildSounds } from '../scripts/build-sounds.mjs';

test('unmodified editor export preserves the full CSV exactly', async () => {
    const original = await readFile(new URL('../sounds.csv', import.meta.url), 'utf8');
    assert.equal(serializeSounds(SOUND_DATA), original);
});

test('multi-effect edits round trip with units and metadata intact', () => {
    const data = structuredClone(SOUND_DATA);
    const originalDuration = SOUND_DATA.shot.noiseDuration.value;
    data.shot.noiseDuration.value = 0.17;
    data.shot.noiseDuration.spread = 0.23;
    data.shot.spatial = false;
    data.shot.maxVoices = 128;
    data.explode.debrisChance.value = 0.25;
    data.rotor.bladePulseHz.value = 31;
    const csv = serializeSounds(data), parsed = parseSounds(csv);
    assert.deepEqual(parsed, data);
    assert.equal(Object.keys(parsed).length, 18);
    assert.equal(csv.split('\n')[1], 'shot,noiseDuration,0.17,0.23,false,128,duration');
    const { value, spread, unit } = SOUND_DATA.shot.noiseGain;
    assert.ok(csv.split('\n').includes(`shot,noiseGain,${value},${spread},,,${unit}`));
    assert.equal(SOUND_DATA.shot.noiseDuration.value, originalDuration);
});

test('parameter validator rejects unsafe values and invalid chance distributions', () => {
    for (const value of [-1, Infinity, NaN]) assert.ok(validateParameter('noiseGain', {value, spread:0, unit:'gain'}));
    for (const unit of ['duration','hertz']) assert.ok(validateParameter('test', {value:0, spread:0, unit}));
    for (const spread of [-0.01, 1, Infinity, NaN]) assert.ok(validateParameter('pitch', {value:1, spread, unit:'ratio'}));
    assert.ok(validateParameter('heavyChance', {value:1.1, spread:0, unit:'ratio'}));
    assert.ok(validateParameter('heavyChance', {value:0.5, spread:0.1, unit:'ratio'}));
    assert.equal(validateParameter('heavyChance', {value:1, spread:0, unit:'ratio'}), '');
    assert.equal(validateParameter('noiseGain', {value:0, spread:0.99, unit:'gain'}), '');
    assert.match(validateParameter('buzzSpeed', {value:0.05,spread:0,unit:'hertz'}, 'lowHealth'), /between 0.1 and 10/);
    assert.equal(validateParameter('buzzSpeed', {value:1, spread:0, unit:'hertz'}, 'lowHealth'), '');
});

test('Goliath alert has independent copies of the low-health buzzer controls', () => {
    assert.equal(SOUND_PARAMETERS.alert, SOUND_PARAMETERS.lowHealth);
    for (const param of SOUND_PARAMETERS.lowHealth.split(' ')) {
        assert.deepEqual(SOUND_DATA.alert[param], SOUND_DATA.lowHealth[param]);
    }
});

test('new decay controls round trip and reject zero only for the requested effects', async () => {
    const text = await readFile(new URL('../sounds.csv', import.meta.url), 'utf8');
    const data = structuredClone(SOUND_DATA);
    for (const key of ['flare']) {
        assert.ok(SOUND_PARAMETERS[key].split(' ').includes('decay'));
        assert.deepEqual(data[key].decay, {value:1,spread:0,unit:'ratio'});
        assert.match(validateParameter('decay', {value:0,spread:0,unit:'ratio'}, key), /positive/);
        const lines = text.split('\n'), index = lines.findIndex(line => line.startsWith(`${key},decay,`));
        assert.ok(index > 0);
        const cells = lines[index].split(',');
        cells[2] = '0'; lines[index] = cells.join(',');
        assert.throws(() => parseSounds(lines.join('\n')), /Decay must be positive/);
        data[key].decay.value = 0;
        assert.throws(() => serializeSounds(data), /Decay must be positive/);
        data[key].decay.value = 2;
        data[key].decay.spread = 0.25;
    }
    assert.deepEqual(parseSounds(serializeSounds(data)), data);
    assert.equal(validateParameter('decay', {value:0,spread:0,unit:'ratio'}, 'rocket'), '');
    assert.equal(validateParameter('pitch', {value:0,spread:0,unit:'ratio'}, 'flare'), '');
});

test('serializer rejects incomplete and invalid data instead of producing broken CSV', () => {
    const edits = [
        d => { delete d.ui; },
        d => { delete d.shot.noiseGain; },
        d => { d.shot.noiseGain.value = NaN; },
        d => { d.shot.noiseGain.unit = 'watts'; },
        d => { d.shot.noiseGain.spread = 1; },
        d => { d.shot.spatial = 'false'; },
        d => { d.shot.maxVoices = 129; },
        d => { d.shot.maxVoices = 1.5; },
        d => { d.shot.unknown = {value:1,spread:0,unit:'gain'}; }
    ];
    for (const edit of edits) {
        const data = structuredClone(SOUND_DATA); edit(data);
        assert.throws(() => serializeSounds(data));
    }
});

test('exported edits are consumable by the actual sound-data build', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'audio-csv-'));
    try {
        const data = structuredClone(SOUND_DATA);
        data.shot.noiseGain.value = 0.123;
        await mkdir(join(dir,'audio'));
        await writeFile(join(dir,'sounds.csv'), serializeSounds(data));
        const result = await buildSounds(pathToFileURL(`${dir}/`));
        assert.equal(result.shot.noiseGain.value, 0.123);
        const generated = await readFile(join(dir,'audio/sound-data.js'),'utf8');
        assert.match(generated, /"value": 0.123/);
    } finally { await rm(dir, {recursive:true, force:true}); }
});
