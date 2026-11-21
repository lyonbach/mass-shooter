import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAudioEngine, EFFECT_CLASSES, GunShot, SoundEffect, AudioEngine } from '../audio/index.js';
import { SOUND_DATA } from '../audio/sound-data.js';
import { SoundEngine } from '../audio.js';
import { MusicPlayer } from '../audio/music/player.js';
import { parseSounds } from '../scripts/build-sounds.mjs';
import { MockAudioContext } from './helpers/audio-context.js';

function setup(options = {}) {
    const system = createAudioEngine(options);
    const ctx = new MockAudioContext();
    system.engine.init(ctx);
    return { ...system, ctx };
}

test('all CSV effects have a registered class and default randomization', () => {
    const { engine } = setup();
    assert.deepEqual([...engine.effects.keys()].sort(), Object.keys(SOUND_DATA).sort());
    for (const [key,effect] of engine.effects) {
        assert.equal(effect.randomize, true);
        assert.equal(effect.spatial, SOUND_DATA[key].spatial);
        assert.equal(effect.maxVoices, SOUND_DATA[key].maxVoices);
    }
});

for (const Ctor of EFFECT_CLASSES) test(`${Ctor.key}: valid schedules, sources end and nodes disconnect`, () => {
    // Zero RNG forces rare heavy/debris branches, not just their common variants.
    const { engine, ctx } = setup({ random: () => 0 });
    const first = ctx.nodes.length;
    const effect = engine.effect(Ctor.key), voice = effect.play();
    assert.ok(voice && voice.sources.size);
    assert.equal(effect.voiceCount, 1);
    if (Ctor.key === 'rotor') effect.stop();
    else ctx.advanceTo(5);
    assert.equal(effect.voiceCount, 0);
    assert.equal(engine.voices.size, 0);
    assert.ok(ctx.nodes.slice(first).every(node => node.disconnected));
});

test('settings are isolated between classes, direct constructors and engines', () => {
    const a = setup(), b = setup({data:{shot:{maxVoices:1,noiseGain:{value:0.5,spread:0}}}});
    const direct = new GunShot(a.engine);
    const original = SOUND_DATA.shot.noiseGain.value;
    a.engine.effect('shot').params.noiseGain.value = original + 1;
    assert.equal(direct.params.noiseGain.value, original);
    assert.equal(b.engine.effect('shot').params.noiseGain.value, 0.5);
    assert.equal(b.engine.effect('shot').maxVoices, 1);
    assert.equal(a.engine.effect('shot').maxVoices, SOUND_DATA.shot.maxVoices);
    assert.deepEqual(a.engine.effect('enemy').params.noiseGain, SOUND_DATA.enemy.noiseGain);
    assert.equal(SOUND_DATA.shot.noiseGain.value, original);
});

test('voice caps count playbacks, retain all layers, and recover on natural end', () => {
    const { engine, ctx } = setup({data:{explode:{maxVoices:2}}});
    const effect = engine.effect('explode');
    effect.play({randomize:false}); effect.play({randomize:false});
    const count = ctx.sources.length;
    assert.equal(effect.play(), null);
    assert.equal(ctx.sources.length, count);
    ctx.advanceTo(0.3); // Short cracks ended, long rumble still alive.
    assert.equal(effect.voiceCount, 2);
    assert.equal(effect.play(), null);
    ctx.advanceTo(10);
    assert.equal(effect.voiceCount, 0);
    assert.ok(effect.play());
});

test('future scheduling and ignition tails retain the voice until their final source ends', () => {
    const { engine, ctx } = setup();
    const effect = engine.effect('missile');
    const voice = effect.play({at:10,randomize:false});
    ctx.advanceTo(10.25);
    assert.equal(effect.voiceCount, 1);
    assert.ok([...voice.sources.keys()].some(source => source.startAt === 10.3));
    ctx.advanceTo(11.4);
    assert.equal(effect.voiceCount, 1);
    ctx.advanceTo(14);
    assert.equal(effect.voiceCount, 0);
});

