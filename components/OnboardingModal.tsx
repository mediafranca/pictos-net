import React, { useState, useCallback } from 'react';
import { Sparkles, Settings, Globe, Users, ArrowRight, ArrowLeft, Upload, Compass, PenTool } from 'lucide-react';
import type { TranslationKey } from '../locales';

const STYLES = [
  { id: 'senaletica', label: 'Señalética color', desc: 'senaletica' },
  { id: 'editorial', label: 'Editorial moderna', desc: 'editorial' },
  { id: 'sketch', label: 'Sketch minimal', desc: 'sketch' },
  { id: 'foto', label: 'Escena descriptiva', desc: 'foto' },
] as const;

const STYLE_DESCS: Record<string, { es: string; en: string }> = {
  senaletica: { es: 'Para tableros AAC, señalización, alta densidad de símbolos', en: 'For AAC boards, signage, high symbol density' },
  editorial: { es: 'Para materiales educativos adultos, comunicación terapéutica', en: 'For adult educational materials, therapeutic communication' },
  sketch: { es: 'Para contextos informales, materiales cercanos, familias', en: 'For informal contexts, close materials, families' },
  foto: { es: 'Para comunicación contextual, escenas sociales, narrativas visuales', en: 'For contextual communication, social scenes, visual narratives' },
};

const PHRASES = [
  { id: 'quiero_ir_al_bano', es: 'Quiero ir al baño', en: 'I want to go to the bathroom' },
  { id: 'estoy_enojado_quiero_estar_sol', es: 'Estoy enojado, quiero estar solo', en: "I'm angry, I want to be alone" },
  { id: 'me_duele_la_cabeza', es: 'Me duele la cabeza', en: 'I have a headache' },
  { id: 'vamos_a_comer_al_parque', es: 'Vamos a comer al parque', en: "Let's go eat at the park" },
  { id: 'necesito_ayuda', es: 'Necesito ayuda', en: 'I need help' },
  { id: 'hoy_es_mi_cumpleanos', es: 'Hoy es mi cumpleaños', en: "Today is my birthday" },
] as const;

