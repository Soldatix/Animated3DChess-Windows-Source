import { useEffect, useRef, useState } from 'react';
import { initWizardChess } from './wizardChessEngine.js';
import { InfoPanel } from './InfoPanel';
import { RulesPanel } from './RulesPanel';
import type { Language } from './InfoPanel';
import { LanguagePicker } from './LanguagePicker';
import { getLanguage, setLanguage, TEXT } from './i18n.js';
import { TutorialPanel } from './TutorialPanel';
import { P1G_COPY } from './P1gCopy';

export default function App() {
  const initializedRef = useRef(false);
  const [language, setActiveLanguage] = useState<Language>(() => getLanguage() as Language);
  const copy = TEXT[language];
  const selectLanguage = (next: Language) => {
    if (next === language) return;
    setLanguage(next);
    setActiveLanguage(next);
  };
  useEffect(() => {
    document.documentElement.lang = language;
    // React commits translated labels first; engine then updates dynamic turn / checkmate status.
    window.dispatchEvent(new Event('wizard-chess-language-changed'));
  }, [language]);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [localTwoPlayer, setLocalTwoPlayer] = useState(false);
  const [autoFlipLocalCamera, setAutoFlipLocalCameraState] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const [coordinatesVisible, setCoordinatesVisible] = useState(() => {
    try { return localStorage.getItem('wizard-chess-board-coordinates-v1') === 'true'; }
    catch { return false; }
  });
  const [promotionMove, setPromotionMove] = useState<{fromR:number;fromC:number;toR:number;toC:number}|null>(null);
  const ux = P1G_COPY[language];
  const chessApi = () => (window as unknown as {wizardChess?: {
    togglePause?: () => boolean;
    startLocalTwoPlayer?: () => boolean;
    startComputerGame?: () => boolean;
    getGameMode?: () => string;
    setAutoFlipLocalCamera?: (next:boolean) => boolean;
    getAutoFlipLocalCamera?: () => boolean;
    getClaimableFideDraw?: () => 'threefold'|'fiftyMove'|null;
    claimFideDraw?: () => {ok:boolean;reason?:string};
    toggleBoardCoordinates?: () => boolean;
    getBoardCoordinatesVisible?: () => boolean;
    saveLocalGame?: () => {ok:boolean;paused?:boolean;reason?:string};
    loadLocalGame?: () => {ok:boolean;paused?:boolean;reason?:string};
    executeChessMove?: (fromR:number,fromC:number,toR:number,toC:number,options?:{promotion?:string}) => boolean;
    undoLastTurn?: () => {ok:boolean;undone?:number;reason?:string};
  }}).wizardChess;
  useEffect(() => {
    const sync = () => {
      const api = chessApi();
      setLocalTwoPlayer(api?.getGameMode?.() === 'local');
      setAutoFlipLocalCameraState(Boolean(api?.getAutoFlipLocalCamera?.()));
    };
    window.addEventListener('wizard-chess-mode-changed', sync);
    return () => window.removeEventListener('wizard-chess-mode-changed', sync);
  }, []);
  const performLocalGameAction = (kind:'save'|'load') => {
    const response=kind==='save' ? chessApi()?.saveLocalGame?.() : chessApi()?.loadLocalGame?.();
    setMobileSheetOpen(false);
    if (response?.ok) {
      setPaused(Boolean(response.paused));
      setSaveNotice(kind==='save' ? ux.saved : ux.loaded);
    } else {
      const reason=(response?.reason || 'invalid') as keyof typeof ux;
      setSaveNotice(typeof ux[reason] === 'string' ? String(ux[reason]) : ux.invalid);
    }
  };
  const performClaimDraw = () => {
    const response = chessApi()?.claimFideDraw?.();
    setMobileSheetOpen(false);
    setSaveNotice(response?.ok ? ux.claimDone : ux.claimUnavailable);
  };
  const performUndo = () => {
    const response = chessApi()?.undoLastTurn?.();
    setMobileSheetOpen(false);
    setSaveNotice(response?.ok ? ux.undone
      : response?.reason === 'busy' ? ux.busy
      : response?.reason === 'missing' ? ux.undoEmpty : ux.undoUnavailable);
  };
  useEffect(()=>{
    const listener=(event:Event)=>setPaused(Boolean((event as CustomEvent<{paused:boolean}>).detail?.paused));
    window.addEventListener('wizard-chess-pause-changed',listener);
    return ()=>window.removeEventListener('wizard-chess-pause-changed',listener);
  },[]);
  useEffect(()=>{
    if(!saveNotice)return;
    const handle=window.setTimeout(()=>setSaveNotice(''),4500);
    return ()=>window.clearTimeout(handle);
  },[saveNotice]);
  useEffect(() => {
    const request = (event:Event) => {
      const move = (event as CustomEvent<{fromR:number;fromC:number;toR:number;toC:number}>).detail;
      if (!move || ![move.fromR,move.fromC,move.toR,move.toC].every(x=>Number.isInteger(x)&&x>=0&&x<8)) return;
      setMobileSheetOpen(false);
      setPromotionMove(move);
    };
    window.addEventListener('wizard-chess-promotion-request', request);
    return () => window.removeEventListener('wizard-chess-promotion-request', request);
  }, []);

  const choosePromotion = (promotion:'queen'|'rook'|'bishop'|'knight') => {
    if (!promotionMove) return;
    const {fromR,fromC,toR,toC} = promotionMove;
    const ok = chessApi()?.executeChessMove?.(fromR,fromC,toR,toC,{promotion});
    if (ok) setPromotionMove(null);
    else setSaveNotice(ux.busy);
  };

  const rulesButtonRef = useRef<HTMLButtonElement>(null);
  const openRules = () => { setInfoOpen(false); setMobileSheetOpen(false); setRulesOpen(true); };
  const closeRules = () => {
    setRulesOpen(false);
    window.setTimeout(() => rulesButtonRef.current?.focus(), 0);
  };
  const infoButtonRef = useRef<HTMLButtonElement>(null);
  const openInfo = () => { setMobileSheetOpen(false); setInfoOpen(true); };
  const closeInfo = () => {
    setInfoOpen(false);
    window.setTimeout(() => infoButtonRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (initializedRef.current) return;
    const start = () => {
      if (initializedRef.current) return;
      initializedRef.current = true;
      document.getElementById('wc-chess-intro')?.remove();
      initWizardChess();
    };
    const play = document.getElementById('wc-chess-play') as HTMLButtonElement | null;
    if (!play) { start(); return; }
    play.textContent = copy.newGame;
    play.addEventListener('click', start);
    play.disabled = false;
    return () => { play.removeEventListener('click', start); play.disabled = true; };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPromotionMove(null);
        setMobileSheetOpen(false);
        setInfoOpen(false);
        setRulesOpen(false);
        setTutorialOpen(false);
      }
    };
    const handleResize = () => {
      if (window.innerWidth > (import.meta.env.MODE === 'desktop' ? 1180 : 768)) {
        setMobileSheetOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleRestoreUI = () => {
    const win = window as unknown as { wizardChess?: { toggleUI?: (force?: boolean) => void } };
    if (win.wizardChess?.toggleUI) {
      win.wizardChess.toggleUI(false);
    } else {
      document.body.classList.remove('cinematic-ui-hidden');
      const btnHide = document.getElementById('btn-hide-ui');
      if (btnHide) btnHide.textContent = copy.hideUI;
    }
  };

  return (
    <>
      <div id="loading-overlay">
        <div className="loader-title">ANIMATED 3D CHESS</div>
        <div className="loader-bar-wrap">
          <div className="loader-bar" id="loader-bar"></div>
        </div>
        <div id="loader-text">{copy.loading}</div>
      </div>

      <div id="canvas-container"></div>

      <div id="wc-check-notice" className="wc-check-notice" role="status"
        aria-live="polite" aria-atomic="true"></div>

      <button
        type="button"
        className="hud-btn mobile-only-restore-ui"
        id="btn-mobile-show-ui"
        onClick={handleRestoreUI}
        title={copy.showUiTitle}
      >
        {copy.showUI}
      </button>

      <div id="hud-top">
        <div className="hud-group" id="hud-left">
          <div className="brand-pill">
            <span className="brand-title">ANIMATED 3D CHESS</span>
          </div>
          <div className="status-pill" id="status-pill">
            <span className="turn-dot" id="turn-dot"></span>
            <span id="turn-text">{copy.whiteMove}</span>
            <span className="mode-badge" id="mode-badge">{copy.playingAs} {copy.white}</span>
          </div>
        </div>

        <div className="wc-language-slot"><LanguagePicker language={language} onChange={selectLanguage} /></div>

        <button
          type="button"
          className={`hud-btn mobile-controls-trigger ${mobileSheetOpen ? 'active' : ''}`}
          id="btn-mobile-controls"
          aria-expanded={mobileSheetOpen}
          aria-controls="hud-right"
          onClick={() => setMobileSheetOpen((prev) => !prev)}
        >
          {mobileSheetOpen ? copy.close : copy.controls}
        </button>

        <div
          className={`mobile-sheet-backdrop ${mobileSheetOpen ? 'open' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setMobileSheetOpen(false);
          }}
          aria-hidden="true"
        ></div>

        <div
          className={`hud-group ${mobileSheetOpen ? 'mobile-sheet-open' : ''}`}
          id="hud-right"
        >
          <div
            className="mobile-sheet-handle-wrap"
            onClick={(e) => {
              e.stopPropagation();
              setMobileSheetOpen(false);
            }}
            aria-hidden="true"
          >
            <div className="mobile-sheet-handle"></div>
          </div>

          <div className="mobile-sheet-header">
            <span className="mobile-sheet-title">{copy.controls}</span>
            <button
              type="button"
              className="mobile-sheet-close"
              id="btn-mobile-sheet-close"
              onClick={(e) => {
                e.stopPropagation();
                setMobileSheetOpen(false);
              }}
              aria-label={copy.closeControls}
            >
              {copy.close} ✕
            </button>
          </div>

          <div className="mobile-sheet-section-label">{copy.gameActions}</div>

          <button type="button" className={`hud-btn ${!localTwoPlayer ? 'active' : ''}`}
            id="btn-versus-computer" aria-pressed={!localTwoPlayer}
            onClick={() => {chessApi()?.startComputerGame?.();setMobileSheetOpen(false);}}>
            ♟ {ux.versusComputer}
          </button>
          <button type="button" className={`hud-btn ${localTwoPlayer ? 'active' : ''}`}
            id="btn-local-two-player" aria-pressed={localTwoPlayer}
            onClick={() => {chessApi()?.startLocalTwoPlayer?.();setMobileSheetOpen(false);}}>
            ♟♟ {ux.twoPlayers}
          </button>
          <button type="button" className={`hud-btn ${autoFlipLocalCamera ? 'active' : ''}`}
            id="btn-local-auto-flip" aria-pressed={autoFlipLocalCamera}
            style={{display:localTwoPlayer ? 'inline-flex' : 'none'}}
            onClick={() => {chessApi()?.setAutoFlipLocalCamera?.(!autoFlipLocalCamera);setMobileSheetOpen(false);}}>
            ↻ {ux.autoCameraFlip}
          </button>
          <button
            className="hud-btn"
            id="btn-side-toggle"
            title={copy.switchSidesTitle}
            onClick={() => setMobileSheetOpen(false)}
          >
            {copy.playAs} {copy.black}
          </button>
          <div className="ai-difficulty-control" style={{display: localTwoPlayer ? 'none' : undefined}}>
            <label htmlFor="ai-difficulty">{copy.aiLevel}</label>
            <select id="ai-difficulty" defaultValue="3" aria-label={copy.aiLevelAria}>
              <option value="1">1 · {copy.learning}</option>
              <option value="2">2 · {copy.easy}</option>
              <option value="3">3 · {copy.medium}</option>
              <option value="4">4 · {copy.hard}</option>
              <option value="5">5 · {copy.expert}</option>
              <option value="6">6 · {copy.grandmaster}</option>
            </select>
          </div>
          <button
            className="hud-btn"
            id="btn-ai-move"
            title={copy.aiMoveTitle}
            onClick={() => setMobileSheetOpen(false)}
          >
            {copy.aiMove}
          </button>
          <button
            className="hud-btn"
            id="btn-reset"
            title={copy.resetTitle}
            onClick={() => setMobileSheetOpen(false)}
          >
            {copy.newGame}
          </button>

          <button className="hud-btn" id="btn-pause" type="button" aria-pressed={paused}
            onClick={()=>{chessApi()?.togglePause?.();setMobileSheetOpen(false);}}>
            {paused ? ux.resume : ux.pause}
          </button>
          <button className="hud-btn" id="btn-save" type="button"
            onClick={()=>performLocalGameAction('save')}>{ux.save}</button>
          <button className="hud-btn" id="btn-load" type="button"
            onClick={()=>performLocalGameAction('load')}>{ux.load}</button>
          <button className="hud-btn" id="btn-undo" type="button"
            onClick={performUndo}>↶ {ux.undo}</button>
          <button className="hud-btn" id="btn-claim-draw" type="button" style={{display:'none'}}
            onClick={performClaimDraw}>½–½ {ux.claimDraw}</button>
          <button className={`hud-btn ${coordinatesVisible ? 'active' : ''}`}
            id="btn-coordinates" type="button" aria-pressed={coordinatesVisible}
            onClick={() => {
              const visible = chessApi()?.toggleBoardCoordinates?.();
              if (typeof visible === 'boolean') setCoordinatesVisible(visible);
              setMobileSheetOpen(false);
            }}>{ux.coordinates}</button>
          <button className="hud-btn" id="btn-tutorial" type="button"
            onClick={()=>{setMobileSheetOpen(false);setInfoOpen(false);setRulesOpen(false);setTutorialOpen(true);}}>{ux.tutorial}</button>
          <div className="hud-divider" aria-hidden="true"></div>
          <div className="mobile-sheet-section-label">
            <span>{copy.cameraViews}</span>
            <span className="mobile-sheet-section-sub">{copy.tapToFlip}</span>
          </div>

          <button
            className="hud-btn active"
            id="btn-cam-player"
            title={copy.playerCamTitle}
          >
            {copy.playerCam}
          </button>
          <button
            className="hud-btn"
            id="btn-cam-top"
            title={copy.overheadTitle}
          >
            {copy.overhead}
          </button>
          <button
            className="hud-btn"
            id="btn-cam-side"
            title={copy.sideTitle}
          >
            {copy.side}
          </button>
          <button
            className="hud-btn"
            id="btn-cam-wide"
            title={copy.tableViewTitle}
          >
            {copy.tableView}
          </button>

          <div className="hud-divider" aria-hidden="true"></div>
          <div className="mobile-sheet-section-label">{copy.displayGestures}</div>

          <button
            className="hud-btn"
            id="btn-hide-ui"
            title={copy.hideUiTitle}
            onClick={() => setMobileSheetOpen(false)}
          >
            {copy.hideUI}
          </button>

          <button type="button" className="hud-btn" id="btn-rules" ref={rulesButtonRef}
            onClick={openRules} title={copy.rulesTitle} aria-label={copy.rulesTitle}
            aria-haspopup="dialog" aria-expanded={rulesOpen}>
            <span aria-hidden="true">📖</span> {copy.rules}
          </button>

          <button type="button" className="hud-btn" id="btn-info" ref={infoButtonRef}
            onClick={openInfo} aria-haspopup="dialog" aria-expanded={infoOpen}>
            ℹ {copy.info}
          </button>

          <div className="mobile-sheet-hint">
            {copy.touchHint}
          </div>
        </div>
      </div>

      <div id="hud-bottom">
        <div className="hint-pill" id="controls-hint">
          {copy.desktopHint}
        </div>
        <div className="captured-pill" id="captured-tray"></div>
      </div>

      {infoOpen && <InfoPanel onClose={closeInfo} language={language} />}
      {rulesOpen && <RulesPanel onClose={closeRules} language={language} />}
      {tutorialOpen && <TutorialPanel language={language} onClose={()=>setTutorialOpen(false)} />}
      {saveNotice && <div className="wc-save-notice" role="status">{saveNotice}</div>}

      {promotionMove && (
        <div className="wc-promotion-backdrop">
          <div className="wc-promotion-dialog" role="dialog" aria-modal="true" aria-label={ux.promotionTitle}>
            <div className="wc-promotion-heading">{ux.promotionTitle}</div>
            <div className="wc-promotion-choices">
              <button type="button" onClick={()=>choosePromotion('queen')}>♕ {ux.promotionQueen}</button>
              <button type="button" onClick={()=>choosePromotion('rook')}>♖ {ux.promotionRook}</button>
              <button type="button" onClick={()=>choosePromotion('bishop')}>♗ {ux.promotionBishop}</button>
              <button type="button" onClick={()=>choosePromotion('knight')}>♘ {ux.promotionKnight}</button>
            </div>
            <button className="wc-promotion-cancel" type="button" onClick={()=>setPromotionMove(null)}>{ux.close}</button>
          </div>
        </div>
      )}
      <div id="checkmate-overlay" role="status" aria-live="polite">
        <div className="checkmate-banner">
          <div className="checkmate-ornament">✦ &nbsp; {copy.checkmateOrnament} &nbsp; ✦</div>
          <div className="checkmate-crown" id="checkmate-crown">♔</div>
          <div className="checkmate-title" id="checkmate-title">{copy.checkmate}</div>
          <div className="checkmate-rule"></div>
          <div className="checkmate-subtitle" id="checkmate-subtitle">
            {copy.white} {copy.triumphs} • {copy.black} {copy.kingFallen}
          </div>
          <div className="checkmate-actions">
            <button className="checkmate-btn" id="btn-checkmate-replay">
              {copy.replayKingFall}
            </button>
            <button className="checkmate-btn" id="btn-checkmate-undo" type="button"
              onClick={performUndo}>{ux.undo}</button>
            <button className="checkmate-btn" id="btn-checkmate-newgame">
              {copy.newGame}
            </button>
            <button className="checkmate-btn secondary" id="btn-checkmate-dismiss">
              {copy.dismiss}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
