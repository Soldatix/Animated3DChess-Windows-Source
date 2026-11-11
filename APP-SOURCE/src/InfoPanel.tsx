import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import './info-panel.css';

export type Language = 'en' | 'hr' | 'de' | 'it' | 'es';
type Copy = {
  subtitle: string; about: string; description: string; features: string;
  featureText: string; controls: string; controlsDesktop: string; controlsTouch: string;
  desktopText: string; touchText: string; version: string; cost: string;
  costText: string; privacy: string; privacyText: string; support: string;
  supportText: string; donate: string; portal: string; contact: string;
  close: string; language: string; development: string;
};

const TEXT: Record<Language, Copy> = {
  en: {
    subtitle: 'Table Edition • Development preview', about: 'About the game',
    description: 'A cinematic 3D chess game with animated pieces and a wooden tabletop.',
    features: 'Features', featureText: '3D chessboard, animated captures, AI moves and several camera views.',
    controls: 'How to play', controlsDesktop: 'Mouse and keyboard', controlsTouch: 'Touch controls',
    desktopText: 'Click a piece to select and move it. Drag with the left button to orbit; right-drag to pan; scroll to zoom. WASD + R/F: free camera. H: hide controls.',
    touchText: 'Tap a piece to select and move it. One-finger drag: orbit; two-finger drag: pan; pinch: zoom. Open Controls for camera and game actions.',
    version: 'Version', cost: 'Free to play', costText: 'Animated 3D Chess is free to play.',
    privacy: 'Privacy and local data', privacyText: 'Some session data and identifiers may be saved in your browser. Network requests can occur for game assets and any network-enabled features. No account is required for the single-player controls shown here.',
    support: 'Voluntary support', supportText: 'Donations are optional. The game stays free. Our official Apps & Games portal lists PayPal, Stripe and crypto support methods.',
    donate: 'See donation options', portal: 'Apps & Games portal', contact: 'Contact', close: 'Close', language: 'Language', development: 'Development',
  },
  hr: {
    subtitle: 'Table Edition • Razvojni pregled', about: 'O igri',
    description: 'Filmska 3D šahovska igra s animiranim figurama i drvenim stolom.',
    features: 'Mogućnosti', featureText: '3D šahovska ploča, animirana uzimanja figura, AI potezi i više pogleda kamere.',
    controls: 'Kako igrati', controlsDesktop: 'Miš i tipkovnica', controlsTouch: 'Upravljanje dodirom',
    desktopText: 'Klikni figuru za odabir i potez. Povlačenje lijevom tipkom: okretanje; desnom: pomicanje kamere; kotačić: zumiranje. WASD + R/F: slobodna kamera. H: sakrij kontrole.',
    touchText: 'Dodirni figuru za odabir i potez. Jedan prst: okretanje; dva prsta: pomicanje; štipanje: zumiranje. Otvori Kontrole za prikaze kamere i akcije igre.',
    version: 'Verzija', cost: 'Besplatna igra', costText: 'Animated 3D Chess je besplatan.',
    privacy: 'Privatnost i lokalni podaci', privacyText: 'Neki podaci sesije i identifikatori mogu se pohraniti u pregledniku. Mrežni zahtjevi mogu se koristiti za datoteke igre i mrežne funkcije. Za prikazane funkcije jednog igrača nije potreban račun.',
    support: 'Dobrovoljna podrška', supportText: 'Donacije su dobrovoljne. Igra ostaje besplatna. Na službenom portalu Apps & Games dostupne su opcije PayPal, Stripe i kripto.',
    donate: 'Opcije donacija', portal: 'Apps & Games portal', contact: 'Kontakt', close: 'Zatvori', language: 'Jezik', development: 'Razvojna verzija',
  },
  de: {
    subtitle: 'Table Edition • Entwicklungsvorschau', about: 'Über das Spiel',
    description: 'Ein filmisches 3D-Schachspiel mit animierten Figuren und einem Holztisch.',
    features: 'Funktionen', featureText: '3D-Schachbrett, animierte Schlagzüge, KI-Züge und mehrere Kameraperspektiven.',
    controls: 'Spielanleitung', controlsDesktop: 'Maus und Tastatur', controlsTouch: 'Touch-Steuerung',
    desktopText: 'Figur anklicken, um sie auszuwählen und zu ziehen. Linke Maustaste ziehen: drehen; rechte: verschieben; Mausrad: zoomen. WASD + R/F: freie Kamera. H: Bedienelemente ausblenden.',
    touchText: 'Figur antippen, um sie auszuwählen und zu ziehen. Ein Finger: drehen; zwei Finger: verschieben; zusammenziehen: zoomen. „Steuerung“ öffnet Kamera- und Spielaktionen.',
    version: 'Version', cost: 'Kostenlos', costText: 'Animated 3D Chess kann kostenlos gespielt werden.',
    privacy: 'Datenschutz und lokale Daten', privacyText: 'Einige Sitzungsdaten und Kennungen können im Browser gespeichert werden. Netzwerkanfragen können für Spieldateien und netzwerkfähige Funktionen erfolgen. Für die gezeigten Einzelspieler-Funktionen ist kein Konto nötig.',
    support: 'Freiwillige Unterstützung', supportText: 'Spenden sind freiwillig. Das Spiel bleibt kostenlos. Das offizielle Apps & Games Portal bietet PayPal-, Stripe- und Krypto-Optionen.',
    donate: 'Spendenmöglichkeiten', portal: 'Apps & Games Portal', contact: 'Kontakt', close: 'Schließen', language: 'Sprache', development: 'Entwicklung',
  },
  it: {
    subtitle: 'Table Edition • Anteprima di sviluppo', about: 'Informazioni sul gioco',
    description: 'Un gioco di scacchi 3D cinematografico con pezzi animati e un tavolo in legno.',
    features: 'Funzioni', featureText: 'Scacchiera 3D, catture animate, mosse AI e varie visuali della telecamera.',
    controls: 'Come giocare', controlsDesktop: 'Mouse e tastiera', controlsTouch: 'Comandi touch',
    desktopText: 'Fai clic su un pezzo per selezionarlo e muoverlo. Trascina con il tasto sinistro per ruotare, con il destro per spostare; rotellina per lo zoom. WASD + R/F: telecamera libera. H: nascondi i comandi.',
    touchText: 'Tocca un pezzo per selezionarlo e muoverlo. Un dito: ruota; due dita: sposta; pizzica: zoom. Apri Comandi per telecamera e azioni di gioco.',
    version: 'Versione', cost: 'Gioco gratuito', costText: 'Animated 3D Chess è gratuito.',
    privacy: 'Privacy e dati locali', privacyText: 'Alcuni dati di sessione e identificatori possono essere salvati nel browser. Le richieste di rete possono servire per le risorse del gioco e le funzioni online. Non occorre un account per i controlli di gioco singolo mostrati.',
    support: 'Supporto volontario', supportText: 'Le donazioni sono facoltative. Il gioco resta gratuito. Il portale ufficiale Apps & Games offre PayPal, Stripe e criptovalute.',
    donate: 'Opzioni di donazione', portal: 'Portale Apps & Games', contact: 'Contatti', close: 'Chiudi', language: 'Lingua', development: 'Sviluppo',
  },
  es: {
    subtitle: 'Table Edition • Versión de desarrollo', about: 'Acerca del juego',
    description: 'Un juego de ajedrez 3D cinematográfico con piezas animadas y mesa de madera.',
    features: 'Funciones', featureText: 'Tablero 3D, capturas animadas, movimientos de IA y varias vistas de cámara.',
    controls: 'Cómo jugar', controlsDesktop: 'Ratón y teclado', controlsTouch: 'Controles táctiles',
    desktopText: 'Haz clic en una pieza para seleccionarla y moverla. Arrastra con botón izquierdo para girar, con derecho para desplazar; rueda para acercar. WASD + R/F: cámara libre. H: ocultar controles.',
    touchText: 'Toca una pieza para seleccionarla y moverla. Un dedo: girar; dos dedos: desplazar; pellizcar: zoom. Abre Controles para vistas de cámara y acciones.',
    version: 'Versión', cost: 'Juego gratuito', costText: 'Animated 3D Chess es gratuito.',
    privacy: 'Privacidad y datos locales', privacyText: 'Algunos datos de sesión e identificadores pueden guardarse en el navegador. Puede haber solicitudes de red para recursos y funciones en línea. No hace falta cuenta para los controles de un jugador mostrados.',
    support: 'Apoyo voluntario', supportText: 'Las donaciones son voluntarias. El juego sigue siendo gratuito. El portal oficial Apps & Games ofrece PayPal, Stripe y criptomonedas.',
    donate: 'Opciones de donación', portal: 'Portal Apps & Games', contact: 'Contacto', close: 'Cerrar', language: 'Idioma', development: 'Desarrollo',
  },
};