const STYLE_PROMPTS: Record<string, string> = {
  senaletica: `Pictographic style inspired by the AIGA/DOT public signage system. High abstraction, geometric synthesis, instant readability at small sizes.
Figures and objects built from simple geometric primitives: circles, rectangles, rounded shapes. No organic curves, no hand-drawn feel. Clean, mechanical precision.
Uniform stroke weight throughout; prefer filled shapes over outlines. Where outlines are necessary, use a single consistent weight with rounded caps.
Color palette: 3-5 flat, saturated colors with high contrast against white background. Use color semantically: one color per role (e.g., blue for person, orange for object, green for action/context). No gradients, no textures, no patterns.
Human figures: simplified to essential posture and gesture. No facial features, no fingers, no clothing detail. Differentiate actions through body angle, arm position, and relationship to objects.
Composition: single concept per image, centered, generous negative space. No ground line, no environment, no decorative elements.
Exclude: shadows, depth, perspective, text, labels, frames, ornaments, texture fills.`,
  editorial: `CRITICAL: NEVER include any text, letters, numbers, words, labels, captions, or written symbols of any kind. All meaning must be conveyed purely through visual and gestural elements.
Contemporary editorial illustration style. Warm, sophisticated, suitable for adult audiences. Mid-level abstraction: recognizable but stylized, never photorealistic.
All communicative intent must be expressed through facial expression, body posture, hand gestures, spatial relationships, and visual metaphor. Emotions are shown through face and body, not symbols or words. Actions are shown through movement and context, not labels.
Organic shapes with confident, slightly irregular contours. Visible hand of the illustrator: subtle imperfections that give personality without looking rough. Smooth curves, no sharp geometric edges.
Line work: variable stroke weight with emphasis on key contours. Thin secondary lines for internal detail. No outlines on filled areas where color contrast is sufficient.
Color palette: 4-6 muted, desaturated tones. Earthy and warm: terracotta, ochre, olive, slate blue, warm grey, off-white. One accent color (e.g., coral or teal) used sparingly for semantic emphasis. Flat fills only, no gradients.
Human figures: stylized proportions (slightly elongated limbs, simplified hands). Minimal but present facial features: dot eyes, simple nose angle, no mouth unless emotion is the primary message. Clothing suggested through color blocks, not detail. Diverse body types and skin tones through palette variation.
Composition: figure centered with breathing room. Minimal contextual elements allowed if they clarify the scene (e.g., a table surface, a doorframe) but never a full environment. Suggestion over description.
Exclude: cartoon expressions, exaggerated features, childish proportions, gradients, photographic texture, drop shadows, 3D effects, decorative borders, text, letters, numbers, writing, captions, speech bubbles.`,
  sketch: `CRITICAL: NEVER include any text, letters, numbers, words, labels, captions, or written symbols of any kind. All meaning must be conveyed purely through visual and gestural elements.
Hand-drawn minimal sketch style. Looks like a quick, confident ink drawing in a field notebook. The imperfection is intentional: it communicates warmth and approachability.
All communicative intent must be expressed through body posture, gestural lines, spatial proximity between elements, and visual metaphor. With minimal strokes available, every line must serve communication: a reaching arm means asking, a turned back means rejection, proximity means togetherness.
Single-weight fine line, as if drawn with a 0.3mm felt-tip pen. Slightly uneven strokes with natural hand tremor. Lines do not always close perfectly. No fills, no solid areas: everything is communicated through contour and a few interior lines.
Pure black ink on white. No color, no grey, no halftone. If one accent color is needed for semantic distinction, use a single muted tone (e.g., soft red, dusty blue) applied as a loose, imprecise wash that does not align perfectly with the contours.
Human figures: gestural, captured in 8-12 strokes maximum. Proportions approximate but plausible. Head as a circle or oval, body as a few quick lines suggesting posture. Hands as simple mitten shapes. No facial detail beyond a dot for the eye. Expression comes entirely from body language.
Objects: reduced to their diagnostic features. A cup is an arc and a handle. A door is a rectangle and a small circle. Nothing more than what is needed for recognition.
Composition: slightly off-center, as if drawn quickly. Generous white space. No frame, no ground line, no background.
Exclude: perfect geometry, uniform strokes, fills, shading, crosshatching, multiple line weights, decorative elements, text, letters, numbers, writing, captions, speech bubbles, labels.`,
  foto: `CRITICAL: NEVER include any text, letters, numbers, words, labels, captions, or written symbols of any kind. All meaning must be conveyed purely through visual and gestural elements.
Descriptive scene pictographic style. Clean, narrative, able to show context and relationships. Like a visual instruction manual or infographic vignette — clear, readable, informative.
All communicative intent must be expressed through body posture, gesture, spatial arrangement of figures and objects, and visual hierarchy. Use scale, position, and proximity to show relationships. A person wanting something faces and reaches toward the object. Emotions are shown through posture and head tilt, not symbols.
Visual hierarchy through color: primary figures and actors rendered in solid black silhouette. Secondary elements (objects being interacted with, destinations, tools) in medium grey. Environmental or contextual elements (furniture, room boundaries, trees, ground) in light grey. Color is used ONLY when it carries essential semantic meaning that cannot be communicated otherwise — e.g., red for pain/danger/heat, blue for water/cold, green for nature/go. Maximum one accent color per image. When no semantic color is needed, the image is entirely black, grey, and white.
Figures: simplified but proportionate, slightly more detailed than pure signage. Clear posture and gesture. Hands can grasp objects. Head direction indicates attention. Bodies show weight and stance. No facial features — expression comes from body language only.
Objects and environment: reduced to essential recognizable features but can include contextual elements (a table, a door frame, a tree, a path) when they clarify the scene. Objects are simplified outlines or filled shapes, never photorealistic. Diagnostic features only: a bed is a rectangle with a pillow shape, a park is a tree and a bench.
Composition: can be more complex than single-concept pictograms. Multiple figures and objects allowed when the utterance describes a scene. Use spatial depth through layering (foreground figures larger, background elements smaller and lighter). Generous white space around the scene. No decorative frames or borders.
Geometry: clean vector shapes, rounded corners, consistent stroke weight for outlines. Flat 2D with subtle spatial layering through size and grey value, never through perspective, shadows, or 3D effects.
Exclude: photorealism, gradients, textures, patterns, shadows, perspective lines, 3D rendering, isometric projection, decorative elements, text, letters, numbers, writing, captions, speech bubbles, question marks, exclamation marks.`,
};