test('stop cancels future sources and releases capacity immediately', () => {
    const { engine, ctx } = setup();
    const effect = engine.effect('rocket'), voice = effect.play({at:10});
    voice.stop(); voice.stop();
    assert.equal(effect.voiceCount, 0);
    assert.ok(ctx.sources.every(source => source.end === 0 && source.onended === null));
    assert.ok(effect.play());
});

test('failed render releases partially built nodes and capacity', () => {
    const { engine } = setup();
    class Broken extends SoundEffect { render() { throw new Error('intentional'); } }
    const effect = new Broken(engine);
    assert.throws(() => effect.play(), /intentional/);
    assert.equal(effect.voiceCount, 0);
    assert.equal(engine.voices.size, 0);
});

test('randomization ranges, per-play override and correlated parameter sampling', () => {
    const { engine } = setup({random:()=>0});
    const effect = engine.effect('explode');
    const { value, spread } = effect.params.pitch;
    assert.equal(effect.n('pitch'), value * (1 - spread));
    engine.random = () => 1;
    assert.equal(effect.n('pitch'), value * (1 + spread));
    const voice = effect.play({randomize:false});
    assert.ok([...voice.sources.keys()].filter(s=>s.type==='buffer').every(s=>s.offset === 0));
    assert.equal(effect.randomize, true);
    effect.randomize = false;
    assert.equal(effect.n('pitch'), value);
    assert.equal(effect.chance('debrisChance'), false);
});

test('enemy spark parameters control the additional noise layer', () => {
    const { engine, ctx } = setup({data:{enemy:{
        sparkDuration:{value:0.21,spread:0}, sparkGain:{value:0.23,spread:0}, sparkCutoff:{value:2300,spread:0}
    }}});
    const voice = engine.effect('enemy').play({at:2,pan:0.4,gain:0.5,randomize:false});
    const sources = [...voice.sources.keys()];
    assert.equal(sources.length, 3);
    const spark = sources.find(source => source.type === 'buffer' && source.end === 2.21);
    assert.ok(spark);
    const nodes = voice.sources.get(spark);
    assert.equal(spark.startAt, 2);
    assert.equal(nodes[1].frequency.value, 2300);
    assert.ok(ctx.events.some(event => event.label === 'gain' && event.method === 'set' && event.at === 2 && event.value === 0.115));
    assert.equal(voice.panner.pan.value, 0.4);
    assert.ok(sources.some(source => source.type === 'sine'));
});

for (const spec of [
    { key:'lowHealth', offsets:[0,0.48,0.96], duration:0.32, tones:[['sawtooth',185,175,0.12],['square',277.5,262.5,0.055]], noise:[0.12,900,0.025] },
    { key:'alert', offsets:[0,0.36], duration:0.22, tones:[['sawtooth',330,310,0.065],['square',495,465,0.035]] }
]) for (const decay of [1,2]) test(`${spec.key} schedules each buzz with decay ${decay} and holds capacity until the final source`, () => {
    const config = {maxVoices:1};
    if (decay !== 1) config.decay = {value:decay,spread:0,unit:'ratio'};
    const { engine, ctx } = setup({data:{[spec.key]:config}});
    const effect = engine.effect(spec.key), voice = effect.play({at:2,gain:0.5,randomize:false});
    const sources = [...voice.sources.keys()];
    assert.equal(sources.length, spec.offsets.length * (spec.tones.length + (spec.noise ? 1 : 0)));
    for (const offset of spec.offsets) {
        const at = 2 + offset * decay, burst = sources.filter(source => Math.abs(source.startAt - at) < 1e-12);
        assert.equal(burst.length, spec.tones.length + (spec.noise ? 1 : 0));
        for (const [type,freq,end,level] of spec.tones) {
            const tone = burst.find(source => source.type === type);
            assert.ok(tone);
            assert.ok(Math.abs(tone.end - (at + spec.duration * decay + 0.03)) < 1e-12);
            assert.ok(ctx.events.some(event => event.label === 'frequency' && event.method === 'set' && event.at === at && event.value === freq));
            assert.ok(ctx.events.some(event => event.label === 'frequency' && event.method === 'exponential' && Math.abs(event.at - (at + spec.duration * decay)) < 1e-12 && event.value === end));
            assert.ok(ctx.events.some(event => event.label === 'gain' && event.method === 'linear' && event.at === at + 0.006 && Math.abs(event.value - 0.5 * level) < 1e-12));
        }
        if (spec.noise) {
            const noise = burst.find(source => source.type === 'buffer');
            assert.ok(noise);
            assert.ok(Math.abs(noise.end - (at + spec.noise[0] * decay)) < 1e-12);
            assert.equal(voice.sources.get(noise)[1].frequency.value, spec.noise[1]);
            assert.ok(ctx.events.some(event => event.label === 'gain' && event.method === 'set' && event.at === at && event.value === 0.5 * spec.noise[2]));
        }
    }
    assert.equal(effect.play({randomize:false}), null);
    const finalEnd = Math.max(...sources.map(source => source.end));
    ctx.advanceTo(finalEnd - 0.001);
    assert.equal(effect.voiceCount, 1);
    ctx.advanceTo(finalEnd);
    assert.equal(effect.voiceCount, 0);
    assert.ok(effect.play({randomize:false}));
});

