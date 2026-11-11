import { useRef } from 'react';
import type { Language } from './InfoPanel';
import { LANGUAGE_CODES, LANGUAGE_NAMES, t } from './i18n.js';

export function Flag({ code }: { code: Language }) {
  return (
    <svg className="wc-flag" width="28" height="19" viewBox="0 0 30 20" role="img" aria-label={LANGUAGE_NAMES[code]}>
      <defs><clipPath id={`flag-${code}`}><rect x="0" y="0" width="30" height="20" rx="2" /></clipPath></defs>
      <g clipPath={`url(#flag-${code})`}>
        {code === 'en' && <><rect width="30" height="20" fill="#18367c"/>
          <path d="M0 0 L30 20 M30 0 L0 20" stroke="white" strokeWidth="5"/>
          <path d="M0 0 L30 20 M30 0 L0 20" stroke="#c92336" strokeWidth="2"/>
          <path d="M15 0 V20 M0 10 H30" stroke="white" strokeWidth="7"/>
          <path d="M15 0 V20 M0 10 H30" stroke="#c92336" strokeWidth="3.5"/></>}
        {code === 'hr' && <><rect width="30" height="7" fill="#ed2939"/><rect y="7" width="30" height="6" fill="white"/><rect y="13" width="30" height="7" fill="#164e9f"/>
          <path d="M11 6 L19 6 L19 13 Q15 18 11 13 Z" fill="white" stroke="#cccccc" strokeWidth=".5"/>
          {Array.from({length: 15}, (_,i)=><rect key={i} x={11.5+(i%5)*1.4} y={7+Math.floor(i/5)*1.8} width="1.4" height="1.8" fill={(Math.floor(i/5)+(i%5))%2===0?'#e11c35':'#ffffff'}/>)}</>}
        {code === 'de' && <><rect width="30" height="7" fill="#171717"/><rect y="7" width="30" height="6" fill="#dd171d"/><rect y="13" width="30" height="7" fill="#ffce00"/></>}
        {code === 'it' && <><rect width="10" height="20" fill="#009246"/><rect x="10" width="10" height="20" fill="white"/><rect x="20" width="10" height="20" fill="#ce2b37"/></>}
        {code === 'es' && <><rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/><rect x="9" y="8" width="3" height="5" rx=".5" fill="#aa151b"/><rect x="9.7" y="7.2" width="1.6" height="1" fill="#ffffff"/></>}
      </g>
      <rect x=".4" y=".4" width="29.2" height="19.2" rx="2" stroke="#ffffff" strokeOpacity=".28" fill="none" strokeWidth=".8" />
    </svg>
  );
}

export function LanguagePicker({ language, onChange }: { language: Language; onChange: (next: Language) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={ref} className="wc-language-picker" onKeyDown={(e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); ref.current?.removeAttribute('open'); ref.current?.querySelector('summary')?.focus(); }
    }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) ref.current?.removeAttribute('open'); }}>
      <summary aria-label={`${t('language', language)}: ${LANGUAGE_NAMES[language]}`} title={t('language', language)}>
        <Flag code={language} /><span>{language.toUpperCase()}</span><span aria-hidden="true">▾</span>
      </summary>
      <div className="wc-language-menu" role="group" aria-label={t('language', language)}>
        {(LANGUAGE_CODES as Language[]).map(code => (
          <button key={code} type="button" className={language === code ? 'selected' : ''} aria-pressed={language === code}
            onClick={() => { onChange(code); ref.current?.removeAttribute('open'); ref.current?.querySelector('summary')?.focus(); }}>
            <Flag code={code} /><span>{LANGUAGE_NAMES[code]}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