function imgSrc(styleId: string, phraseId: string): string {
  return `/onboarding/${styleId}_${phraseId}.jpg`;
}

type TFunc = (key: TranslationKey) => string;
type LangCode = 'es-419' | 'en-GB';

interface OnboardingModalProps {
  t: TFunc;
  lang: LangCode;
  onClose: () => void;
  onSelectPreset: (stylePrompt: string) => void;
  onImportPhrases: () => void;
  onGoHome: () => void;
  onFocusSearch: () => void;
}

const OnboardingModal: React.FC<OnboardingModalProps> = ({ t, lang, onClose, onSelectPreset, onImportPhrases, onGoHome, onFocusSearch }) => {
  const [step, setStep] = useState(1);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [currentPhrase, setCurrentPhrase] = useState(0);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const lk = lang.startsWith('es') ? 'es' : 'en';
  const totalSteps = 4;

  const handleFinish = useCallback((action?: 'import' | 'explore' | 'create') => {
    if (selectedPreset && STYLE_PROMPTS[selectedPreset]) {
      onSelectPreset(STYLE_PROMPTS[selectedPreset]);
    }
    onClose();
    if (action === 'import') onImportPhrases();
    else if (action === 'explore') onGoHome();
    else if (action === 'create') onFocusSearch();
  }, [selectedPreset, onClose, onSelectPreset, onImportPhrases, onGoHome, onFocusSearch]);

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300">
        {/* Modal */}
        <div className="bg-white border border-slate-200 rounded-2xl w-[92vw] max-w-[960px] max-h-[88vh] overflow-y-auto shadow-2xl relative">

          {/* Header */}
          <div className="px-7 pt-6 flex justify-between items-start">
            <div className="flex gap-2 items-center">
              {Array.from({ length: totalSteps }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i + 1)}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    i + 1 === step ? 'bg-violet-500 scale-125' :
                    i + 1 < step ? 'bg-orange-400' : 'bg-slate-300'
                  }`}
                />
              ))}
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">
              {t('onboarding.skipAll')}
            </button>
          </div>

          {/* Body */}
          <div className="px-7 pt-5 pb-6">
            {step === 1 && <Step1 t={t} />}
            {step === 2 && (
              <Step2
                t={t}
                lk={lk}
                currentPhrase={currentPhrase}
                onChangePhrase={setCurrentPhrase}
                onLightbox={setLightboxSrc}
              />
            )}
            {step === 3 && (
              <Step3
                t={t}
                lk={lk}
                selectedPreset={selectedPreset}
                onSelectPreset={setSelectedPreset}
              />
            )}
            {step === 4 && <Step4 t={t} onAction={handleFinish} />}
          </div>

          {/* Footer */}
          <div className="px-7 pb-6 flex justify-between items-center">
            {step > 1 ? (
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 text-sm"
              >
                <ArrowLeft size={14} /> {t('onboarding.back')}
              </button>
            ) : <div />}

            {step < totalSteps ? (
              <button
                onClick={() => setStep(s => s + 1)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500 text-sm font-medium"
              >
                {step === 1 && t('onboarding.seeHow')}
                {step === 2 && t('onboarding.makeItYours')}
                {step === 3 && (selectedPreset ? t('onboarding.saveStyle') : t('onboarding.useDefault'))}
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={() => handleFinish()}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 text-sm"
              >
                {t('onboarding.startWithout')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center cursor-pointer"
          onClick={() => setLightboxSrc(null)}
        >
          <img src={lightboxSrc} alt="" className="max-w-[85vw] max-h-[85vh] rounded-xl shadow-2xl" />
        </div>
      )}
    </>
  );
};

/* ── Step 1: Bienvenida ── */
const Step1: React.FC<{ t: TFunc }> = ({ t }) => (
  <div>
    <h1 className="text-2xl font-semibold text-slate-900 mb-4 leading-tight">
      {t('onboarding.step1.title')}<span className="text-violet-600">{t('onboarding.step1.highlight')}</span>
    </h1>
    <p className="text-slate-500 text-sm leading-relaxed mb-5">
      {t('onboarding.step1.intro')}
    </p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <FeatureCard icon={<Sparkles size={20} />} title={t('onboarding.step1.generative')} desc={t('onboarding.step1.generativeDesc')} />
      <FeatureCard icon={<Settings size={20} />} title={t('onboarding.step1.customizable')} desc={t('onboarding.step1.customizableDesc')} />
      <FeatureCard icon={<Globe size={20} />} title={t('onboarding.step1.open')} desc={t('onboarding.step1.openDesc')} />
      <FeatureCard icon={<Users size={20} />} title={t('onboarding.step1.codesign')} desc={t('onboarding.step1.codesignDesc')} />
    </div>
  </div>
);

const FeatureCard: React.FC<{ icon: React.ReactNode; title: string; desc: string }> = ({ icon, title, desc }) => (
  <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
    <div className="text-violet-600 mb-2.5">{icon}</div>
    <h3 className="text-slate-900 text-sm font-medium mb-1">{title}</h3>
    <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
  </div>
);

/* ── Step 2: Galería ── */
const Step2: React.FC<{
  t: TFunc;
  lk: 'es' | 'en';
  currentPhrase: number;
  onChangePhrase: (i: number) => void;
  onLightbox: (src: string) => void;
}> = ({ t, lk, currentPhrase, onChangePhrase, onLightbox }) => (
  <div>
    <h2 className="text-xl font-semibold text-slate-900 mb-1">{t('onboarding.step2.title')}</h2>
    <p className="text-slate-500 text-sm leading-relaxed mb-5">
      {t('onboarding.step2.intro')}<strong className="text-slate-900">{t('onboarding.step2.introHighlight')}</strong>.
    </p>

    {/* Phrase nav */}
    <div className="flex gap-2 mb-4 flex-wrap">
      {PHRASES.map((p, i) => (
        <button
          key={p.id}
          onClick={() => onChangePhrase(i)}
          className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
            i === currentPhrase
              ? 'bg-violet-600 border-violet-600 text-white'
              : 'bg-white border-slate-200 text-slate-500 hover:border-violet-400 hover:text-slate-700'
          }`}
        >
          {p[lk]}
        </button>
      ))}
    </div>

    {/* Gallery grid */}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {STYLES.map(s => (
        <button
          key={s.id}
          onClick={() => onLightbox(imgSrc(s.id, PHRASES[currentPhrase].id))}
          className="bg-white rounded-xl overflow-hidden border border-slate-200 hover:border-violet-400 transition-all hover:-translate-y-0.5 hover:shadow-md text-left"
        >
          <img
            src={imgSrc(s.id, PHRASES[currentPhrase].id)}
            alt={`${s.label} — ${PHRASES[currentPhrase][lk]}`}
            className="w-full aspect-square object-cover bg-slate-50"
          />
          <div className="px-3 py-2.5 text-center">
            <span className="text-slate-500 text-xs font-medium">{s.label}</span>
          </div>
        </button>
      ))}
    </div>

    <div className="bg-slate-50 border-l-[3px] border-violet-400 mt-5 px-4 py-3 rounded-r-lg">
      <p className="text-slate-500 text-xs leading-relaxed">
        <strong className="text-slate-700">{t('onboarding.step2.note')}</strong> {t('onboarding.step2.noteText')}
      </p>
    </div>
  </div>
);

