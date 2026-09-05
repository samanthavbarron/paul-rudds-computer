import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SequenceStage } from './scene';
import { PRESETS } from '../shared/presets';
import type { Character } from '../shared/scene';
import { api, type Health, type Job, type Sequence } from './api';
import { ComputerAudio } from './audio';

const localPresets: Sequence[] = PRESETS.map((character, i) => ({ id: `preset-${i + 1}`, character, createdAt: '', source: 'preset' }));
type Log = { who: 'COMPUTER' | 'PAUL' | 'SYSTEM'; text: string; error?: boolean };
type View = 'front' | 'back' | 'orbit';

function Window({ title, children, className = '', tools, id }: { title: string; children: ReactNode; className?: string; tools?: ReactNode; id?: string }) {
  return <section className={`window ${className}`} id={id} aria-label={title}>
    <div className="titlebar"><span className="window-icon" aria-hidden="true">▦</span><h2>{title}</h2><div className="window-tools">{tools}</div></div>
    {children}
  </section>;
}

function Stage({ character, clip, speed, paused, view, flerne, portrait, onReady }: {
  character: Character; clip: string; speed: number; paused: boolean; view: View; flerne: boolean; portrait?: boolean; onReady?: (stage: SequenceStage | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const scene = useRef<SequenceStage | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!container.current) return;
    try {
      scene.current = new SequenceStage(container.current, character, { portrait });
      onReady?.(scene.current);
    } catch (e) { setError(e instanceof Error ? e.message : '3D display unavailable.'); }
    return () => { scene.current?.dispose(); scene.current = null; onReady?.(null); };
  }, []);
  useEffect(() => { scene.current?.setCharacter(character); }, [character]);
  useEffect(() => { scene.current?.setClip(clip); }, [clip, character]);
  useEffect(() => { scene.current?.setSpeed(speed); }, [speed]);
  useEffect(() => { scene.current?.setPaused(paused); }, [paused]);
  useEffect(() => { scene.current?.setView(view); }, [view]);
  useEffect(() => { scene.current?.setFlerne(flerne); }, [flerne]);
  return <div className={`stage-canvas ${portrait ? 'portrait-canvas' : ''}`} ref={container} aria-label={`${character.name} ${portrait ? 'portrait' : 'animated 3D sequence'}`}>
    {error && <div className="webgl-error">Display initialization failed.<br />{error}<br />Please enable WebGL in your browser.</div>}
  </div>;
}

