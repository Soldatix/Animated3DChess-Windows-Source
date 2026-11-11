import './pwaInstall.css';
import {getLanguage} from './i18n.js';

const COPY={
 en:{title:'Install Animated 3D Chess',install:'Install Web App',close:'Close',hint:'Install this game as an app on your device.',fallback:'Choose Install app or Add to Home Screen in the browser menu.',ios:'On iPhone/iPad choose Share, then Add to Home Screen.'},
 hr:{title:'Instaliraj Animated 3D Chess',install:'Instaliraj Web App',close:'Zatvori',hint:'Instaliraj igru kao aplikaciju na svoj uređaj.',fallback:'U izborniku preglednika odaberi Instaliraj aplikaciju ili Dodaj na početni zaslon.',ios:'Na iPhoneu/iPadu odaberi Dijeli, zatim Dodaj na početni zaslon.'},
 de:{title:'Animated 3D Chess installieren',install:'Web-App installieren',close:'Schließen',hint:'Installiere das Spiel als App auf deinem Gerät.',fallback:'Im Browsermenü App installieren oder Zum Startbildschirm hinzufügen wählen.',ios:'Auf iPhone/iPad Teilen und dann Zum Home-Bildschirm wählen.'},
 it:{title:'Installa Animated 3D Chess',install:'Installa Web App',close:'Chiudi',hint:'Installa il gioco come app sul tuo dispositivo.',fallback:'Nel menu del browser scegli Installa app o Aggiungi alla schermata Home.',ios:'Su iPhone/iPad scegli Condividi e Aggiungi alla schermata Home.'},
 es:{title:'Instalar Animated 3D Chess',install:'Instalar Web App',close:'Cerrar',hint:'Instala el juego como aplicación en tu dispositivo.',fallback:'En el menú del navegador elige Instalar aplicación o Añadir a pantalla de inicio.',ios:'En iPhone/iPad elige Compartir y Añadir a pantalla de inicio.'}
};
const standalone=()=>window.matchMedia?.('(display-mode: standalone)')?.matches===true||window.navigator.standalone===true;
function initPwa(){
 if(!document.body||standalone())return;
 const requested=new URLSearchParams(location.search).get('install')==='web';
 let promptEvent=null,closed=false,installed=false,showHelp=false;
 const panel=document.createElement('section');panel.className='wc-pwa-panel';panel.hidden=true;
 panel.setAttribute('role','region');panel.setAttribute('aria-live','polite');
 const heading=document.createElement('strong'),hint=document.createElement('span'),actions=document.createElement('div');
 actions.className='wc-pwa-actions';hint.className='wc-pwa-message';
 const button=document.createElement('button'),close=document.createElement('button');
 button.type='button';close.type='button';button.className='wc-pwa-install';close.className='wc-pwa-close';
 actions.append(button,close);panel.append(heading,hint,actions);document.body.append(panel);
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||
   (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 function render(){
   const c=COPY[getLanguage()]||COPY.en;
   heading.textContent=c.title;button.textContent=c.install;close.textContent=c.close;
   hint.textContent=showHelp?(ios?c.ios:c.fallback):c.hint;
   panel.hidden=closed||installed||standalone()||!(requested||promptEvent);
 }
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptEvent=e;showHelp=false;render();});
 window.addEventListener('appinstalled',()=>{installed=true;promptEvent=null;render();});
 window.matchMedia?.('(display-mode: standalone)')?.addEventListener?.('change',render);
 // Synchronize label after the existing React language-picker updates its i18n state.
 document.addEventListener('click',()=>requestAnimationFrame(render));
 close.addEventListener('click',()=>{closed=true;render();});
 button.addEventListener('click',async()=>{
   const e=promptEvent;
   if(!e){showHelp=true;render();return;}
   promptEvent=null;
   try{await e.prompt();const choice=await e.userChoice;
     if(choice?.outcome==='accepted')closed=true;else showHelp=true;
   }catch(_){showHelp=true;}
   render();
 });
 render();
 if('serviceWorker' in navigator&&import.meta.env.PROD&&window.isSecureContext){
   navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(e=>
     console.warn('Chess offline service worker unavailable',e));
 }
}
initPwa();