/* ── Step 3: Elegir preset ── */
const Step3: React.FC<{
  t: TFunc;
  lk: 'es' | 'en';
  selectedPreset: string | null;
  onSelectPreset: (id: string) => void;
}> = ({ t, lk, selectedPreset, onSelectPreset }) => (
  <div>
    <h2 className="text-xl font-semibold text-slate-900 mb-1">{t('onboarding.step3.title')}</h2>
    <p className="text-slate-500 text-xs mb-5">
      {t('onboarding.step3.subtitle')}
    </p>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {STYLES.map(s => (
        <button
          key={s.id}
          onClick={() => onSelectPreset(s.id)}
          className={`text-left bg-white rounded-xl border-2 p-5 transition-all relative ${
            selectedPreset === s.id
              ? 'border-violet-500 bg-violet-50'
              : 'border-slate-200 hover:border-violet-400'
          }`}
        >
          {selectedPreset === s.id && (
            <span className="absolute top-3 right-3 w-6 h-6 bg-violet-500 text-white rounded-full flex items-center justify-center text-xs">
              &#10003;
            </span>
          )}
          <h3 className="text-slate-900 text-sm font-medium mb-1">{s.label}</h3>
          <p className="text-slate-500 text-xs leading-relaxed mb-3">{STYLE_DESCS[s.id][lk]}</p>
          <div className="flex gap-1.5">
            {PHRASES.slice(0, 3).map(p => (
              <img
                key={p.id}
                src={imgSrc(s.id, p.id)}
                alt=""
                className="w-14 h-14 rounded-lg object-cover bg-slate-50"
              />
            ))}
          </div>
        </button>
      ))}
    </div>

    <div className="bg-slate-50 border-l-[3px] border-violet-400 mt-5 px-4 py-3 rounded-r-lg">
      <p className="text-slate-500 text-xs leading-relaxed">
        <strong className="text-slate-700">{t('onboarding.step3.noteLabel')}</strong>{' '}
        {t('onboarding.step3.noteText')}
      </p>
    </div>
  </div>
);

