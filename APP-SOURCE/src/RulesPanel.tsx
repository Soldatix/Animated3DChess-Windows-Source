import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { Language } from './InfoPanel';
import { TEXT } from './i18n.js';
import './info-panel.css';

type RulesCopy = { title: string; subtitle: string; sections: [string,string][] };
const RULES: Record<Language, RulesCopy> = {
  "en": {
    "title": "Chess rules",
    "subtitle": "A quick guide for Animated 3D Chess",
    "sections": [
      [
        "Goal",
        "Checkmate your opponent’s king. White moves first; players alternate turns. You cannot make a move that leaves your own king in check."
      ],
      [
        "How the pieces move",
        "King: one square in any direction. Queen: any number of squares straight or diagonally. Rook: any number straight. Bishop: any number diagonally. Knight: an L-shape (two squares and one to the side) and may jump over pieces. Pawn: one square forward (two from its initial square if clear); captures one square diagonally forward."
      ],
      [
        "Check and checkmate",
        "Check means your king is attacked. You must get out of check by moving your king, capturing the attacker or blocking the attack (when possible). If no legal escape exists, it is checkmate. If you have no legal move and are not in check, it is stalemate (a draw)."
      ],
      [
        "Castling",
        "Select your king, then select its destination (g-file for short castling, c-file for long castling); you can also choose the matching rook as the target. The king and rook must never have moved, squares between must be empty, and the king may not be in check or cross/end on an attacked square. Both pieces move automatically."
      ],
      [
        "Pawn promotion",
        "When a pawn reaches the last rank, this version automatically promotes it to a queen."
      ],
      [
        "How to play here",
        "Click or tap a piece, then choose a legal destination. Drag with the left mouse button or one finger to rotate the camera; right-drag or two fingers to pan; scroll or pinch to zoom. Use New Game to restart, AI Level to choose difficulty, and H to hide/show the HUD."
      ],
      [
        "Current limitations",
        "The special en passant capture and draw claims by repetition or the 50-move rule are not yet fully implemented. Do not assume this preview covers every official tournament rule."
      ]
    ]
  },
  "hr": {
    "title": "Šahovska pravila",
    "subtitle": "Kratke upute za Animated 3D Chess",
    "sections": [
      [
        "Cilj igre",
        "Cilj je matirati protivničkog kralja. Bijeli igra prvi, zatim igrači vuku naizmjenično. Nije dopušten potez koji ostavlja vlastitog kralja u šahu."
      ],
      [
        "Kretanje figura",
        "Kralj: jedno polje u bilo kojem smjeru. Kraljica: neograničeno ravno ili dijagonalno. Top: neograničeno ravno. Lovac: neograničeno dijagonalno. Skakač: u obliku slova L (dva polja pa jedno u stranu), može preskakati figure. Pješak: jedno polje naprijed (dva sa svojeg početnog polja ako je put slobodan), uzima dijagonalno naprijed."
      ],
      [
        "Šah i šah-mat",
        "Šah znači da je kralj napadnut. Moraš ukloniti šah pomicanjem kralja, uzimanjem napadačke figure ili blokiranjem napada (kada je moguće). Ako izlaza nema, to je šah-mat. Ako nema legalnih poteza, ali kralj nije u šahu, to je pat (remi)."
      ],
      [
        "Rokada",
        "Odaberi kralja pa njegovo odredište (g-linija za malu, c-linija za veliku rokadu); možeš kliknuti i odgovarajući top. Kralj i top ne smiju biti ranije pomaknuti, put mora biti slobodan, kralj ne smije biti u šahu niti prolaziti preko napadnutog polja ili završiti na njemu. Obje figure pomiču se automatski."
      ],
      [
        "Promocija pješaka",
        "Kad pješak stigne do posljednjeg reda, u ovoj se verziji automatski pretvara u kraljicu."
      ],
      [
        "Kako igrati ovu igru",
        "Klikni ili dodirni figuru pa odaberi dopušteno polje. Povlačenjem lijevom tipkom ili jednim prstom okrećeš kameru; desnom tipkom ili dvama prstima pomičeš pogled; kotačićem ili štipanjem zumiraš. Nova igra pokreće partiju ispočetka, Razina AI-ja mijenja težinu, a H skriva ili vraća sučelje."
      ],
      [
        "Trenutačna ograničenja",
        "Posebno uzimanje „en passant” te remi zbog ponavljanja pozicije ili pravila 50 poteza još nisu u potpunosti podržani. Ova razvojna verzija ne obuhvaća sva turnirska pravila."
      ]
    ]
  },
  "de": {
    "title": "Schachregeln",
    "subtitle": "Kurzanleitung für Animated 3D Chess",
    "sections": [
      [
        "Ziel",
        "Setze den gegnerischen König schachmatt. Weiß beginnt; danach wird abwechselnd gezogen. Ein Zug, der den eigenen König im Schach lässt, ist verboten."
      ],
      [
        "Züge der Figuren",
        "König: ein Feld in jede Richtung. Dame: beliebig weit gerade oder diagonal. Turm: beliebig weit gerade. Läufer: beliebig weit diagonal. Springer: im L (zwei Felder und eines seitlich), darf Figuren überspringen. Bauer: ein Feld vorwärts (zwei vom Startfeld, wenn frei); schlägt ein Feld schräg nach vorn."
      ],
      [
        "Schach und Schachmatt",
        "Bei Schach ist dein König angegriffen. Du musst den Angriff durch Königszug, Schlagen des Angreifers oder Blockieren (falls möglich) abwehren. Gibt es keinen legalen Ausweg, ist es Schachmatt. Ohne legalen Zug und ohne Schach liegt Patt (Remis) vor."
      ],
      [
        "Rochade",
        "Wähle den König und anschließend sein Zielfeld (g-Linie für kurze, c-Linie für lange Rochade); alternativ kannst du den zugehörigen Turm anklicken. König und Turm dürfen noch nie gezogen haben; der Weg muss frei sein; der König darf weder im Schach stehen noch ein bedrohtes Feld überqueren oder darauf landen. Beide Figuren ziehen automatisch."
      ],
      [
        "Bauernumwandlung",
        "Erreicht ein Bauer die letzte Reihe, wird er in dieser Version automatisch zur Dame."
      ],
      [
        "Bedienung",
        "Figur anklicken oder antippen und ein legales Zielfeld wählen. Mit linker Maustaste oder einem Finger Kamera drehen, mit rechter Taste oder zwei Fingern verschieben; Mausrad oder Pinch zum Zoomen. Neues Spiel startet neu, KI-Stufe wählt die Schwierigkeit, H blendet die Steuerung ein oder aus."
      ],
      [
        "Aktuelle Einschränkungen",
        "En passant sowie Remis durch Stellungswiederholung oder die 50-Züge-Regel sind noch nicht vollständig umgesetzt. Diese Vorschau unterstützt nicht alle offiziellen Turnierregeln."
      ]
    ]
  },
  "it": {
    "title": "Regole degli scacchi",
    "subtitle": "Guida rapida ad Animated 3D Chess",
    "sections": [
      [
        "Obiettivo",
        "Dare scacco matto al re avversario. Muove prima il Bianco, poi si alternano i turni. Non puoi effettuare una mossa che lascia il tuo re sotto scacco."
      ],
      [
        "Movimenti dei pezzi",
        "Re: una casa in ogni direzione. Regina: qualsiasi numero di case in linea retta o diagonale. Torre: qualsiasi numero in linea retta. Alfiere: qualsiasi numero in diagonale. Cavallo: a L (due case e una di lato), può saltare altri pezzi. Pedone: una casa avanti (due dalla posizione iniziale se libere); cattura in diagonale in avanti."
      ],
      [
        "Scacco e scacco matto",
        "Sotto scacco il re è attaccato: devi difenderlo spostandolo, catturando l’attaccante o bloccando l’attacco (quando possibile). Se non esiste una mossa legale, è scacco matto. Se non esistono mosse legali ma il re non è sotto scacco, è stallo (patta)."
      ],
      [
        "Arrocco",
        "Seleziona il re e poi la casa di arrivo (colonna g per arrocco corto, c per lungo); puoi anche scegliere la torre corrispondente. Re e torre non devono essersi mai mossi, il percorso deve essere libero e il re non può essere sotto scacco né attraversare o raggiungere una casa attaccata. Entrambi si spostano automaticamente."
      ],
      [
        "Promozione del pedone",
        "Quando un pedone arriva all’ultima traversa, in questa versione diventa automaticamente una regina."
      ],
      [
        "Come giocare",
        "Tocca o fai clic su un pezzo e scegli una casa legale. Trascina col tasto sinistro o con un dito per ruotare la camera, col destro o due dita per spostarla; rotellina o pizzico per zoom. Nuova partita ricomincia, Livello IA cambia difficoltà, H nasconde o mostra i comandi."
      ],
      [
        "Limiti attuali",
        "La cattura en passant e le patte per ripetizione o regola delle 50 mosse non sono ancora completamente implementate. Questa anteprima non copre tutte le regole ufficiali da torneo."
      ]
    ]
  },
  "es": {
    "title": "Reglas del ajedrez",
    "subtitle": "Guía rápida de Animated 3D Chess",
    "sections": [
      [
        "Objetivo",
        "Dar jaque mate al rey rival. Las blancas mueven primero y luego se alternan los turnos. No está permitido hacer una jugada que deje a tu rey en jaque."
      ],
      [
        "Movimiento de las piezas",
        "Rey: una casilla en cualquier dirección. Dama: cualquier número de casillas en línea recta o diagonal. Torre: cualquier número en línea recta. Alfil: cualquier número en diagonal. Caballo: en L (dos casillas y una lateral), puede saltar piezas. Peón: una casilla hacia delante (dos desde la inicial si está libre); captura una casilla en diagonal hacia delante."
      ],
      [
        "Jaque y jaque mate",
        "Si el rey está en jaque, debes protegerlo moviéndolo, capturando al atacante o bloqueando el ataque cuando sea posible. Si no hay salida legal, es jaque mate. Si no existen jugadas legales pero el rey no está en jaque, es ahogado (tablas)."
      ],
      [
        "Enroque",
        "Selecciona el rey y después su casilla de destino (columna g para enroque corto, c para largo); también puedes pulsar la torre correspondiente. Rey y torre no deben haberse movido, el camino debe estar libre y el rey no puede estar en jaque ni cruzar o terminar en una casilla atacada. Ambas piezas se mueven automáticamente."
      ],
      [
        "Promoción del peón",
        "Cuando un peón alcanza la última fila, en esta versión se convierte automáticamente en dama."
      ],
      [
        "Cómo jugar",
        "Haz clic o toca una pieza y elige una casilla legal. Arrastra con el botón izquierdo o un dedo para girar la cámara; con el derecho o dos dedos para desplazarla; rueda o pellizca para zoom. Nueva partida reinicia, Nivel de IA cambia la dificultad y H oculta o muestra los controles."
      ],
      [
        "Limitaciones actuales",
        "La captura al paso y las tablas por repetición de posición o regla de 50 jugadas aún no están totalmente implementadas. Esta versión preliminar no cubre todas las reglas oficiales de torneo."
      ]
    ]
  }
};