for (const key of ['lowHealth','alert','flare']) test(`${key} stop cancels every future source`, () => {
    const { engine, ctx } = setup({data:{[key]:{maxVoices:1,decay:{value:2,spread:0,unit:'ratio'}}}});
    const effect = engine.effect(key), voice = effect.play({at:10,randomize:false});
    const sources = [...voice.sources.keys()];
    assert.ok(sources.every(source => source.startAt > ctx.currentTime));
    if (key !== 'flare') assert.ok(sources.some(source => source.startAt > 10));
    effect.stop();
    assert.equal(effect.voiceCount, 0);
    assert.ok(sources.every(source => source.end === 0 && source.onended === null && source.disconnected));
    assert.ok(effect.play({randomize:false}));
});

for (const decay of [1,2]) test(`flare scales all layer durations with decay ${decay}`, () => {
    const config = {maxVoices:1};
    if (decay !== 1) config.decay = {value:decay,spread:0,unit:'ratio'};
    const { engine, ctx } = setup({data:{flare:config}});
    const effect = engine.effect('flare'), voice = effect.play({at:2,gain:0.5,randomize:false});
    const sources = [...voice.sources.keys()];
    assert.equal(sources.length, 4);
    for (const [i,duration] of [0.025,0.045,0.24,0.18].entries()) {
        const source = sources[i], nodes = voice.sources.get(source);
        assert.equal(source.startAt, 2);
        assert.ok(Math.abs(source.end - (2 + duration * decay + (i === 1 ? 0.03 : 0))) < 1e-12);
        if (i !== 1) assert.equal(nodes[1].frequency.value, [4000,0,1600,650][i]);
    }
    assert.ok(ctx.events.some(event => event.label === 'frequency' && event.method === 'set' && event.value === 110 && event.at === 2));
    assert.ok(ctx.events.some(event => event.label === 'frequency' && event.method === 'exponential' && event.value === 42 && Math.abs(event.at - (2 + 0.045 * decay)) < 1e-12));
    for (const level of [0.13,0.06,0.25,0.1]) {
        assert.ok(ctx.events.some(event => event.label === 'gain' && Math.abs(event.value - level * 0.5) < 1e-12));
    }
    assert.equal(effect.play({randomize:false}), null);
    const finalEnd = Math.max(...sources.map(source => source.end));
    ctx.advanceTo(finalEnd - 0.001);
    assert.equal(effect.voiceCount, 1);
    ctx.advanceTo(finalEnd);
    assert.equal(effect.voiceCount, 0);
    assert.ok(effect.play({randomize:false}));
});