// An explicit message is shown if Windows cannot open the system browser.
const EXTERNAL_LINK_ERROR: Record<Language, string> = {
  en: 'The browser could not be opened. Please visit appsandgames.org manually.',
  hr: 'Preglednik se nije mogao otvoriti. Posjeti appsandgames.org ručno.',
  de: 'Der Browser konnte nicht geöffnet werden. Bitte appsandgames.org manuell aufrufen.',
  it: 'Impossibile aprire il browser. Visita appsandgames.org manualmente.',
  es: 'No se pudo abrir el navegador. Visita appsandgames.org manualmente.',
};

export function InfoPanel({ onClose, language }: {
  onClose: () => void;
  language: Language;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const copy = TEXT[language];
  const isDesktop = import.meta.env.MODE === 'desktop';
  const [externalLinkError, setExternalLinkError] = useState('');

  // In Tauri, only the two official URLs may be passed to the Rust command.
  // Web builds keep ordinary anchor navigation; mailto stays untouched.
  const openOfficialLink = (event: MouseEvent<HTMLAnchorElement>, kind: 'donate' | 'portal') => {
    if (!isDesktop) return;
    event.preventDefault();
    const tauri = (window as unknown as {
      __TAURI__?: { core?: { invoke?: (command: string, args: { kind: string }) => Promise<unknown> } }
    }).__TAURI__;
    const invoke = tauri?.core?.invoke;
    if (!invoke) {
      setExternalLinkError(EXTERNAL_LINK_ERROR[language]);
      return;
    }
    void invoke('open_apps_games_url', { kind })
      .then(() => setExternalLinkError(''))
      .catch(() => setExternalLinkError(EXTERNAL_LINK_ERROR[language]));
  };

  useEffect(() => { closeRef.current?.focus(); }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Prevent the background chess scene from interpreting dialog keystrokes
    // as camera movement or HUD shortcuts.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), a[href]'
    ) ?? []);
    if (!nodes.length) return;
    if (event.shiftKey && document.activeElement === nodes[0]) {
      event.preventDefault();
      nodes[nodes.length - 1].focus();
    } else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) {
      event.preventDefault();
      nodes[0].focus();
    }
  };

  return (
    <div className="wc-info-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div ref={dialogRef} className="wc-info-dialog" role="dialog" aria-modal="true"
        aria-labelledby="wc-info-title" onKeyDown={onKeyDown} onPointerDown={(event) => event.stopPropagation()}>
        <header className="wc-info-head">
          <div>
            <p className="wc-info-eyebrow">Apps &amp; Games</p>
            <h2 id="wc-info-title">ANIMATED 3D CHESS</h2>
            <p className="wc-info-subtitle">{isDesktop ? 'Table Edition' : copy.subtitle}</p>
          </div>
          <button ref={closeRef} type="button" className="wc-info-close" onClick={onClose}
            aria-label={copy.close} title={copy.close}>×</button>
        </header>

        <div className="wc-info-body">
          <section><h3>{copy.about}</h3><p>{copy.description}</p></section>
          <section><h3>{copy.features}</h3><p>{copy.featureText}</p></section>
          <section>
            <h3>{copy.controls}</h3>
            <h4>{copy.controlsDesktop}</h4><p>{copy.desktopText}</p>
            <h4>{copy.controlsTouch}</h4><p>{copy.touchText}</p>
          </section>
          <div className="wc-info-grid">
            <section><h3>{copy.version}</h3><p>{isDesktop ? '1.0.0' : '1.0.0 · ' + copy.development}</p></section>
            <section><h3>{copy.cost}</h3><p>{copy.costText}</p></section>
          </div>
          <section><h3>{copy.privacy}</h3><p>{copy.privacyText}</p>
            {!isDesktop && (
            <button type="button" className="wc-info-privacy-choice" onClick={() => {
              (window as unknown as {AppsGamesPrivacy?: {openPreferences: () => void}})
                .AppsGamesPrivacy?.openPreferences();
            }}>{copy.privacy}</button>
            )}
          </section>
          <section className="wc-info-support">
            <h3>{copy.support}</h3><p>{copy.supportText}</p>
            <a href="https://appsandgames.org/#info" target="_blank" rel="noopener noreferrer"
              onClick={(event) => openOfficialLink(event, 'donate')}>
              {copy.donate} ↗
            </a>
          </section>
        </div>
        <footer className="wc-info-footer">
          <a href="https://appsandgames.org/" target="_blank" rel="noopener noreferrer"
            onClick={(event) => openOfficialLink(event, 'portal')}>{copy.portal} ↗</a>
          <a href="mailto:info@appsandgames.org">{copy.contact}: info@appsandgames.org</a>
        </footer>
        {externalLinkError && <p role="alert" style={{ padding: '0 24px 14px', color: '#f5d76e', fontSize: '.82rem' }}>{externalLinkError}</p>}
      </div>
    </div>
  );
}