/* ── Step 4: Caminos para empezar ── */
const Step4: React.FC<{ t: TFunc; onAction: (action: 'import' | 'explore' | 'create') => void }> = ({ t, onAction }) => (
  <div>
    <h2 className="text-xl font-semibold text-slate-900 mb-1">{t('onboarding.step4.title')}</h2>
    <p className="text-slate-500 text-xs mb-5">{t('onboarding.step4.subtitle')}</p>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <button onClick={() => onAction('import')} className="bg-white rounded-xl border border-slate-200 p-6 text-center hover:border-violet-400 hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer">
        <div className="text-violet-600 mx-auto mb-3"><Upload size={28} /></div>
        <h3 className="text-slate-900 text-base font-medium mb-2">{t('onboarding.step4.import')}</h3>
        <p className="text-slate-500 text-xs leading-relaxed">{t('onboarding.step4.importDesc')}</p>
      </button>
      <button onClick={() => onAction('explore')} className="bg-white rounded-xl border border-slate-200 p-6 text-center hover:border-violet-400 hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer">
        <div className="text-violet-600 mx-auto mb-3"><Compass size={28} /></div>
        <h3 className="text-slate-900 text-base font-medium mb-2">{t('onboarding.step4.explore')}</h3>
        <p className="text-slate-500 text-xs leading-relaxed">{t('onboarding.step4.exploreDesc')}</p>
      </button>
      <button onClick={() => onAction('create')} className="bg-white rounded-xl border border-slate-200 p-6 text-center hover:border-violet-400 hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer">
        <div className="text-violet-600 mx-auto mb-3"><PenTool size={28} /></div>
        <h3 className="text-slate-900 text-base font-medium mb-2">{t('onboarding.step4.create')}</h3>
        <p className="text-slate-500 text-xs leading-relaxed">{t('onboarding.step4.createDesc')}</p>
      </button>
    </div>

    <div className="bg-slate-50 border-l-[3px] border-violet-400 mt-5 px-4 py-3 rounded-r-lg">
      <p className="text-slate-500 text-xs leading-relaxed">
        <strong className="text-slate-700">{t('onboarding.step4.note')}</strong>{' '}
        {t('onboarding.step4.noteText')}
      </p>
    </div>
  </div>
);

export default OnboardingModal;