for (const key of ['lowHealth','alert','flare']) test(`${key} samples randomized decay once for all layers`, () => {
    const { engine } = setup({data:{[key]:{decay:{value:2,spread:0.25,unit:'ratio'}}}});
    engine.random = () => 1;
    const effect = engine.effect(key), jitter = engine.jitter.bind(engine);
    let samples = 0;
    engine.jitter = (param, enabled) => {
        if (param === effect.params.decay) samples++;
        return jitter(param, enabled);
    };
    const voice = effect.play({at:2,randomize:true}), sources = [...voice.sources.keys()];
    assert.equal(samples, 1);
    const decay = 2.5;
    const expected = key === 'lowHealth'
        ? [0,0.48,0.96].flatMap(offset => [[offset,0.32],[offset,0.32],[offset,0.12]])
        : key === 'alert' ? [0,0,0.36,0.36].map(offset => [offset,0.22])
        : [[0,0.025],[0,0.045],[0,0.24],[0,0.18]];
    assert.equal(sources.length, expected.length);
    for (const [i,[offset,duration]] of expected.entries()) {
        assert.ok(Math.abs(sources[i].startAt - (2 + offset * decay)) < 1e-12);
        assert.ok(Math.abs(sources[i].end - (2 + offset * decay + duration * decay + (sources[i].type === 'buffer' ? 0 : 0.03))) < 1e-12);
    }
});

test('all layers share one spatial output; nonspatial ignores pan and position', () => {
    const { engine } = setup();
    engine.setListener({x:100,y:100,panDistance:100,maxDistance:200});
    const spatial = engine.play('shot',{position:{x:0,y:100}});
    assert.equal(spatial.panner.pan.value, -1);
    assert.equal(spatial.output.gain.value, 0.5);
    for (const nodes of spatial.sources.values()) assert.ok(nodes.at(-1).connections.includes(spatial.output));
    const centered = engine.play('shot',{pan:1,position:{x:0,y:100},spatial:false});
    assert.equal(centered.panner.pan.value, 0);
    assert.equal(centered.output.gain.value, 1);
    assert.equal(engine.play('ui',{pan:1}).panner.pan.value, 0);
    assert.equal(engine.play('ui',{pan:5,spatial:true}).panner.pan.value, 1);
});

test('no StereoPanner support degrades to mono without throwing', () => {
    const ctx = new MockAudioContext(); ctx.createStereoPanner = undefined;
    const { engine } = createAudioEngine(); engine.init(ctx);
    assert.ok(engine.play('shot',{pan:1}));
});

test('unavailable, suspended and muted audio do not allocate voices', async () => {
    const engine = new AudioEngine(); engine.init();
    assert.equal(engine.ctx, null);
    const s = setup(); s.ctx.state = 'suspended';
    assert.equal(s.engine.play('shot'), null);
    await s.engine.resume(); s.engine.configure({muted:true});
    assert.equal(s.engine.play('shot'), null);
    assert.equal(s.engine.voices.size, 0);
});

test('master volume does not overwrite music and rotor bus levels', () => {
    const { engine } = setup();
    engine.configure({volume:0.4,music:true});
    assert.equal(engine.master.gain.value, 0.4);
    assert.equal(engine.bus('music').gain.value, 0.25);
    assert.equal(engine.bus('fx').gain.value, 1);
    assert.equal(engine.bus('rotor').gain.value, 0);
    engine.configure({muted:true,music:false});
    assert.equal(engine.master.gain.value, 0);
    assert.equal(engine.bus('music').gain.value, 0);
});

test('rotor is idempotent, reacts to upgrades, stops, and restarts with fresh sources', () => {
    const { engine, rotor, ctx } = setup();
    rotor.start(); rotor.start();
    assert.equal(ctx.sources.length, 3);
    rotor.update({speed:1,rotorUpgrade:2});
    assert.equal(rotor.bladePulse.frequency.value, 18 * 1.12 ** 2);
    rotor.stop(); assert.equal(rotor.running, false);
    assert.equal(engine.voices.size, 0);
    rotor.start(); assert.equal(ctx.sources.length, 6);
    assert.equal(rotor.voiceCount, 1);
});

test('facade preserves numeric calls and settings-driven rotor/music state', async () => {
    const settings={volume:0.6,muted:false,music:true};
    const sound = new SoundEngine(settings,{AudioClass:null});
    sound.engine.init(new MockAudioContext());
    await sound.init();
    assert.equal(sound.play('shot',0.5,0.2).panner.pan.value,0.5);
    sound.setActive(true); assert.equal(sound.rotor.running,true);
    settings.muted=true; sound.configure();
    assert.equal(sound.rotor.running,false);
    assert.equal(sound.play('shot'),null);
    settings.muted=false; sound.configure();
    assert.equal(sound.rotor.running,true);
    sound.setMusicScene('boss'); sound.update();
    assert.equal(sound.score.step,1);
    sound.setActive(false); assert.equal(sound.rotor.running,false);
    await sound.dispose(); assert.equal(sound.ctx,null);
});

