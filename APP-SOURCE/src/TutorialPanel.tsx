import {useEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import type {Language} from './InfoPanel';
import {P1G_COPY} from './P1gCopy';
import {getTutorialSquares} from './tutorialMoves.mjs';
import './tutorial.css';
const lessons=[
 {glyph:'♙',from:[6,3],to:[5,3]},
 {glyph:'♖',from:[4,3],to:[4,6]},
 {glyph:'♘',from:[4,3],to:[2,4]},
 {glyph:'♗',from:[4,3],to:[2,5]},
 {glyph:'♕',from:[4,3],to:[2,5]},
 {glyph:'♔',from:[4,3],to:[3,4]}
];
const moveLegend={
 en:{moves:'Possible moves',captures:'Captures'},
 hr:{moves:'Dopušteni potezi',captures:'Uzimanje figure'},
 de:{moves:'Mögliche Züge',captures:'Schlagzüge'},
 it:{moves:'Mosse possibili',captures:'Catture'},
 es:{moves:'Movimientos posibles',captures:'Capturas'}
};
export function TutorialPanel({language,onClose}:{language:Language;onClose:()=>void}){
 const [index,setIndex]=useState(0);
 const closeRef=useRef<HTMLButtonElement>(null);
 const labels=P1G_COPY[language],lesson=lessons[index];
 const legend=moveLegend[language];
 const destinations=getTutorialSquares(index,lesson.from[0],lesson.from[1]);
 const legalSquares=new Set<number>((destinations.moves as [number,number][]).map(([r,c]:[number,number])=>r*8+c));
 const captureSquares=new Set<number>((destinations.captures as [number,number][]).map(([r,c]:[number,number])=>r*8+c));
 useEffect(()=>{
  closeRef.current?.focus();
  const handler=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
  window.addEventListener('keydown',handler);
  return ()=>window.removeEventListener('keydown',handler);
 },[onClose]);
 const style={'--dx':`${(lesson.to[1]-lesson.from[1])*100}%`,
  '--dy':`${(lesson.to[0]-lesson.from[0])*100}%`,
  left:`${lesson.from[1]*12.5}%`,top:`${lesson.from[0]*12.5}%`} as CSSProperties;
 return <div className="wc-tutorial-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <section className="wc-tutorial-panel" role="dialog" aria-modal="true" aria-label={labels.lesson}>
   <header><h2>{labels.lesson}</h2><button type="button" ref={closeRef} onClick={onClose}>{labels.close} ✕</button></header>
   <p>{index+1} {labels.of} 6</p><h3>{labels.pieces[index][0]}</h3>
   <p>{labels.pieces[index][1]}</p>
   <div className="wc-mini-board" aria-label={labels.pieces[index][1]}>
    {Array.from({length:64},(_,j)=><div key={j} className={'wc-mini-square '+((Math.floor(j/8)+j%8)%2?'dark':'light')+
      (legalSquares.has(j)?' legal':'')+(captureSquares.has(j)?' capture':'')+
      (Math.floor(j/8)===lesson.to[0]&&j%8===lesson.to[1]?' target':'')}/>)}
    {index===0&&[[5,2],[5,4]].map(([r,c])=><div key={r*8+c} className="wc-mini-enemy" style={{left:`${c*12.5}%`,top:`${r*12.5}%`}} aria-hidden="true">♟</div>)}
    <div key={index} className="wc-mini-moving-piece" style={style} aria-hidden="true">{lesson.glyph}</div>
   </div>
   <div className="wc-mini-legend">
     <span><span className="wc-mini-legend-box legal" aria-hidden="true"/>{legend.moves}</span>
     {index===0&&<span><span className="wc-mini-legend-box capture" aria-hidden="true"/>{legend.captures}</span>}
   </div>
   <p>{labels.hint}</p>
   <footer><button type="button" onClick={()=>setIndex(i=>(i+5)%6)}>{labels.prev}</button>
     <button type="button" onClick={()=>setIndex(i=>(i+1)%6)}>{labels.next}</button></footer>
  </section>
 </div>;
}