export function RulesPanel({ onClose, language }: {onClose: () => void; language: Language}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const copy = RULES[language];
  useEffect(() => { closeRef.current?.focus(); }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === 'Escape') { onClose(); return; }
    if (event.key !== 'Tab') return;
    const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])'
    ) ?? []);
    if (!nodes.length) return;
    if (event.shiftKey && document.activeElement === nodes[0]) {
      event.preventDefault();
      nodes[nodes.length - 1].focus();
    } else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) {
      event.preventDefault();
      nodes[0].focus();
    }
  }
  return (
    <div className="wc-info-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div ref={dialogRef} className="wc-info-dialog wc-rules-dialog" role="dialog"
        aria-modal="true" aria-labelledby="wc-rules-title" onKeyDown={onKeyDown}
        onPointerDown={event => event.stopPropagation()}>
        <header className="wc-info-head">
          <div>
            <p className="wc-info-eyebrow">ANIMATED 3D CHESS</p>
            <h2 id="wc-rules-title">{copy.title}</h2>
            <p className="wc-info-subtitle">{copy.subtitle}</p>
          </div>
          <button ref={closeRef} type="button" className="wc-info-close" onClick={onClose}
            aria-label={TEXT[language].close} title={TEXT[language].close}>×</button>
        </header>
        <div className="wc-info-body wc-rules-body">
          {copy.sections.map(([heading, description], i) => (
            <section key={i}><h3>{heading}</h3><p>{description}</p></section>
          ))}
        </div>
      </div>
    </div>
  );
}
