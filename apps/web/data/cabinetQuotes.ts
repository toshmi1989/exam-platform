/**
 * Цитаты для карточки приветствия в личном кабинете.
 * Отображаются по кругу при каждом заходе на страницу.
 */
export type CabinetQuote = {
  ru: string;
  en: string;
  uz: string;
};

export const CABINET_QUOTES: CabinetQuote[] = [
  { ru: 'Учиться никогда не поздно.', en: 'It is never too late to learn.', uz: 'O‘rganish uchun hech qachon kech emas.' },
  { ru: 'Знание — сила.', en: 'Knowledge is power.', uz: 'Bilim — kuch.' },
  { ru: 'Повторение — мать учения.', en: 'Practice makes perfect.', uz: 'Takrorlash — o‘rganishning onasi.' },
  { ru: 'Терпение и труд всё перетрут.', en: 'Patience and hard work conquer all.', uz: 'Sabr va mehnat hamma narsani yengadi.' },
  { ru: 'Век живи — век учись.', en: 'Live and learn.', uz: 'Yashang va o‘rganing.' },
  { ru: 'Спокойствие помогает думать яснее.', en: 'Calmness helps you think more clearly.', uz: 'Tinchlik aniqroq o‘ylashga yordam beradi.' },
  { ru: 'Маленькие шаги ведут к большим целям.', en: 'Small steps lead to big goals.', uz: 'Kichik qadamlar katta maqsadlarga olib boradi.' },
  { ru: 'Каждый день — новая возможность.', en: 'Every day is a new opportunity.', uz: 'Har kun — yangi imkoniyat.' },
  { ru: 'Сосредоточьтесь на одном деле — и добьётесь результата.', en: 'Focus on one thing and you will achieve it.', uz: 'Bir narsaga e’tibor bering — natijaga erishasiz.' },
  { ru: 'Успех приходит к тем, кто не сдаётся.', en: 'Success comes to those who don\'t give up.', uz: 'Muvaffaqiyat tushunmaydiganlarga keladi.' },
  { ru: 'Читать — значит открывать новые миры.', en: 'To read is to discover new worlds.', uz: 'O‘qish — yangi dunyolarni ochish.' },
  { ru: 'Доверяйте процессу обучения.', en: 'Trust the learning process.', uz: 'O‘rganish jarayoniga ishoning.' },
  { ru: 'Отдых — часть продуктивного дня.', en: 'Rest is part of a productive day.', uz: 'Dam olish — samarali kunning bir qismi.' },
  { ru: 'Вопросы ведут к пониманию.', en: 'Questions lead to understanding.', uz: 'Savollar tushunishga olib boradi.' },
  { ru: 'Сегодня лучше, чем вчера — уже победа.', en: 'Better today than yesterday is already a win.', uz: 'Kecha kundan yaxshi — bu allaqachon g‘alaba.' },
  { ru: 'Дисциплина важнее мотивации.', en: 'Discipline beats motivation.', uz: 'Intizom motivatsiyadan muhimroq.' },
  { ru: 'Ошибки учат не меньше, чем успехи.', en: 'Mistakes teach no less than success.', uz: 'Xatolar muvaffaqiyatdan kam o‘ritmaydi.' },
  { ru: 'Тишина и порядок помогают учиться.', en: 'Quiet and order help you learn.', uz: 'Jimlik va tartib o‘rganishga yordam beradi.' },
  { ru: 'Ваш прогресс уникален — не сравнивайте себя с другими.', en: 'Your progress is unique — don\'t compare yourself to others.', uz: 'Sizning rivojlanishingiz noyob — o‘zingizni boshqalar bilan solishtirmang.' },
  { ru: 'Регулярность важнее интенсивности.', en: 'Consistency matters more than intensity.', uz: 'Muntazamlik intensivlikdan muhimroq.' },
  { ru: 'Улыбка снижает стресс и помогает запоминать.', en: 'A smile reduces stress and helps you remember.', uz: 'Tabassum stressni kamaytiradi va yodda saqlashga yordam beradi.' },
  { ru: 'Планируйте день — и день будет за вас.', en: 'Plan your day — and the day will work for you.', uz: 'Kunningizni rejalashtiring — kun siz uchun ishlaydi.' },
  { ru: 'Глубокий вдох — и снова в работу.', en: 'A deep breath — and back to work.', uz: 'Chuqur nafas — va yana ishga.' },
  { ru: 'Каждая прочитанная страница — шаг вперёд.', en: 'Every page you read is a step forward.', uz: 'O‘qigan har bir sahifa — oldinga qadam.' },
  { ru: 'Верьте в себя — вы справитесь.', en: 'Believe in yourself — you can do it.', uz: 'O‘zingizga ishoning — siz qila olasiz.' },
  { ru: 'Учёба — это инвестиция в себя.', en: 'Learning is an investment in yourself.', uz: 'O‘qish — o‘zingizga sarmoya.' },
  { ru: 'Начните с простого — сложное придёт само.', en: 'Start with the simple — the complex will follow.', uz: 'Oddiy narsadan boshlang — murakkab o‘zi keladi.' },
  { ru: 'Хороший сон — основа хорошей учёбы.', en: 'Good sleep is the foundation of good learning.', uz: 'Yaxshi uyqu — yaxshi o‘rganishning asosi.' },
  { ru: 'Благодарность за возможность учиться.', en: 'Grateful for the chance to learn.', uz: 'O‘rganish imkoniyati uchun minnatdorchilik.' },
  { ru: 'Сегодня вы на шаг ближе к цели.', en: 'Today you are one step closer to your goal.', uz: 'Bugun siz maqsadingizga bir qadam yaqinroqsiz.' },
];

export function getQuoteByIndex(index: number): CabinetQuote {
  const i = index % CABINET_QUOTES.length;
  return CABINET_QUOTES[i] ?? CABINET_QUOTES[0];
}
