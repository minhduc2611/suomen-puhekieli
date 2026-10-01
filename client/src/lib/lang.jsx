import { createContext, useContext, useEffect, useState } from 'react';

const KEY = 'puhu-suomee:lang';
const LangContext = createContext(null);

export const LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'vi', label: 'VI', name: 'Tiếng Việt' },
];

/**
 * Pick the right column for the active language.
 *   t(vocabRow, 'en')   → row.vi   when Vietnamese, else row.en
 *   t(vocabRow, 'note') → row.note_vi when Vietnamese, else row.note
 * Falls back to English whenever a translation is missing, so untranslated
 * content degrades to readable rather than blank.
 */
function translator(lang) {
  if (lang !== 'vi') return (obj, field) => obj?.[field] ?? null;
  return (obj, field) => {
    if (!obj) return null;
    // `en` pairs with `vi`; `rescue_en` pairs with `rescue_vi`; everything else takes `_vi`.
    const twin = field === 'en' ? 'vi'
      : field === 'rescue_en' ? 'rescue_vi'
      : `${field}_vi`;
    return obj[twin] ?? obj[field] ?? null;
  };
}

// Interface chrome. Finnish section names stay Finnish in both languages.
const UI = {
  en: {
    tagline: 'Spoken Finnish — the way people actually talk.',
    modules: 'modules', lessons: 'lessons', lesson: 'lesson',
    audioNote: 'every Finnish line plays aloud',
    allModules: '← All modules',
    warmup: 'Warm-up', vocabulary: 'Vocabulary', keyPhrases: 'Key phrases',
    listen: 'Listen', rolePlay: 'Role-play', rescueMove: 'Rescue move',
    whatWouldYouSay: 'What would you say?',
    ifItGoesWrong: 'If it all goes wrong, say this',
    dialoguesCount: (n) => `${n} dialogue${n === 1 ? '' : 's'}`,
    slowClear: 'slow & clear', realSpeed: 'real speed',
    playAll: '▶ Play all', stop: '■ Stop',
    showAll: 'Show all answers', hideAll: 'Hide all answers',
    show: 'Show the Finnish', hide: 'Hide',
    you: 'You', them: 'Them',
    prev: '← Previous', next: 'Next →',
    loading: 'Loading…',
    loadError: 'Could not load the course. Run `npm run content` and reload.',
    notFound: 'Lesson not found.',
    literally: 'lit.', bookForm: 'kirjakieli:',
    langTitle: 'Explanation language',
    saveAudio: '⤓ Save audio offline', savingAudio: 'Saving…',
    audioSaved: '✓ Available offline',
    audioMissing: 'No audio files — using the device voice',
    noFinnishVoice: '⚠ No Finnish voice on this device — tap for how to add one',
    speechFailed: '⚠ Audio did not play — tap for why',
    voiceLabel: 'Voice:',
    speechUnsupported: 'This browser has no speech support, so it cannot read the Finnish aloud. '
      + 'Try Safari or Chrome.',
    speechSilent: 'The speech engine accepted the line but played nothing. Try another Finnish '
      + 'voice below — macOS and iOS list novelty voices (Eddy, Flo, Rocko…) that are often not '
      + 'downloaded and stay silent. Satu is the dependable one.',
    voicesSeen: (n, name) => `This device reports ${n} voice${n === 1 ? '' : 's'}`
      + (name ? `, Finnish: ${name}.` : ', none of them Finnish.'),
    installVoice: 'iOS: Settings → Accessibility → Spoken Content → Voices → Finnish. '
      + 'Android: Settings → System → Languages → Text-to-speech output → install Finnish. '
      + 'Without it the Finnish is read by another language\u2019s voice and comes out wrong.',
    updateReady: 'A new version is ready.', reload: 'Reload',
    offline: 'Offline — showing saved lessons',
  },
  vi: {
    tagline: 'Tiếng Phần Lan nói — đúng như người ta nói hằng ngày.',
    modules: 'chương', lessons: 'bài', lesson: 'bài',
    audioNote: 'mọi câu tiếng Phần Lan đều phát được thành tiếng',
    allModules: '← Tất cả các chương',
    warmup: 'Khởi động', vocabulary: 'Từ vựng', keyPhrases: 'Mẫu câu chính',
    listen: 'Nghe', rolePlay: 'Đóng vai', rescueMove: 'Câu cứu nguy',
    whatWouldYouSay: 'Bạn sẽ nói gì?',
    ifItGoesWrong: 'Nếu bí quá, hãy nói câu này',
    dialoguesCount: (n) => `${n} đoạn hội thoại`,
    slowClear: 'chậm & rõ', realSpeed: 'tốc độ thật',
    playAll: '▶ Phát tất cả', stop: '■ Dừng',
    showAll: 'Hiện tất cả đáp án', hideAll: 'Ẩn tất cả đáp án',
    show: 'Hiện câu tiếng Phần Lan', hide: 'Ẩn',
    you: 'Bạn', them: 'Họ',
    prev: '← Bài trước', next: 'Bài sau →',
    loading: 'Đang tải…',
    loadError: 'Không tải được khoá học. Hãy chạy `npm run content` rồi tải lại.',
    notFound: 'Không tìm thấy bài học.',
    literally: 'nghĩa đen:', bookForm: 'tiếng viết:',
    langTitle: 'Ngôn ngữ giải thích',
    saveAudio: '⤓ Lưu âm thanh ngoại tuyến', savingAudio: 'Đang lưu…',
    audioSaved: '✓ Dùng được ngoại tuyến',
    audioMissing: 'Chưa có tệp âm thanh — đang dùng giọng của máy',
    noFinnishVoice: '⚠ Máy chưa có giọng tiếng Phần Lan — bấm để xem cách cài',
    speechFailed: '⚠ Không phát được âm thanh — bấm để xem vì sao',
    voiceLabel: 'Giọng:',
    speechUnsupported: 'Trình duyệt này không hỗ trợ đọc thành tiếng nên không đọc được tiếng Phần Lan. '
      + 'Hãy thử Safari hoặc Chrome.',
    speechSilent: 'Bộ đọc đã nhận câu nhưng không phát ra gì. Hãy thử một giọng tiếng Phần Lan khác '
      + 'ở bên dưới — macOS và iOS có những giọng vui (Eddy, Flo, Rocko…) thường chưa được tải về '
      + 'nên không phát ra tiếng. Satu là giọng đáng tin cậy.',
    voicesSeen: (n, name) => `Máy này báo có ${n} giọng`
      + (name ? `, tiếng Phần Lan: ${name}.` : ', không có giọng tiếng Phần Lan nào.'),
    installVoice: 'iOS: Cài đặt → Trợ năng → Nội dung đọc → Giọng nói → Tiếng Phần Lan. '
      + 'Android: Cài đặt → Hệ thống → Ngôn ngữ → Đầu ra chuyển văn bản thành lời nói → cài tiếng Phần Lan. '
      + 'Không có nó thì tiếng Phần Lan sẽ bị đọc bằng giọng của ngôn ngữ khác và sai hoàn toàn.',
    updateReady: 'Đã có phiên bản mới.', reload: 'Tải lại',
    offline: 'Ngoại tuyến — hiển thị các bài đã lưu',
  },
};

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'en' || saved === 'vi') return saved;
    } catch { /* private mode, blocked storage — fall through */ }
    return navigator.language?.startsWith('vi') ? 'vi' : 'en';
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang, t: translator(lang), ui: UI[lang] }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside <LangProvider>');
  return ctx;
}

export function LangSwitch() {
  const { lang, setLang, ui } = useLang();
  return (
    <div className="lang-switch" role="group" aria-label={ui.langTitle} title={ui.langTitle}>
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          className={l.code === lang ? 'on' : ''}
          onClick={() => setLang(l.code)}
          aria-pressed={l.code === lang}
          title={l.name}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