export default function App() {
  const [sequences, setSequences] = useState<Sequence[]>(localPresets);
  const [selected, setSelected] = useState(localPresets[0]);
  const [clip, setClip] = useState(localPresets[0].character.defaultClip);
  const [health, setHealth] = useState<Health | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState<View>('front');
  const [flerne, setFlerne] = useState(false);
  const [sound, setSound] = useState(false);
  const [mode, setMode] = useState<'character' | 'motion'>('character');
  const [prompt, setPrompt] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [help, setHelp] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [logs, setLogs] = useState<Log[]>([
    { who: 'SYSTEM', text: 'CINCO IDENTITY GENERATOR v2.5 / SYSTEM READY' },
    { who: 'COMPUTER', text: 'Good morning, Paul. Your sequences are ready.' },
  ]);
  const [time, setTime] = useState(new Date());
  const stage = useRef<SequenceStage | null>(null);
  const audio = useRef<ComputerAudio | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const readout = useRef<HTMLDivElement>(null);
  const activeJobId = useRef<string | null>(null);
  const busy = job?.status === 'queued' || job?.status === 'generating';
  const character = selected.character;

  function acceptResult(result: Sequence) {
    setSequences(previous => previous.some(s => s.id === result.id)
      ? previous.map(s => s.id === result.id ? result : s)
      : [...previous, result]);
    setSelected(result); setClip(result.character.defaultClip); setPaused(false); setView('front');
    log(`${result.character.name.toUpperCase()} is ready. ${result.character.description}`);
  }

  function log(text: string, who: Log['who'] = 'COMPUTER', error = false) {
    setLogs(previous => [...previous.slice(-49), { who, text, error }]);
    if (who === 'COMPUTER' && !error) audio.current?.speak(text);
  }
  function select(sequence: Sequence) {
    setSelected(sequence); setClip(sequence.character.defaultClip); setView('front'); setFlerne(false); setPaused(false);
    log(`${sequence.character.name.toUpperCase()} loaded. Looking good, Paul.`);
  }
  useEffect(() => {
    audio.current = new ComputerAudio();
    const controller = new AbortController();
    void api<Health>('/api/health', { signal: controller.signal }).then(setHealth).catch(e => {
      if (!controller.signal.aborted) setHealth({ provider: 'offline', available: false, detail: String(e.message) });
    });
    void api<{ sequences: Sequence[] }>('/api/sequences', { signal: controller.signal }).then(data => {
      if (data.sequences.length) { setSequences(data.sequences); setSelected(data.sequences[0]); setClip(data.sequences[0].character.defaultClip); }
    }).catch(e => { if (!controller.signal.aborted) log(`Library connection failed: ${e.message}`, 'SYSTEM', true); });
    const clock = setInterval(() => setTime(new Date()), 1000);
    return () => { controller.abort(); clearInterval(clock); audio.current?.dispose(); };
  }, []);
  useEffect(() => { readout.current?.scrollTo({ top: readout.current.scrollHeight, behavior: 'smooth' }); }, [logs]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setHelp(false); setFullscreen(false); }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === 'Space') { event.preventDefault(); setPaused(value => !value); }
      if (event.key === '/') { event.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  useEffect(() => {
    if (!busy || !job || job.id === 'submitting') return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await api<Job>(`/api/jobs/${job!.id}`, { signal: controller.signal });
        if (activeJobId.current !== next.id || controller.signal.aborted) return;
        setJob(next);
        if (next.status === 'complete' && next.result) {
          acceptResult(next.result);
          activeJobId.current = null;
        } else if (next.status === 'error') { log(next.error || 'Unable to compute this sequence. Please try again.', 'COMPUTER', true); activeJobId.current = null; }
        else if (next.status === 'cancelled') { log('Computation cancelled.', 'SYSTEM'); activeJobId.current = null; }
        else timeout = setTimeout(poll, 1200);
      } catch (e) {
        if (!controller.signal.aborted) { const message = e instanceof Error ? e.message : 'Lost connection.'; setJob({ id: job!.id, status: 'error', error: message }); log(message, 'SYSTEM', true); activeJobId.current = null; }
      }
    }
    timeout = setTimeout(poll, 600);
    return () => { clearInterval(timer); clearTimeout(timeout); controller.abort(); };
  }, [job?.id, busy]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const request = prompt.trim();
    if (!request || busy || activeJobId.current) return;
    // Immediate computer controls also work as typed commands; novel choreography uses AI.
    const plain = request.toLowerCase().replace(/[.!?]/g, '');
    if (mode === 'motion') {
      if (/^(please )?(turn (him |her |them |it )?around|back view|face backwards)$/.test(plain)) { setView('back'); setPrompt(''); log(request, 'PAUL'); log('Turning around.'); return; }
      if (/^(double (the )?speed|faster)$/.test(plain)) { changeSpeed(Math.min(speed * 2, 3)); setPrompt(''); return; }
      if (/^(engage )?(flerne|flarhgunnstow|flerhgunnstow)$/.test(plain)) { toggleFlerne(); setPrompt(''); return; }
    }
    log(request, 'PAUL');
    activeJobId.current = 'submitting';
    setJob({ id: 'submitting', status: 'queued', stage: 'Connecting to computer' }); setElapsed(0);
    try {
      const path = mode === 'character' ? '/api/generate' : `/api/sequences/${encodeURIComponent(selected.id)}/motion`;
      const next = await api<Job>(path, { method: 'POST', body: JSON.stringify({ prompt: request }) });
      activeJobId.current = next.id; setJob(next); setPrompt('');
      log(mode === 'character' ? 'Computing a new identity. One moment, Paul.' : 'Computing your new movement.');
    } catch (e) {
      activeJobId.current = null; const message = e instanceof Error ? e.message : 'Computation failed.';
      setJob({ id: '', status: 'error', error: message }); log(message, 'COMPUTER', true);
    }
  }
  async function cancel() {
    if (!job || job.id === 'submitting') return;
    try {
      const next = await api<Job>(`/api/jobs/${job.id}`, { method: 'DELETE' });
      if (activeJobId.current !== next.id) return;
      activeJobId.current = null; setJob(next);
      if (next.status === 'complete' && next.result) acceptResult(next.result);
      else log(next.stage === 'CANCELLED' ? 'Computation cancelled.' : next.error || 'Computation stopped.', 'SYSTEM');
    }
    catch (e) { log(e instanceof Error ? e.message : 'Could not cancel.', 'SYSTEM', true); }
  }
  function changeSpeed(value: number) { setSpeed(value); audio.current?.setSpeed(value); }
  function toggleSound() { audio.current?.setEnabled(!sound); setSound(!sound); if (!sound) audio.current?.speak('Good morning, Paul.'); }
  function toggleFlerne() { setFlerne(value => !value); log(flerne ? 'Flarhgunnstow disengaged.' : 'Flarhgunnstow engaged.'); }
  async function download() {
    try {
      if (!stage.current) throw new Error('The 3D display is not ready.');
      const blob = await stage.current.exportGLB();
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
      a.download = `${character.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.glb`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      log('3D asset exported. Have a good time, Paul.');
    } catch (e) { log(e instanceof Error ? e.message : 'Export failed.', 'SYSTEM', true); }
  }
  function suggest(text: string, targetMode: 'character' | 'motion') { setMode(targetMode); setPrompt(text); input.current?.focus(); }

  return <div className="computer">
    <header className="menubar">
      <div className="brand"><span className="cinco-mark" aria-hidden="true"><i /><i /><i /><i /></span><strong>CINCO</strong><span className="brand-divider" /> <span>PERSONAL COMPUTING</span></div>
      <nav aria-label="System"><button onClick={() => { setMode('character'); input.current?.focus(); }}>New sequence</button><button onClick={() => setHelp(true)}>Help</button><button className={sound ? 'sound-on' : ''} onClick={toggleSound}>{sound ? '♫ Sound on' : '♪ Sound off'}</button></nav>
    </header>

    <main className="desktop">
      <div className="desktop-heading"><div><div className="eyebrow">CINCO IDENTITY GENERATOR / VERSION 2.5</div><h1>Good morning, Paul<span className="heading-cursor">.</span></h1></div><div className="desktop-status"><span className={`status-dot ${health?.available ? 'online' : ''}`} />{health ? health.available ? 'COMPUTER ONLINE' : 'GENERATOR OFFLINE' : 'CONNECTING'}<small>YOUR DAILY SEQUENCE IS READY.</small></div></div>

      <div className="desktop-grid">
        <aside className="side-column">
          <Window title="Identity preview" className="portrait-window">
            <div className="portrait-inner"><Stage character={character} clip={clip} speed={speed} paused={paused} view="front" flerne={false} portrait /><span className="portrait-label">{character.name.toUpperCase()}</span><span className="portrait-corner">ID / {String(sequences.findIndex(s => s.id === selected.id) + 1).padStart(3, '0')}</span></div>
            <div className="sunken portrait-caption"><span className="tiny-led" /> IDENTITY CONFIRMED</div>
          </Window>

          <Window title="Sequence library" className="library-window" tools={<span className="title-count">{String(sequences.length).padStart(2, '0')}</span>}>
            <div className="library-heading">SELECT AN IDENTITY<span>STATUS</span></div>
            <div className="sequence-list" aria-label="Available sequences">
              {sequences.map((sequence, index) => <button key={sequence.id} className={`sequence-item ${selected.id === sequence.id ? 'selected' : ''}`} onClick={() => select(sequence)} aria-pressed={selected.id === sequence.id}>
                <span className="sequence-icon" style={{ '--swatch': ['#8a9699', '#cd5240', '#b38a50', '#68929b', '#a78db5'][index % 5] } as React.CSSProperties}><span /></span>
                <span className="sequence-name"><strong>{sequence.character.name.toUpperCase()}</strong><small>{sequence.source === 'preset' ? 'Original sequence' : 'Generated identity'}</small></span><span className="sequence-ready">{selected.id === sequence.id ? '▶' : '•'}</span>
              </button>)}
            </div>
            <button className="bevel new-sequence" onClick={() => { setMode('character'); input.current?.focus(); }}>＋ Add a new sequence</button>
            <div className="library-foot">{sequences.length} identities in memory <span>{character.parts.length} parts</span></div>
          </Window>
          <div className="desktop-note"><span className="note-icon">▤</span><p>A little dancing.<br />A little computing.<br /><strong>A world of possibilities.</strong></p></div>
        </aside>

        <Window title={`Sequence output — ${character.name.toUpperCase()}`} className={`output-window ${fullscreen ? 'expanded' : ''}`} tools={<button className="title-button" title={fullscreen ? 'Restore window' : 'Maximize window'} aria-label={fullscreen ? 'Restore window' : 'Maximize window'} onClick={() => setFullscreen(v => !v)}>{fullscreen ? '❐' : '□'}</button>}>
          <div className="output-menu"><span><b>3D</b> SEQUENCE MONITOR</span><div><span className="live-dot" />{paused ? 'PAUSED' : 'LIVE OUTPUT'}<span className="menu-divider">|</span>{speed.toFixed(2)}×</div></div>
          <div className={`viewport sunken ${flerne ? 'flerne-active' : ''}`}>
            <Stage character={character} clip={clip} speed={speed} paused={paused} view={view} flerne={flerne} onReady={value => { stage.current = value; }} />
            <div className="viewport-top"><span>SEQUENCE {String(sequences.findIndex(s => s.id === selected.id) + 1).padStart(3, '0')}</span><span>{view.toUpperCase()} VIEW</span></div>
            <div className="viewport-bottom"><div><small>NOW PLAYING</small><strong>{character.name.toUpperCase()}</strong><span>{clip.replace(/[-_]/g, ' ')}</span></div><div className={`equalizer ${paused ? 'is-paused' : ''}`} aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ animationDelay: `${i * -0.17}s`, animationDuration: `${0.5 + (i % 4) * 0.13}s` }} />)}</div></div>
            {flerne && <div className="flerne-banner">FLARHGUNNSTOW ENGAGED</div>}
          </div>
          <div className="transport">
            <button className={`bevel play-button ${paused ? '' : 'pressed'}`} aria-label={paused ? 'Play sequence' : 'Pause sequence'} onClick={() => setPaused(value => !value)}>{paused ? '▶' : 'Ⅱ'}</button>
            <div className="clip-select"><label htmlFor="clip">MOVEMENT</label><select id="clip" value={clip} onChange={e => { setClip(e.target.value); setPaused(false); }}>{character.clips.map(c => <option key={c.name} value={c.name}>{c.name.replace(/[-_]/g, ' ')}</option>)}</select></div>
            <div className="tempo"><label htmlFor="tempo">SPEED <b>{speed.toFixed(2)}×</b></label><input id="tempo" type="range" min="0.25" max="3" step="0.25" value={speed} onChange={e => changeSpeed(Number(e.target.value))} /></div>
            <div className="camera-buttons" aria-label="Camera view">{(['front', 'back', 'orbit'] as const).map(v => <button key={v} className={`bevel ${view === v ? 'pressed' : ''}`} aria-pressed={view === v} onClick={() => setView(v)}>{v === 'front' ? '↥' : v === 'back' ? '↧' : '⟳'}<span>{v}</span></button>)}</div>
          </div>
          <div className="output-footer"><span>{paused ? 'Sequence paused.' : 'Sequence running.'} {flerne ? 'Please remain calm.' : 'Looking good, Paul.'}</span><button onClick={() => void download()}>↓ Export 3D asset</button></div>
        </Window>

        <Window title="Computer" className="console-window" tools={<span className="terminal-title-status">{busy ? 'COMPUTING' : 'AWAITING INPUT'}<span className={`tiny-led ${busy ? 'amber' : ''}`} /></span>}>
          <div className="console-grid">
            <div className="console-readout sunken" ref={readout} role="log" aria-live="polite" aria-label="Computer responses">{logs.map((entry, i) => <div key={i} className={`log-line log-${entry.who.toLowerCase()} ${entry.error ? 'log-error' : ''}`}><span>{entry.who === 'SYSTEM' ? 'SYS' : entry.who === 'PAUL' ? 'YOU' : 'CPU'}</span><p>{entry.text}</p></div>)}<span className="terminal-cursor">▌</span></div>
            <div className="command-station">
              <div className="command-modes"><button className={mode === 'character' ? 'active' : ''} onClick={() => { setMode('character'); input.current?.focus(); }}>NEW SEQUENCE</button><button className={mode === 'motion' ? 'active' : ''} onClick={() => { setMode('motion'); input.current?.focus(); }}>DIRECT MOVEMENT</button></div>
              <form onSubmit={e => void submit(e)}><label htmlFor="command">{mode === 'character' ? 'Who would you like to see?' : `What should ${character.name} do?`}</label><div className="command-input-row"><span aria-hidden="true">&gt;</span><input id="command" ref={input} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={mode === 'character' ? 'A disco astronaut with a mustache…' : 'Do a dramatic, slow-motion bow…'} maxLength={1000} autoComplete="off" disabled={busy} /><button className="bevel submit-button" type="submit" disabled={busy || !prompt.trim()}>{busy ? 'WAIT' : 'ENTER ↵'}</button></div></form>
              {busy ? <div className="generation-status" role="status"><div className="progress-blocks">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 0.065}s` }} />)}</div><span>{job.stage || 'Computing sequence'} · {elapsed}s</span><button onClick={() => void cancel()} disabled={job.id === 'submitting'}>Cancel</button></div> : <div className="suggestions"><span>TRY</span>{mode === 'character' ? <><button onClick={() => suggest('A disco astronaut with a magnificent mustache', 'character')}>Disco astronaut</button><button onClick={() => suggest('A very serious business shrimp in a tiny suit', 'character')}>Business shrimp</button></> : <><button onClick={() => suggest('Perform an extravagant hat wobble', 'motion')}>Hat wobble</button><button onClick={() => suggest('Do a deeply awkward jumping jack', 'motion')}>Jumping jacks</button></>}</div>}
              <div className="special-controls"><button className="bevel" onClick={() => { setView(view === 'back' ? 'front' : 'back'); log('Turning around.'); }}>Turn around</button><button className="bevel" onClick={() => { changeSpeed(speed >= 3 ? 1 : Math.min(speed * 2, 3)); log(speed >= 3 ? 'Normal speed restored.' : 'Increasing speed.'); }}>Double speed</button><button className={`bevel flerne-button ${flerne ? 'pressed' : ''}`} aria-pressed={flerne} onClick={toggleFlerne}>{flerne ? '■ Disengage' : '✳ Engage'} Flarhgunnstow</button></div>
            </div>
          </div>
        </Window>
      </div>
      <div className="desktop-footer"><span>FOR YOUR PERSONAL ENTERTAINMENT.</span><span>Inspired by <a href="https://www.youtube.com/watch?v=maAFcEU6atk" target="_blank" rel="noreferrer">Celery Man</a> · An unofficial experiment</span></div>
    </main>

    <footer className="taskbar"><button className="bevel start-button" onClick={() => setHelp(true)}><span className="mini-cinco" /> CINCO</button><div className="taskbar-divider" /><button className="task-button pressed" onClick={() => { setFullscreen(false); input.current?.focus(); }}><span aria-hidden="true">▦</span> Identity Generator 2.5</button><div className="taskbar-right sunken"><span title={health?.detail || health?.provider || 'Connecting'} className="provider-label">{health?.provider === 'demo' ? 'DEMO' : health?.available ? 'AI READY' : 'LOCAL'}</span><span className="taskbar-divider" /><time>{time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</time></div></footer>

    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><div role="dialog" aria-modal="true" aria-label="About this computer" onClick={e => e.stopPropagation()}><Window title="About this computer" tools={<button className="title-button" aria-label="Close help" onClick={() => setHelp(false)}>×</button>}><div className="about"><span className="about-icon">▦</span><h3>CINCO Identity Generator 2.5</h3><p>Your very own Paul Rudd computer. Choose a sequence, invent an identity, and give it something unusual to do.</p><dl><dt>New sequence</dt><dd>Describe a character. The computer builds an animated 3D asset.</dd><dt>Direct movement</dt><dd>Ask the current character to dance, bow, wave, or try something else.</dd><dt>Space / Slash</dt><dd>Pause playback / focus the command prompt.</dd><dt>Export 3D asset</dt><dd>Download the character and its animation clips as a .glb file for Blender or another 3D application.</dd></dl><div className="about-system sunken"><b>GENERATOR: {health?.provider?.toUpperCase() || 'CONNECTING'}</b><span>{health?.available ? 'Connected. Ready to generate.' : health?.detail || 'Generator unavailable. Start the backend to create identities.'}</span></div><p className="about-fine">An unofficial homage to Tim & Eric’s Celery Man. All 3D assets and music are original. Generated characters use stylized procedural geometry.</p><button className="bevel" onClick={() => setHelp(false)}>Very good, computer.</button></div></Window></div></div>}
  </div>;
}