test('MP3 scenes play, crossfade and dispose independently of effects', async () => {
    class FakeAudio { play(){this.paused=false;return Promise.resolve();} pause(){this.paused=true;} }
    const { engine } = setup();
    const player = new MusicPlayer(engine,{AudioClass:FakeAudio});
    player.play(); await Promise.resolve();
    const menu=player.current;
    assert.equal(menu.status,'ready');
    player.setScene('waves'); await Promise.resolve();
    assert.equal(player.current.scene,'waves');
    assert.equal(menu.gain.gain.value,0);
    player.dispose();
    assert.equal(menu.audio.paused,true);
    assert.equal(menu.source.disconnected,true);
    assert.equal(player.timers.size,0);
});

test('failed MP3 clears active track, allowing procedural score fallback', async () => {
    class FailedAudio { play(){return Promise.reject(new Error('missing'));} pause(){} }
    const { engine,score,ctx }=setup();
    const player=new MusicPlayer(engine,{AudioClass:FailedAudio});
    player.play(); await new Promise(resolve=>setImmediate(resolve));
    assert.equal(player.current,null);
    score.update(0,true,'menu',player.current);
    assert.ok(ctx.sources.length>0);
    player.dispose();
});

test('dispose during pending music load ignores late promises', async () => {
    let resolve;
    class PendingAudio { play(){return new Promise(r=>{resolve=r;});} pause(){this.paused=true;} }
    const { engine } = setup();
    const player = new MusicPlayer(engine,{AudioClass:PendingAudio});
    player.play(); const track=player.current; player.dispose(); resolve(); await Promise.resolve();
    assert.equal(player.current,null); assert.equal(track.audio.paused,true);
    assert.equal(track.gain.gain.value,0);
});

test('CSV round trip matches checked-in generated data', async () => {
    const text=await readFile(new URL('../sounds.csv',import.meta.url),'utf8');
    assert.deepEqual(parseSounds(text),SOUND_DATA);
});

test('CSV rejects duplicates, missing values/effects/parameters and conflicting metadata', async () => {
    const text=await readFile(new URL('../sounds.csv',import.meta.url),'utf8');
    const lines = text.trimEnd().split('\n');
    const rowIndex = (effect,param) => {
        const index = lines.findIndex(line => {
            const cells = line.split(',');
            return cells[0] === effect && cells[1] === param;
        });
        assert.ok(index > 0, `missing fixture row ${effect}.${param}`);
        return index;
    };
    const mutate = (effect,param,changes) => {
        const copy = [...lines], index = rowIndex(effect,param), cells = copy[index].split(',');
        for (const [column,value] of Object.entries(changes)) cells[Number(column)] = value;
        copy[index] = cells.join(',');
        return copy.join('\n') + '\n';
    };
    const invalid = [
        ['duplicate', text + lines[rowIndex('shot','noiseDuration')] + '\n', /Duplicate shot\.noiseDuration/],
        ['missing value', mutate('shot','noiseDuration',{2:''}), /Value must be/],
        ['invalid spread', mutate('shot','noiseDuration',{3:'1'}), /Variation must be/],
        ['invalid spatial', mutate('shot','noiseDuration',{4:'yes'}), /Spatial must be/],
        ['invalid voice cap', mutate('shot','noiseDuration',{5:'0'}), /maxVoices must be/],
        ['conflicting metadata', mutate('shot','noiseGain',{4:'false',5:'1'}), /Conflicting spatial setting/],
        ['missing effect', lines.filter(line => !line.startsWith('ui,')).join('\n') + '\n', /Missing effect ui/],
        ['missing parameter', lines.filter((_,index) => index !== rowIndex('hit','ringGain')).join('\n') + '\n', /Missing hit\.ringGain/],
        ['invalid chance', mutate('hit','heavyChance',{2:'1.5'}), /Chance must be/]
    ];
    for (const [category,value,error] of invalid) {
        assert.notEqual(value, text, category);
        assert.throws(()=>parseSounds(value), error, category);
    }
});
