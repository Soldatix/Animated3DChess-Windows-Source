import { useEffect, useState } from 'react';
import './onlineMultiplayer.css';

type Lang = 'en' | 'hr' | 'de' | 'it' | 'es';
type Room = { code: string; status: string; turn: 'w' | 'b'; ply: number;
  whiteJoined: boolean; blackJoined: boolean; drawOfferedBy?: 'w' | 'b' | null;
  claimableDraw?: {threefold:boolean;fiftyMove:boolean};
  result?: { winner?: 'w' | 'b' | null; reason?: string } | null };
type OnlineView = { code?:string|null; side?:'w'|'b'|null; connection?:string;
  room?:Room|null; error?:string|null; entryPending?:boolean };
type OnlineChessApi = {
  startOnlineHost?: (color:'w'|'b') => Promise<OnlineView>;
  startOnlineJoin?: (code:string) => Promise<OnlineView>;
  onlineAction?: (name:'resign'|'draw-offer'|'draw-response'|'claim-draw', body?:{accept?:boolean}) => Promise<OnlineView>;
  leaveOnlineRoom?: () => boolean;
  getOnlineState?: () => OnlineView;
};
const words = {
  hr: { title:'Online Multiplayer · V1.1', intro:'Privatna soba za dva igrača. Potrebna je dostupna mrežna veza.',
    howTitle:'Kako se spojiti', step1:'kreira sobu i podijeli kod sobe.', step2:'unosi kod i klikne', step3:'Oba igrača ostaju povezana i mogu nastaviti istu partiju.',
    tipTitle:'Napomena', leaveDesc:'potpuno napušta online partiju.', closeDesc:'zatvara samo ovaj prozor; soba i partija ostaju aktivne.',
    create:'Kreiraj sobu', join:'Pridruži se', white:'Bijeli', black:'Crni', code:'Kod sobe (10 znakova)',
    waiting:'Čeka se drugi igrač', playing:'Igra u tijeku', finished:'Partija završena', disconnected:'Veza nije uspostavljena',
    connecting:'Povezivanje…', connected:'Povezano', mySide:'Moja boja', move:'Na potezu', share:'Podijeli samo kod sobe',
    resign:'Predaj partiju', offer:'Ponudi remi', claim:'Zatraži remi', accept:'Prihvati remi', decline:'Odbij remi', leave:'Napusti sobu',
    status:'Status veze', copyCode:'Kopiraj kod', copied:'Kod kopiran', copyFailed:'Kopiranje nije uspjelo; označi kod ručno', reconnecting:'Ponovno povezivanje…', expired:'Sesija je istekla',
    close:'Zatvori', error:'Greška', offline:'Za online igru oba igrača moraju biti povezana s poslužiteljem',
    unready:'Pokreni igru prije povezivanja', confirmResign:'Predati partiju?', noRoom:'Nisi u online sobi',
    waitAnimation:'Pričekaj završetak animacije pa ponovno pokušaj napustiti sobu', entryPending:'Zahtjev za sobu je još u tijeku' },
  en: { title:'Online Multiplayer · V1.1', intro:'Private room for two players. Internet connection required.',
    howTitle:'How it works', step1:'creates a room and shares the room code.', step2:'enters the code and clicks', step3:'Both players stay connected to continue the same game.',
    tipTitle:'Tip', leaveDesc:'exit the online match completely.', closeDesc:'close this window only and keep the room/session active.',
    create:'Create room', join:'Join room', white:'White', black:'Black', code:'Room code (10 characters)',
    waiting:'Waiting for opponent', playing:'Game in progress', finished:'Game finished', disconnected:'Not connected',
    connecting:'Connecting…', connected:'Connected', mySide:'My side', move:'To move', share:'Share room code only',
    resign:'Resign', offer:'Offer draw', claim:'Claim draw', accept:'Accept draw', decline:'Decline draw', leave:'Leave room', close:'Close',
    status:'Connection', copyCode:'Copy code', copied:'Code copied', copyFailed:'Copy failed; select the code manually', reconnecting:'Reconnecting…', expired:'Session expired',
    error:'Error', offline:'Both players must be connected to the multiplayer server', unready:'Start game before connecting',
    confirmResign:'Resign this game?', noRoom:'Not in an online room',
    waitAnimation:'Wait until the move animation finishes before leaving the room', entryPending:'Room request is still pending' },
  de: { title:'Online-Multiplayer · V1.1', intro:'Privater Raum für zwei Spieler. Netzwerkverbindung erforderlich.',
    howTitle:'So funktioniert es', step1:'erstellt einen Raum und teilt den Raumcode.', step2:'gibt den Code ein und klickt auf', step3:'Beide Spieler bleiben verbunden, um dieselbe Partie fortzusetzen.',
    tipTitle:'Hinweis', leaveDesc:'die Online-Partie vollständig verlassen.', closeDesc:'nur dieses Fenster schließen; Raum und Partie bleiben aktiv.',
    create:'Raum erstellen', join:'Beitreten', white:'Weiß', black:'Schwarz', code:'Raumcode (10 Zeichen)',
    waiting:'Warten auf Gegner', playing:'Partie läuft', finished:'Partie beendet', disconnected:'Keine Verbindung',
    connecting:'Verbindung wird hergestellt…', connected:'Verbunden', mySide:'Meine Farbe', move:'Am Zug',
    share:'Nur Raumcode teilen', resign:'Aufgeben', offer:'Remis anbieten', claim:'Remis beanspruchen', accept:'Remis annehmen',
    decline:'Remis ablehnen', leave:'Raum verlassen', close:'Schließen', error:'Fehler',
    status:'Verbindung', copyCode:'Code kopieren', copied:'Code kopiert', copyFailed:'Kopieren fehlgeschlagen; Code manuell markieren', reconnecting:'Erneut verbinden…', expired:'Sitzung abgelaufen',
    offline:'Beide Spieler benötigen eine Verbindung zum Multiplayer-Server', unready:'Spiel zuerst starten',
    confirmResign:'Partie aufgeben?', noRoom:'Nicht in einem Online-Raum',
    waitAnimation:'Bitte Animation abwarten und dann den Raum verlassen', entryPending:'Raumanfrage läuft noch' },
  it: { title:'Multigiocatore online · V1.1', intro:'Stanza privata per due giocatori. Connessione di rete necessaria.',
    howTitle:'Come funziona', step1:'crea una stanza e condivide il codice.', step2:'inserisce il codice e fa clic su', step3:'Entrambi i giocatori restano connessi per continuare la stessa partita.',
    tipTitle:'Nota', leaveDesc:'uscire completamente dalla partita online.', closeDesc:'chiudere solo questa finestra; stanza e sessione rimangono attive.',
    create:'Crea stanza', join:'Entra nella stanza', white:'Bianco', black:'Nero', code:'Codice stanza (10 caratteri)',
    waiting:'In attesa dell’avversario', playing:'Partita in corso', finished:'Partita terminata',
    disconnected:'Non connesso', connecting:'Connessione…', connected:'Connesso', mySide:'Il mio colore',
    move:'Turno di', share:'Condividi solo il codice', resign:'Abbandona partita', offer:'Offri patta', claim:'Richiedi patta',
    accept:'Accetta patta', decline:'Rifiuta patta', leave:'Esci dalla stanza', close:'Chiudi', error:'Errore',
    status:'Connessione', copyCode:'Copia codice', copied:'Codice copiato', copyFailed:'Copia non riuscita; seleziona il codice', reconnecting:'Riconnessione…', expired:'Sessione scaduta',
    offline:'Entrambi i giocatori devono collegarsi al server', unready:'Avvia prima il gioco',
    confirmResign:'Abbandonare la partita?', noRoom:'Nessuna stanza online',
    waitAnimation:'Attendi la fine dell’animazione prima di uscire', entryPending:'Richiesta stanza in corso' },
  es: { title:'Multijugador en línea · V1.1', intro:'Sala privada para dos jugadores. Se necesita conexión de red.',
    howTitle:'Cómo funciona', step1:'crea una sala y comparte el código.', step2:'introduce el código y pulsa', step3:'Ambos jugadores siguen conectados para continuar la misma partida.',
    tipTitle:'Nota', leaveDesc:'salir por completo de la partida en línea.', closeDesc:'cerrar solo esta ventana; la sala y la sesión siguen activas.',
    create:'Crear sala', join:'Unirse', white:'Blancas', black:'Negras', code:'Código de sala (10 caracteres)',
    waiting:'Esperando rival', playing:'Partida en curso', finished:'Partida terminada',
    disconnected:'Sin conexión', connecting:'Conectando…', connected:'Conectado', mySide:'Mi color',
    move:'Turno de', share:'Comparte solo el código', resign:'Rendirse', offer:'Ofrecer tablas', claim:'Reclamar tablas',
    accept:'Aceptar tablas', decline:'Rechazar tablas', leave:'Salir de la sala', close:'Cerrar', error:'Error',
    status:'Conexión', copyCode:'Copiar código', copied:'Código copiado', copyFailed:'Error al copiar; selecciona el código', reconnecting:'Reconectando…', expired:'Sesión caducada',
    offline:'Ambos jugadores deben conectarse al servidor', unready:'Inicia el juego primero',
    confirmResign:'¿Rendirse?', noRoom:'No estás en una sala',
    waitAnimation:'Espera a que termine la animación antes de salir', entryPending:'La solicitud de sala sigue pendiente' }
} as const;
function api():OnlineChessApi | undefined { return (window as unknown as {wizardChess?:OnlineChessApi}).wizardChess; }
export function OnlineMultiplayerPanel({language, onClose}:{language:string;onClose:()=>void}) {
  const w=words[(language in words ? language : 'en') as Lang];
  const [color,setColor]=useState<'w'|'b'>('w');
  const [input,setInput]=useState('');
  const [view,setView]=useState<OnlineView>(()=>api()?.getOnlineState?.() || {});
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [copyNotice,setCopyNotice]=useState('');
  useEffect(()=>{
    const handler=(event:Event)=>setView((event as CustomEvent<OnlineView>).detail || {});
    window.addEventListener('wizard-chess-online-changed',handler);
    setView(api()?.getOnlineState?.() || {});
    return ()=>window.removeEventListener('wizard-chess-online-changed',handler);
  },[]);
  const run=async(action:()=>Promise<OnlineView>|undefined)=>{
    if (pending || view.entryPending) return;
    setPending(true);setError('');
    try {if (!api()) throw new Error(w.unready);const value=await action();if (value) setView(value);}
    catch(e){const reason=e instanceof Error?e.message:String(e);
      setError(reason==='online-entry-pending'?w.entryPending:reason);}
    finally {setPending(false);}
  };
  const copyRoomCode=async()=>{
    if (!view.code) return;
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(view.code);
      setCopyNotice(w.copied);
    } catch { setCopyNotice(w.copyFailed); }
  };
  const connectionLabel=view.connection==='connected'?w.connected
    :view.connection==='expired'?w.expired
    :view.connection==='connecting'&&view.code?w.reconnecting
    :view.connection==='connecting'?w.connecting
    :view.code?w.reconnecting:w.disconnected;
  const room=view.room;
  const opponentOffer=Boolean(room?.drawOfferedBy && room.drawOfferedBy !== view.side);
  const canClaimDraw = room?.status === 'playing' && room?.turn === view.side &&
    Boolean(room?.claimableDraw?.threefold || room?.claimableDraw?.fiftyMove);
  return <div className="wc-online-shade" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="wc-online-panel" role="dialog" aria-modal="true" aria-label={w.title} style={{maxHeight:'calc(100vh - 32px)',overflowY:'auto'}}>
      <header><h2>{w.title}</h2><button type="button" onClick={onClose} aria-label={w.close}>✕</button></header>
      <p>{w.intro}</p>
      {!view.code && <div className="wc-online-guide" style={{fontSize:'0.9em',lineHeight:1.35}}>
        <strong>{w.howTitle}</strong>
        <ol style={{margin:'6px 0 10px',paddingLeft:'22px'}}>
          <li><strong>{w.white}</strong> {w.step1}</li>
          <li><strong>{w.black}</strong> {w.step2} <strong>{w.join}</strong>.</li>
          <li>{w.step3}</li>
        </ol>
      </div>}
      {!view.code ? <>
        <div className="wc-online-colors">
          <label><input type="radio" checked={color==='w'} onChange={()=>setColor('w')} name="mp-side" />{w.white}</label>
          <label><input type="radio" checked={color==='b'} onChange={()=>setColor('b')} name="mp-side" />{w.black}</label>
        </div>
        <button type="button" disabled={pending || view.entryPending} onClick={()=>void run(()=>api()?.startOnlineHost?.(color))}>{w.create}</button>
        <label htmlFor="wc-online-join-code">{w.code}</label>
        <input id="wc-online-join-code" autoComplete="off" spellCheck={false} maxLength={10}
          value={input} onChange={e=>setInput(e.target.value.toUpperCase())} placeholder="ABCDEFGH23" />
        <button type="button" disabled={pending || view.entryPending || !/^[A-HJ-NP-Z2-9]{10}$/.test(input)}
          onClick={()=>void run(()=>api()?.startOnlineJoin?.(input))}>{w.join}</button>
      </> : <>
        <div className="wc-online-code-wrap">
          <div className="wc-online-code" aria-label={w.code}>{view.code}</div>
          <button type="button" onClick={()=>void copyRoomCode()}>{w.copyCode}</button>
        </div>
        {copyNotice && <p className="wc-online-copy-notice" role="status">{copyNotice}</p>}
        <p>{w.share}</p>
        <dl><dt>{w.mySide}</dt><dd>{view.side==='w'?w.white:w.black}</dd>
          <dt>{w.move}</dt><dd>{room?.turn==='w'?w.white:w.black}</dd>
          <dt>{w.status}</dt><dd>{connectionLabel}</dd>
          <dt>{w.title}</dt><dd>{room?.status==='waiting'?w.waiting:room?.status==='playing'?w.playing:room?.status==='finished'?w.finished:'—'}</dd></dl>
        {room?.status==='playing' && <div className="wc-online-actions">
          <button type="button" disabled={pending || view.connection!=='connected'}
            onClick={()=>void run(()=>api()?.onlineAction?.('draw-offer'))}>{w.offer}</button>
          {canClaimDraw && <button type="button" disabled={pending || view.connection!=='connected'}
            onClick={()=>void run(()=>api()?.onlineAction?.('claim-draw'))}>{w.claim}</button>}
          {opponentOffer && <>
            <button type="button" disabled={pending} onClick={()=>void run(()=>api()?.onlineAction?.('draw-response',{accept:true}))}>{w.accept}</button>
            <button type="button" disabled={pending} onClick={()=>void run(()=>api()?.onlineAction?.('draw-response',{accept:false}))}>{w.decline}</button>
          </>}
          <button type="button" disabled={pending} onClick={()=>{
            if(window.confirm(w.confirmResign))void run(()=>api()?.onlineAction?.('resign'));
          }}>{w.resign}</button>
        </div>}
        <button type="button" disabled={pending || view.entryPending} onClick={()=>{
          if (api()?.leaveOnlineRoom?.() === true) { setView({}); onClose(); }
          else setError(w.waitAnimation);
        }}>{w.leave}</button>
      </>}
      <div className="wc-online-tip" style={{fontSize:'0.85em',lineHeight:1.35}}>
        <strong>{w.tipTitle}:</strong>
        <ul style={{margin:'6px 0 10px',paddingLeft:'22px'}}>
          <li><strong>{w.leave}</strong> = {w.leaveDesc}</li>
          <li><strong>X / {w.close}</strong> = {w.closeDesc}</li>
        </ul>
      </div>
      <small>{w.offline}</small>
      {(error || view.error) && <p role="alert" className="wc-online-error">{w.error}: {error || view.error}</p>}
      <div className="wc-online-footer"><button type="button" onClick={onClose}>{w.close}</button></div>
    </section>
  </div>;
}
