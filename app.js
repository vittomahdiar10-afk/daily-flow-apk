'use strict';

const STORAGE_KEY = 'daily_flow_liquid_glass_v2';
let memoryFallbackStorage = null;
let suppressNextCardClick = false;
let audioCtx = null;
let activeAmbientCleanup = null;
let cmdSelectedIndex = 0;
let currentCmdItems = [];
let draggedTaskId = null;
let syncBackLayerCallback = null;
let composerShutterController = null;

/* تابع کشسانی لبه iOS Rubber-Banding برای حس لمسی واقعی هنگام کشیدن بیش از حد */
function computeIosRubberBand(offset, dimension = 64) {
  const absOffset = Math.abs(offset);
  const sign = offset < 0 ? -1 : 1;
  const damped = (absOffset * dimension * 0.52) / (absOffset + dimension);
  return sign * damped;
}

const DEFAULT_FOLDERS = [
  { name: 'شخصی', emoji: '✨', builtIn: true },
  { name: 'کار', emoji: '💼', builtIn: true },
  { name: 'یادگیری', emoji: '📚', builtIn: true },
  { name: 'سلامتی', emoji: '🌿', builtIn: true },
];

const NOTE_TAGS = {
  general: {
    key: 'general',
    label: 'عمومی',
    emoji: '📝',
    badgeClass: 'bg-white/10 text-slate-300 border-white/15',
  },
  idea: {
    key: 'idea',
    label: 'ایده',
    emoji: '💡',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
  },
  quote: {
    key: 'quote',
    label: 'نقل‌قول / گفته مهم',
    emoji: '💬',
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
  },
  later: {
    key: 'later',
    label: 'مراجعه بعدی',
    emoji: '🔖',
    badgeClass: 'bg-violet-500/15 text-violet-300 border-violet-400/30',
  },
};

const ACCENT_PALETTES = {
  mint: {
    label: 'نعنایی',
    hex: '#7fd5d8',
    strong: '#4ebec2',
    rgb: '127, 213, 216',
    lightHex: '#0d9488',
    lightStrong: '#0f766e',
    lightRgb: '13, 148, 136',
  },
  ocean: {
    label: 'اقیانوسی',
    hex: '#60a5fa',
    strong: '#3b82f6',
    rgb: '96, 165, 250',
    lightHex: '#2563eb',
    lightStrong: '#1d4ed8',
    lightRgb: '37, 99, 235',
  },
  violet: {
    label: 'کیهانی',
    hex: '#c084fc',
    strong: '#a855f7',
    rgb: '192, 132, 252',
    lightHex: '#7c3aed',
    lightStrong: '#6d28d9',
    lightRgb: '124, 58, 237',
  },
  amber: {
    label: 'طلایی',
    hex: '#fbbf24',
    strong: '#f59e0b',
    rgb: '251, 191, 36',
    lightHex: '#d97706',
    lightStrong: '#b45309',
    lightRgb: '217, 119, 6',
  },
};

const RADAR_AXES = {
  mind: {
    key: 'mind',
    label: 'ذهن',
    emoji: '🧠',
    tip: 'مطالعه، یادگیری، مدیتیشن، نوشتن و تمرین‌های تمرکز ذهن',
  },
  efficiency: {
    key: 'efficiency',
    label: 'کارایی',
    emoji: '🚀',
    tip: 'پروژه‌های کاری، برنامه‌ریزی، تحویل به‌موقع و خروجی‌های کلیدی',
  },
  discipline: {
    key: 'discipline',
    label: 'انضباط',
    emoji: '🛡️',
    tip: 'عادت‌های روزانه تکراری، نظم شخصی، پایبندی و تداوم استریک',
  },
  body: {
    key: 'body',
    label: 'جسم',
    emoji: '💪',
    tip: 'ورزش، تغذیه سالم، نوشیدن آب، خواب منظم و تحرک بدنی',
  },
};

const state = {
  tasks: [],
  selectedDayView: 'today', // 'yesterday' | 'today' | 'tomorrow'
  filter: 'all',
  folderFilter: 'all',
  searchQuery: '',
  selectedCategory: 'شخصی',
  activeTab: 'tasks',
  focusedTaskId: null,
  focusDurationMinutes: 25,
  focusSeconds: 25 * 60,
  focusRemainingMs: 25 * 60 * 1000,
  focusEndTimestamp: null,
  focusLastRenderedSecond: 25 * 60,
  focusRunning: false,
  focusIntervalId: null,
  ambientMode: 'off',
  islandMode: 'idle',
  activeIslandToast: null,
  toastTimeout: null,
  toastActionCallback: null,
  undoSnapshot: null,
  moveUndoSnapshot: null,
  noteUndoSnapshot: null,
  soundEnabled: true,
  gpuQualityMode: 'auto',
  detectedHz: 120,
  activeGpuTier: 'ultra',
  autoSortCompleted: false,
  privacyBlur: false,
  dailyReminderEnabled: false,
  dailyReminderTime: '21:00',
  dailyGoal: 5,
  accentTheme: 'mint',
  colorMode: 'dark',
  cardRadius: 24,
  customFolders: [],
  quickNotes: [],
  notebookFilter: 'all',
  notebookSearchQuery: '',
  editingNoteId: null,
  draftNoteTag: 'general',
  draftNotePinned: false,
  dailyHistory: {},
  lastHabitResetDay: '',
  selectedRadarAxis: 'all',
  radarCurrentScores: { mind: 20, efficiency: 20, discipline: 20, body: 20 },
  radarAnimFrame: null,
  editingTaskId: null,
  inspectedTaskId: null,
  draftEditCategory: 'شخصی',
  draftEditDay: 'today',
  draftEditUrgent: false,
  draftEditHabit: false,
  draftFolderEmoji: '🎓',
  composerSubtasks: [],
  composerDay: 'today',
  composerCategory: 'شخصی',
  composerAutoComplete: true,
  composerUrgent: false,
  composerHabit: false,
  profile: {
    name: 'دوست من',
    bio: 'تمرکز عمیق و پیشرفت روزانه',
    avatar: '🧑‍💻',
    photoDataUrl: '',
  },
  streak: {
    count: 1,
    lastActiveDay: '',
  },
  draftAvatar: '🧑‍💻',
  draftPhotoDataUrl: '',
};

/* ==================== ابزارهای فیزیک مایع (Liquid Squash & Stretch Helpers) ==================== */
function setTgSwitchState(switchEl, isOn, animate = false) {
  if (!switchEl) return;
  const wasOn = switchEl.classList.contains('is-on');
  const nextOn = Boolean(isOn);
  switchEl.classList.toggle('is-on', nextOn);
  const knob = switchEl.querySelector('.tg-switch-knob');
  if (!knob) return;

  if (animate && wasOn !== nextOn) {
    knob.classList.remove('is-morphing-on', 'is-morphing-off');
    void knob.offsetWidth;
    knob.classList.add(nextOn ? 'is-morphing-on' : 'is-morphing-off');
  } else if (!animate) {
    knob.classList.remove('is-morphing-on', 'is-morphing-off');
  }
}

function triggerFabLiquidPop(btnEl) {
  if (!btnEl) return;
  btnEl.classList.remove('is-liquid-popping');
  void btnEl.offsetWidth;
  btnEl.classList.add('is-liquid-popping');
}

function syncDynamicPillIndicator({ barId, indicatorId, blobId, btnSelector, activeValue, dataAttr, stepDistance = 0, animateStretch = false, fromScrub = false }) {
  const bar = document.getElementById(barId);
  const indicator = document.getElementById(indicatorId);
  const blob = document.getElementById(blobId);
  if (!bar || !indicator) return;

  const buttons = Array.from(bar.querySelectorAll(btnSelector));
  let activeBtn = null;

  buttons.forEach((btn) => {
    const isTarget = btn.dataset[dataAttr] === activeValue;
    if (isTarget) activeBtn = btn;
    btn.classList.toggle('is-active', isTarget);
    btn.classList.toggle('font-bold', isTarget);
    btn.classList.toggle('text-[#0b1617]', isTarget);
    btn.classList.toggle('text-[#93a3a5]', !isTarget);
  });

  if (!activeBtn) return;

  const applyPosition = () => {
    const w = activeBtn.offsetWidth;
    const x = activeBtn.offsetLeft;
    if (w > 0) {
      indicator.style.width = `${w}px`;
      indicator.style.transform = `translate3d(${x}px, 0, 0)`;
    }
  };

  if (activeBtn.offsetWidth > 0) {
    applyPosition();
  } else {
    requestAnimationFrame(applyPosition);
  }

  if (animateStretch && stepDistance > 0 && blob) {
    triggerBlobStretch(blob, stepDistance);
  }

  if (!fromScrub && activeBtn.offsetWidth > 0) {
    try {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    } catch (e) {}
  }
}

/* موتور رندر گرافیکی تطبیقی برای نرخ فریم‌های ۶۰، ۹۰، ۱۲۰ و ۱۴۴ هرتز و GPUهای مختلف موبایل */
function snapToStandardHz(rawHz) {
  if (rawHz >= 134) return 144;
  if (rawHz >= 106) return 120;
  if (rawHz >= 78) return 90;
  return 60;
}

function applyAdaptiveRenderCalibration(forcedTier = null) {
  const hz = state.detectedHz || 120;
  const root = document.documentElement;
  const body = document.body;

  if (hz <= 60) {
    root.style.setProperty('--motion-scale', '0.9');
  } else if (hz <= 90) {
    root.style.setProperty('--motion-scale', '0.96');
  } else if (hz <= 120) {
    root.style.setProperty('--motion-scale', '1');
  } else {
    root.style.setProperty('--motion-scale', '1.03');
  }

  let tier = forcedTier;
  if (!tier) {
    if (state.gpuQualityMode !== 'auto') {
      tier = state.gpuQualityMode;
    } else if (hz <= 60) {
      tier = 'balanced';
    } else {
      tier = 'ultra';
    }
  }

  state.activeGpuTier = tier;
  body.classList.remove('gpu-tier-ultra', 'gpu-tier-balanced', 'gpu-tier-performance');
  body.classList.add(`gpu-tier-${tier}`);

  updateGpuSettingsLabels();
}

function updateGpuSettingsLabels() {
  const valEl = document.getElementById('tg-val-gpu-mode');
  const subEl = document.getElementById('tg-gpu-subtext');
  const modeNames = {
    auto: 'خودکار',
    ultra: 'حداکثر گرافیک',
    balanced: 'متعادل',
    performance: 'فوق‌سریع',
  };
  if (valEl) {
    valEl.textContent = `${modeNames[state.gpuQualityMode] || 'خودکار'} • ${state.detectedHz}Hz`;
  }
  if (subEl) {
    const tierLabel =
      state.activeGpuTier === 'performance'
        ? 'حالت بدون لگ و مصرف پایین GPU فعال است'
        : state.activeGpuTier === 'balanced'
        ? 'شیدینگ شیشه‌ای بهینه برای ۹۰ و ۶۰ هرتز'
        : 'رندر شیشه‌ای کامل برای ۱۲۰ و ۱۴۴ هرتز';
    subEl.textContent = tierLabel;
  }
}

function initAdaptiveRenderEngine() {
  let frameDeltas = [];
  let lastTs = 0;
  let sampleCount = 0;
  const maxInitialSamples = 26;

  function measureLoop(now) {
    if (lastTs > 0) {
      const dt = now - lastTs;
      if (dt >= 4.5 && dt <= 40) {
        frameDeltas.push(dt);
      }
    }
    lastTs = now;
    sampleCount += 1;

    if (sampleCount < maxInitialSamples) {
      requestAnimationFrame(measureLoop);
    } else if (frameDeltas.length >= 8) {
      frameDeltas.sort((a, b) => a - b);
      const p25Delta = frameDeltas[Math.floor(frameDeltas.length * 0.25)];
      const estimatedHz = snapToStandardHz(1000 / p25Delta);
      state.detectedHz = estimatedHz;

      const medianDelta = frameDeltas[Math.floor(frameDeltas.length * 0.5)];
      const frameBudget = 1000 / estimatedHz;
      const hasGpuPressure = medianDelta > frameBudget * 1.35;

      if (state.gpuQualityMode === 'auto' && hasGpuPressure) {
        applyAdaptiveRenderCalibration(estimatedHz <= 60 ? 'performance' : 'balanced');
      } else {
        applyAdaptiveRenderCalibration();
      }
    }
  }

  requestAnimationFrame(measureLoop);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      frameDeltas = [];
      lastTs = 0;
      sampleCount = 0;
      requestAnimationFrame(measureLoop);
    }
  });
}

function toPersianDigits(val) {
  const map = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(val).replace(/\d/g, (d) => map[Number(d)]);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getDayKeyFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTodayKey() {
  return getDayKeyFromDate(new Date());
}

function getOffsetDayKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return getDayKeyFromDate(d);
}

function getDayKeyForView(dayView) {
  if (dayView === 'yesterday') return getOffsetDayKey(-1);
  if (dayView === 'tomorrow') return getOffsetDayKey(1);
  return getTodayKey();
}

function getDayViewFromKey(dayKey) {
  const today = getTodayKey();
  const yesterday = getOffsetDayKey(-1);
  const tomorrow = getOffsetDayKey(1);
  if (dayKey === yesterday) return 'yesterday';
  if (dayKey === tomorrow) return 'tomorrow';
  if (dayKey === today) return 'today';
  return 'today';
}

function getDayViewMeta(dayView) {
  if (dayView === 'yesterday') {
    return { key: 'yesterday', label: 'دیروز', badge: '⏪ دیروز', dayKey: getOffsetDayKey(-1) };
  }
  if (dayView === 'tomorrow') {
    return { key: 'tomorrow', label: 'فردا', badge: '🌅 فردا', dayKey: getOffsetDayKey(1) };
  }
  return { key: 'today', label: 'امروز', badge: '☀️ امروز', dayKey: getTodayKey() };
}

function getCalendarDaysDiff(fromKey, toKey) {
  if (!fromKey || !toKey) return 0;
  const fromParts = String(fromKey).split('-').map(Number);
  const toParts = String(toKey).split('-').map(Number);
  if (fromParts.length !== 3 || toParts.length !== 3) return 0;
  const fromDate = new Date(fromParts[0], fromParts[1] - 1, fromParts[2], 12, 0, 0);
  const toDate = new Date(toParts[0], toParts[1] - 1, toParts[2], 12, 0, 0);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return 0;
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

function gregorianToJalali(gy, gm, gd) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 +
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) +
    gd +
    gdm[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

function formatJalaliForDateObj(dateObj) {
  const weekdays = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];
  const months = [
    'فروردین',
    'اردیبهشت',
    'خرداد',
    'تیر',
    'مرداد',
    'شهریور',
    'مهر',
    'آبان',
    'آذر',
    'دی',
    'بهمن',
    'اسفند',
  ];
  const [, jm, jd] = gregorianToJalali(dateObj.getFullYear(), dateObj.getMonth() + 1, dateObj.getDate());
  const weekday = weekdays[dateObj.getDay()];
  return `${weekday}، ${toPersianDigits(jd)} ${months[jm - 1]}`;
}

function formatJalaliToday() {
  return formatJalaliForDateObj(new Date());
}

function formatJalaliForDayView(dayView) {
  const d = new Date();
  if (dayView === 'yesterday') d.setDate(d.getDate() - 1);
  if (dayView === 'tomorrow') d.setDate(d.getDate() + 1);
  return formatJalaliForDateObj(d);
}

function formatJalaliDateTime(timestamp) {
  const ts = Number(timestamp) || Date.now();
  const d = new Date(ts);
  const now = new Date();
  const months = [
    'فروردین',
    'اردیبهشت',
    'خرداد',
    'تیر',
    'مرداد',
    'شهریور',
    'مهر',
    'آبان',
    'آذر',
    'دی',
    'بهمن',
    'اسفند',
  ];
  const timeStr = `${toPersianDigits(String(d.getHours()).padStart(2, '0'))}:${toPersianDigits(
    String(d.getMinutes()).padStart(2, '0')
  )}`;

  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (isSameDay) {
    return `امروز • ${timeStr}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();

  if (isYesterday) {
    return `دیروز • ${timeStr}`;
  }

  const [, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${toPersianDigits(jd)} ${months[jm - 1]} • ${timeStr}`;
}

function normalizeNoteEntry(rawNote, fallbackIndex = 0) {
  if (!rawNote || typeof rawNote !== 'object') return null;
  const text = String(rawNote.text || '').trim();
  const title = String(rawNote.title || '').trim();
  if (!text && !title) return null;
  const createdAt = Number(rawNote.createdAt) || Date.now() - fallbackIndex * 1000;
  return {
    id: String(rawNote.id || `note_${createdAt}_${Math.random().toString(36).slice(2, 6)}`),
    title,
    text,
    tag: NOTE_TAGS[rawNote.tag] ? rawNote.tag : 'general',
    pinned: Boolean(rawNote.pinned),
    createdAt,
    updatedAt: Number(rawNote.updatedAt) || createdAt,
  };
}

function getRecent7DaysMeta() {
  const shortDays = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = getDayKeyFromDate(d);
    result.push({
      key,
      label: i === 0 ? 'امروز' : shortDays[d.getDay()],
      count: Number(state.dailyHistory[key] || 0),
      isToday: i === 0,
    });
  }
  return result;
}

/* بررسی اینکه یک تسک متعلق به کدام روز است و وضعیت انجامش در آن روز چیست */
function isTaskScheduledForDayKey(task, targetDayKey) {
  if (!task) return false;
  const todayKey = getTodayKey();
  const taskDay = task.scheduledDate || todayKey;

  if (task.isHabit) {
    const createdDay = task.createdAt ? getDayKeyFromDate(new Date(task.createdAt)) : todayKey;
    const effectiveStartDay = createdDay < taskDay ? createdDay : taskDay;
    return targetDayKey >= effectiveStartDay;
  }

  return taskDay === targetDayKey;
}

function getTaskStateForDayKey(task, targetDayKey) {
  const todayKey = getTodayKey();
  const rawSubs = Array.isArray(task.subtasks) ? task.subtasks : [];

  if (task.isHabit && targetDayKey !== todayKey) {
    const record = task.habitHistory && task.habitHistory[targetDayKey];
    const doneSubIds = Array.isArray(record?.doneSubIds) ? record.doneSubIds : [];
    return {
      completed: Boolean(record?.completed),
      subtasks: rawSubs.map((s) => ({
        ...s,
        completed: doneSubIds.includes(s.id),
      })),
    };
  }

  return {
    completed: Boolean(task.completed),
    subtasks: rawSubs,
  };
}

function getTasksForDayView(dayView) {
  const targetDayKey = getDayKeyForView(dayView);
  return state.tasks
    .filter((t) => isTaskScheduledForDayKey(t, targetDayKey))
    .map((t) => {
      const dayState = getTaskStateForDayKey(t, targetDayKey);
      return {
        ...t,
        completed: dayState.completed,
        subtasks: dayState.subtasks,
        _viewDayKey: targetDayKey,
      };
    });
}

function syncHabitDaySnapshot(task, dayKey) {
  if (!task || !task.isHabit) return;
  if (!task.habitHistory || typeof task.habitHistory !== 'object') {
    task.habitHistory = {};
  }
  const subs = Array.isArray(task.subtasks) ? task.subtasks : [];
  task.habitHistory[dayKey] = {
    completed: Boolean(task.completed),
    doneSubIds: subs.filter((s) => s.completed).map((s) => s.id),
  };
}

function getDefaultSampleTasks() {
  const now = Date.now();
  const todayKey = getTodayKey();
  return [
    {
      id: 'sample_1',
      title: 'برنامه ورزش و تمرین روزانه',
      description: 'گرم کردن بدن + تمرین‌های اصلی قدرتی و هوازی',
      category: 'سلامتی',
      urgent: false,
      isHabit: true,
      autoCompleteSubtasks: true,
      completed: false,
      scheduledDate: todayKey,
      habitHistory: {},
      subtasks: [
        { id: 'sub_s1', title: '۱۰ دقیقه نرم‌دوی و حرکات کششی', completed: true },
        { id: 'sub_s2', title: '۳ ست شنا سوئدی و پلانک', completed: false },
        { id: 'sub_s3', title: 'نوشیدن دو لیوان آب خنک', completed: false },
      ],
      createdAt: now - 3600000,
    },
    {
      id: 'sample_2',
      title: 'مرور اولویت‌های کاری و ارسال گزارش',
      description: 'تکمیل گزارش پیشرفت پروژه قبل از ظهر',
      category: 'کار',
      urgent: true,
      isHabit: false,
      autoCompleteSubtasks: true,
      completed: false,
      scheduledDate: todayKey,
      subtasks: [],
      createdAt: now - 2400000,
    },
    {
      id: 'sample_3',
      title: 'مطالعه ۲۰ صفحه کتاب تخصصی',
      description: 'یادداشت‌برداری از نکات کلیدی فصل جدید',
      category: 'یادگیری',
      urgent: false,
      isHabit: true,
      autoCompleteSubtasks: true,
      completed: false,
      scheduledDate: todayKey,
      habitHistory: {},
      subtasks: [],
      createdAt: now - 1200000,
    },
  ];
}

function saveState() {
  const today = getTodayKey();
  const yesterday = getOffsetDayKey(-1);

  const todayTasks = getTasksForDayView('today');
  state.dailyHistory[today] = todayTasks.filter((t) => t.completed).length;

  const yesterdayTasks = getTasksForDayView('yesterday');
  if (yesterdayTasks.length > 0 || state.dailyHistory[yesterday] !== undefined) {
    state.dailyHistory[yesterday] = yesterdayTasks.filter((t) => t.completed).length;
  }

  const payload = {
    tasks: state.tasks,
    selectedCategory: state.selectedCategory,
    focusedTaskId: state.focusedTaskId,
    focusDurationMinutes: state.focusDurationMinutes,
    focusRemainingMs: state.focusRemainingMs,
    focusEndTimestamp: state.focusEndTimestamp,
    soundEnabled: state.soundEnabled,
    gpuQualityMode: state.gpuQualityMode,
    autoSortCompleted: state.autoSortCompleted,
    privacyBlur: state.privacyBlur,
    dailyReminderEnabled: state.dailyReminderEnabled,
    dailyReminderTime: state.dailyReminderTime,
    dailyGoal: state.dailyGoal,
    accentTheme: state.accentTheme,
    colorMode: state.colorMode,
    cardRadius: state.cardRadius,
    customFolders: state.customFolders,
    quickNotes: state.quickNotes,
    dailyHistory: state.dailyHistory,
    lastHabitResetDay: state.lastHabitResetDay,
    profile: state.profile,
    streak: state.streak,
  };

  const serialized = JSON.stringify(payload);
  memoryFallbackStorage = serialized;
  try {
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (e) {}

  if (typeof syncDailyStreakReminderNotification === 'function') {
    syncDailyStreakReminderNotification(true, false);
  }
}

function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    raw = memoryFallbackStorage;
  }

  const today = getTodayKey();

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.tasks)) state.tasks = parsed.tasks;
      if (typeof parsed.selectedCategory === 'string') state.selectedCategory = parsed.selectedCategory;
      if (typeof parsed.focusedTaskId === 'string') state.focusedTaskId = parsed.focusedTaskId;
      if (typeof parsed.focusDurationMinutes === 'number') {
        state.focusDurationMinutes = parsed.focusDurationMinutes;
        state.focusSeconds = parsed.focusDurationMinutes * 60;
        state.focusRemainingMs = parsed.focusDurationMinutes * 60 * 1000;
        state.focusLastRenderedSecond = state.focusSeconds;
      }
      if (typeof parsed.focusEndTimestamp === 'number' && parsed.focusEndTimestamp > Date.now()) {
        state.focusEndTimestamp = parsed.focusEndTimestamp;
        state.focusRemainingMs = Math.max(0, parsed.focusEndTimestamp - Date.now());
        state.focusSeconds = Math.ceil(state.focusRemainingMs / 1000);
        state.focusLastRenderedSecond = state.focusSeconds;
        state.focusRunning = true;
      } else {
        state.focusEndTimestamp = null;
        if (typeof parsed.focusRemainingMs === 'number' && parsed.focusRemainingMs > 0) {
          state.focusRemainingMs = parsed.focusRemainingMs;
          state.focusSeconds = Math.ceil(parsed.focusRemainingMs / 1000);
          state.focusLastRenderedSecond = state.focusSeconds;
        }
      }
      if (typeof parsed.soundEnabled === 'boolean') state.soundEnabled = parsed.soundEnabled;
      if (['auto', 'ultra', 'balanced', 'performance'].includes(parsed.gpuQualityMode)) {
        state.gpuQualityMode = parsed.gpuQualityMode;
      }
      if (typeof parsed.autoSortCompleted === 'boolean') state.autoSortCompleted = parsed.autoSortCompleted;
      if (typeof parsed.privacyBlur === 'boolean') state.privacyBlur = parsed.privacyBlur;
      if (typeof parsed.dailyReminderEnabled === 'boolean') {
        state.dailyReminderEnabled = parsed.dailyReminderEnabled;
      }
      if (typeof parsed.dailyReminderTime === 'string' && /^\d{2}:\d{2}$/.test(parsed.dailyReminderTime)) {
        state.dailyReminderTime = parsed.dailyReminderTime;
      }
      if (typeof parsed.dailyGoal === 'number') state.dailyGoal = parsed.dailyGoal;
      if (ACCENT_PALETTES[parsed.accentTheme]) state.accentTheme = parsed.accentTheme;
      if (parsed.colorMode === 'light' || parsed.colorMode === 'dark') state.colorMode = parsed.colorMode;
      if (typeof parsed.cardRadius === 'number') state.cardRadius = parsed.cardRadius;
      if (Array.isArray(parsed.customFolders)) state.customFolders = parsed.customFolders;
      if (Array.isArray(parsed.quickNotes)) {
        state.quickNotes = parsed.quickNotes
          .map((n, idx) => normalizeNoteEntry(n, idx))
          .filter(Boolean);
      }
      if (parsed.dailyHistory && typeof parsed.dailyHistory === 'object') state.dailyHistory = parsed.dailyHistory;
      if (typeof parsed.lastHabitResetDay === 'string') state.lastHabitResetDay = parsed.lastHabitResetDay;
      if (parsed.profile && typeof parsed.profile === 'object') {
        state.profile = { ...state.profile, ...parsed.profile };
      }
      if (parsed.streak && typeof parsed.streak === 'object') {
        state.streak = { ...state.streak, ...parsed.streak };
      }
    } catch (e) {
      state.tasks = getDefaultSampleTasks();
    }
  } else {
    state.tasks = getDefaultSampleTasks();
  }

  const fallbackDayForLegacy = state.lastHabitResetDay || today;
  state.tasks.forEach((task) => {
    if (!task.scheduledDate) {
      task.scheduledDate = fallbackDayForLegacy;
    }
    if (task.isHabit && (!task.habitHistory || typeof task.habitHistory !== 'object')) {
      task.habitHistory = {};
    }
  });

  if (state.lastHabitResetDay && state.lastHabitResetDay !== today) {
    const prevDay = state.lastHabitResetDay;
    state.tasks.forEach((task) => {
      if (task.isHabit) {
        if (!task.habitHistory[prevDay]) {
          syncHabitDaySnapshot(task, prevDay);
        }
        const todayRecord = task.habitHistory[today];
        if (todayRecord) {
          task.completed = Boolean(todayRecord.completed);
          const doneIds = Array.isArray(todayRecord.doneSubIds) ? todayRecord.doneSubIds : [];
          if (Array.isArray(task.subtasks)) {
            task.subtasks.forEach((s) => {
              s.completed = doneIds.includes(s.id);
            });
          }
        } else {
          task.completed = false;
          if (Array.isArray(task.subtasks)) {
            task.subtasks.forEach((s) => {
              s.completed = false;
            });
          }
        }
        task.scheduledDate = today;
      }
    });
  }
  state.lastHabitResetDay = today;

  if (state.streak.lastActiveDay !== today) {
    const diffDays = getCalendarDaysDiff(state.streak.lastActiveDay, today);
    if (diffDays === 1) {
      state.streak.count = Math.max(1, (state.streak.count || 1) + 1);
    } else {
      state.streak.count = 1;
    }
    state.streak.lastActiveDay = today;
  }

  const smartInitial = getSmartFocusCandidate();
  state.focusedTaskId = smartInitial ? smartInitial.id : null;

  saveState();
}

function getAllFolders() {
  return [...DEFAULT_FOLDERS, ...state.customFolders];
}

function getFolderDisplay(folderName) {
  const found = getAllFolders().find((f) => f.name === folderName);
  return found ? `${found.emoji} ${found.name}` : `📁 ${folderName || 'شخصی'}`;
}

function getCategoryBadgeStyle(cat) {
  switch (cat) {
    case 'کار':
      return 'bg-sky-500/15 text-sky-300 border-sky-400/30';
    case 'یادگیری':
      return 'bg-violet-500/15 text-violet-300 border-violet-400/30';
    case 'سلامتی':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30';
    default:
      return 'bg-[#7fd5d8]/15 text-[#7fd5d8] border-[#7fd5d8]/30';
  }
}

function applyThemePreferences() {
  const isLight = state.colorMode === 'light';
  const activeBg = isLight ? '#eef3f5' : '#0b1012';
  document.body.classList.toggle('theme-light', isLight);
  document.documentElement.style.backgroundColor = activeBg;
  document.body.style.backgroundColor = activeBg;

  const themeMeta = document.getElementById('meta-theme-color');
  if (themeMeta) {
    themeMeta.setAttribute('content', activeBg);
  }

  try {
    if (window.AndroidNative && typeof window.AndroidNative.setSystemBarTheme === 'function') {
      window.AndroidNative.setSystemBarTheme(isLight);
    }
  } catch (e) {}

  const palette = ACCENT_PALETTES[state.accentTheme] || ACCENT_PALETTES.mint;
  const root = document.documentElement;
  root.style.setProperty('--mint-accent', isLight ? palette.lightHex : palette.hex);
  root.style.setProperty('--mint-accent-strong', isLight ? palette.lightStrong : palette.strong);
  root.style.setProperty('--mint-accent-rgb', isLight ? palette.lightRgb : palette.rgb);
  root.style.setProperty('--mint-contrast-text', isLight ? '#ffffff' : '#0b1617');
  root.style.setProperty('--card-radius', `${state.cardRadius || 24}px`);

  const summaryEl = document.getElementById('tg-val-appearance-summary');
  if (summaryEl) {
    summaryEl.textContent = `${isLight ? 'روز' : 'شب'} • ${palette.label} ‹`;
  }

  const dayNightLabel = document.getElementById('tg-day-night-label');
  if (dayNightLabel) {
    dayNightLabel.textContent = isLight
      ? 'تغییر به حالت شب (Dark Mode)'
      : 'تغییر به حالت روز (Light Mode)';
  }

  const railThemeBtn = document.getElementById('rail-theme-btn');
  if (railThemeBtn) {
    railThemeBtn.textContent = isLight ? '☀️' : '🌙';
  }

  const radiusVal = document.getElementById('card-radius-val');
  const radiusSlider = document.getElementById('card-radius-slider');
  if (radiusVal) radiusVal.textContent = `${state.cardRadius || 24}px`;
  if (radiusSlider) radiusSlider.value = String(state.cardRadius || 24);

  document.querySelectorAll('.accent-card-btn').forEach((btn) => {
    const active = btn.dataset.accent === state.accentTheme;
    btn.style.borderColor = active ? 'var(--mint-accent)' : '';
    btn.style.backgroundColor = active ? 'rgba(var(--mint-accent-rgb), 0.14)' : '';
  });
}

function ensureAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTactileSound(type, directionStep = 0) {
  if (!state.soundEnabled) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'complete') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(840, now + 0.11);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.14);
    } else if (type === 'delete') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.1);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      osc.start(now);
      osc.stop(now + 0.11);
    } else if (type === 'nav-step') {
      /* صدای شیشه‌ای جهت‌دار: حرکت به آینده/تب‌های جلو زیرتر و شاداب‌تر، برگشت بم‌تر */
      const clampedStep = Math.max(-3, Math.min(3, Number(directionStep) || 0));
      const baseFreq = 640 + clampedStep * 68;
      const endFreq = baseFreq + (clampedStep >= 0 ? 115 : -85);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(320, endFreq), now + 0.065);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      osc.start(now);
      osc.stop(now + 0.075);
    } else if (type === 'scrub-tick') {
      /* تیک کریستالی ظریف هنگام سر خوردن انگشت روی نوار تب‌ها یا کشیدن داینامیک آیلند */
      const clampedStep = Math.max(-2, Math.min(2, Number(directionStep) || 0));
      const tickFreq = 740 + clampedStep * 55;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(tickFreq, now);
      osc.frequency.exponentialRampToValueAtTime(tickFreq + 50, now + 0.024);
      gain.gain.setValueAtTime(0.024, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);
      osc.start(now);
      osc.stop(now + 0.028);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(720, now + 0.05);
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now);
      osc.stop(now + 0.06);
    }
  } catch (e) {}
}

function triggerHaptic(ms = 10) {
  if (!state.soundEnabled) return;
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {}
}

/* ==================== لایه یکپارچه مدیریت نوتیفیکیشن بومی اندروید و وب ==================== */
const NOTIFICATION_CHANNELS = {
  tasks: 'daily_flow_reminders',
  focus: 'daily_flow_focus',
  daily: 'daily_flow_daily_streak',
};
const DAILY_REMINDER_ID_KEY = 'daily_streak_reminder';
const FOCUS_TIMER_NOTIF_ID = 'focus_timer_session_end';
const webScheduledNotifTimers = new Map();
let lastScheduledDailyReminderSig = '';
let pendingTestNotificationAfterGrant = false;

function isNativeAndroidApp() {
  return Boolean(window.AndroidNative);
}

function hasFullNativeNotificationBridge() {
  return Boolean(
    window.AndroidNative &&
      typeof window.AndroidNative.showInstantNotification === 'function' &&
      typeof window.AndroidNative.scheduleNotification === 'function' &&
      typeof window.AndroidNative.cancelNotification === 'function'
  );
}

function getNotificationPermissionStatus() {
  if (isNativeAndroidApp()) {
    if (!hasFullNativeNotificationBridge()) {
      return 'needs_apk_update';
    }
    try {
      if (typeof window.AndroidNative.hasNotificationPermission === 'function') {
        return window.AndroidNative.hasNotificationPermission() ? 'granted' : 'denied';
      }
    } catch (e) {}
    return 'granted';
  }
  if (typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission; // 'granted' | 'denied' | 'default'
}

function canScheduleExactAlarmsNative() {
  if (!isNativeAndroidApp()) return true;
  try {
    if (typeof window.AndroidNative.canScheduleExactAlarms === 'function') {
      return Boolean(window.AndroidNative.canScheduleExactAlarms());
    }
  } catch (e) {}
  return true;
}

async function requestAppNotificationPermission() {
  if (isNativeAndroidApp()) {
    if (!hasFullNativeNotificationBridge()) {
      triggerIslandToast('📲', 'برای نوتیفیکیشن بومی، نسخه جدید APK را نصب کن', { duration: 3600 });
      return false;
    }
    const current = getNotificationPermissionStatus();
    if (current === 'granted') return true;
    try {
      if (typeof window.AndroidNative.requestNotificationPermission === 'function') {
        window.AndroidNative.requestNotificationPermission();
      }
    } catch (e) {}
    return false;
  }

  if (typeof Notification === 'undefined') {
    triggerIslandToast('⚠️', 'مرورگر فعلی از نوتیفیکیشن پشتیبانی نمی‌کند');
    return false;
  }

  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') {
    triggerIslandToast('⚠️', 'مجوز اعلان در تنظیمات مرورگر مسدود شده است');
    return false;
  }

  try {
    const res = await Notification.requestPermission();
    updateNotificationSettingsUI();
    return res === 'granted';
  } catch (e) {
    return false;
  }
}

function sendInstantAppNotification({ idKey, title, body, channelId = NOTIFICATION_CHANNELS.tasks }) {
  if (isNativeAndroidApp()) {
    if (!hasFullNativeNotificationBridge()) {
      return false;
    }
    try {
      return Boolean(
        window.AndroidNative.showInstantNotification(
          String(idKey || `instant_${Date.now()}`),
          String(title || 'Daily Flow'),
          String(body || ''),
          String(channelId || NOTIFICATION_CHANNELS.tasks)
        )
      );
    } catch (e) {
      return false;
    }
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(String(title || 'Daily Flow'), {
        body: String(body || ''),
        icon: './icon.svg',
        tag: String(idKey || 'daily_flow_notif'),
      });
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

function cancelAppNotification(idKey) {
  const key = String(idKey || '');
  if (!key) return;

  if (webScheduledNotifTimers.has(key)) {
    clearTimeout(webScheduledNotifTimers.get(key));
    webScheduledNotifTimers.delete(key);
  }

  if (hasFullNativeNotificationBridge()) {
    try {
      window.AndroidNative.cancelNotification(key);
    } catch (e) {}
  }
}

function scheduleAppNotification({
  idKey,
  triggerAtMillis,
  title,
  body,
  channelId = NOTIFICATION_CHANNELS.tasks,
  repeatDaily = false,
}) {
  const key = String(idKey || '');
  const targetMs = Number(triggerAtMillis);
  if (!key || !Number.isFinite(targetMs)) return false;

  if (hasFullNativeNotificationBridge()) {
    try {
      return Boolean(
        window.AndroidNative.scheduleNotification(
          key,
          targetMs,
          String(title || 'Daily Flow'),
          String(body || ''),
          String(channelId || NOTIFICATION_CHANNELS.tasks),
          Boolean(repeatDaily)
        )
      );
    } catch (e) {
      return false;
    }
  }

  /* پشتیبان وب (وقتی برنامه داخل مرورگر باز است) */
  cancelAppNotification(key);
  const delayMs = targetMs - Date.now();
  if (delayMs > 1000 && delayMs <= 2147483000) {
    const timerId = setTimeout(() => {
      webScheduledNotifTimers.delete(key);
      sendInstantAppNotification({ idKey: key, title, body, channelId });
    }, delayMs);
    webScheduledNotifTimers.set(key, timerId);
    return true;
  }
  return false;
}

function scheduleFocusEndNotification() {
  if (!state.focusRunning || typeof state.focusEndTimestamp !== 'number') {
    cancelFocusEndNotification();
    return false;
  }
  if (state.focusEndTimestamp <= Date.now() + 1000) {
    return false;
  }

  const todayTasks = getTasksForDayView('today');
  const focusedTask = todayTasks.find((t) => t.id === state.focusedTaskId) || getSmartFocusCandidate();
  const durationFa = toPersianDigits(state.focusDurationMinutes || 25);
  const userName = (state.profile && state.profile.name) || 'دوست من';

  const title = '🎉 جلسه تمرکز کامل شد!';
  const body = focusedTask
    ? `${userName}، زمان تمرکز ${durationFa} دقیقه‌ای روی «${focusedTask.title}» به پایان رسید. خسته نباشی! ✨`
    : `${userName}، جلسه تمرکز ${durationFa} دقیقه‌ای شما با موفقیت به پایان رسید. عالی بود! ✨`;

  return scheduleAppNotification({
    idKey: FOCUS_TIMER_NOTIF_ID,
    triggerAtMillis: state.focusEndTimestamp,
    title,
    body,
    channelId: NOTIFICATION_CHANNELS.focus,
    repeatDaily: false,
  });
}

function cancelFocusEndNotification() {
  cancelAppNotification(FOCUS_TIMER_NOTIF_ID);
}

function parseReminderTimeParts(timeStr) {
  const match = String(timeStr || '21:00').match(/^(\d{1,2}):(\d{2})$/);
  const hour = match ? Math.min(23, Math.max(0, Number(match[1]))) : 21;
  const minute = match ? Math.min(59, Math.max(0, Number(match[2]))) : 0;
  return { hour, minute };
}

function computeDailyReminderTrigger(timeStr, skipToday = false) {
  const { hour, minute } = parseReminderTimeParts(timeStr);
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  if (skipToday || target.getTime() <= Date.now() + 5000) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

function syncDailyStreakReminderNotification(silent = true, force = false) {
  if (!state.dailyReminderEnabled) {
    if (force || lastScheduledDailyReminderSig !== 'off') {
      cancelAppNotification(DAILY_REMINDER_ID_KEY);
      lastScheduledDailyReminderSig = 'off';
    }
    return false;
  }

  const todayTasks = getTasksForDayView('today');
  const totalToday = todayTasks.length;
  const remainingToday = todayTasks.filter((t) => !t.completed).length;
  const allDoneToday = totalToday > 0 && remainingToday === 0;
  const userName = (state.profile && state.profile.name) || 'دوست من';
  const streakCount = state.streak?.count || 1;
  const timeVal = state.dailyReminderTime || '21:00';

  const sig = `on|${timeVal}|${remainingToday}|${totalToday}|${streakCount}|${userName}`;
  if (!force && sig === lastScheduledDailyReminderSig) {
    return true;
  }

  const triggerAt = computeDailyReminderTrigger(timeVal, allDoneToday);
  const isTriggerToday = getDayKeyFromDate(new Date(triggerAt)) === getTodayKey();
  const streakFa = toPersianDigits(streakCount);

  let title = '✨ وقت مرور برنامه Daily Flow';
  let body = `${userName}، برنامه امروزت رو چک کن و کارهات رو تیک بزن تا استریک ${streakFa} روزه‌ات حفظ بشه 🔥`;

  if (isTriggerToday && remainingToday > 0) {
    title = '🔥 یادآور برنامه امروز Daily Flow';
    body = `${userName}، ${toPersianDigits(remainingToday)} کار از برنامه امروزت باقی مونده! انجامشون بده تا استریک ${streakFa} روزه‌ات قطع نشه.`;
  }

  const scheduled = scheduleAppNotification({
    idKey: DAILY_REMINDER_ID_KEY,
    triggerAtMillis: triggerAt,
    title,
    body,
    channelId: NOTIFICATION_CHANNELS.daily,
    repeatDaily: true,
  });

  lastScheduledDailyReminderSig = sig;

  if (!silent) {
    if (scheduled) {
      triggerIslandToast('🔔', `یادآور روزانه برای ساعت ${toPersianDigits(timeVal)} تنظیم شد`);
    } else if (isNativeAndroidApp() && !hasFullNativeNotificationBridge()) {
      triggerIslandToast('📲', 'تنظیم ذخیره شد؛ برای ارسال اعلان نسخه جدید APK را نصب کن', { duration: 3600 });
    } else {
      triggerIslandToast('🔔', `ساعت یادآور روزانه روی ${toPersianDigits(timeVal)} ذخیره شد`);
    }
  }
  return scheduled;
}

function updateNotificationSettingsUI() {
  const status = getNotificationPermissionStatus();
  const valPermEl = document.getElementById('tg-val-notif-permission');
  const subPermEl = document.getElementById('tg-sub-notif-permission');
  const subDailyEl = document.getElementById('tg-sub-daily-reminder');
  const timeInput = document.getElementById('daily-reminder-time-input');
  const timeRow = document.getElementById('tg-row-daily-reminder-time');
  const exactAlarmRow = document.getElementById('tg-row-exact-alarm');
  const exactAlarmVal = document.getElementById('tg-val-exact-alarm');

  if (valPermEl && subPermEl) {
    if (status === 'granted') {
      valPermEl.textContent = 'فعال ✓';
      valPermEl.className = 'text-xs font-bold text-emerald-300 shrink-0';
      subPermEl.textContent = isNativeAndroidApp()
        ? 'اعلان‌های بومی فعال است • لمس برای تنظیمات سیستم'
        : 'اعلان‌های مرورگر فعال است';
    } else if (status === 'needs_apk_update') {
      valPermEl.textContent = 'نیاز به APK جدید';
      valPermEl.className = 'text-xs font-bold text-amber-300 shrink-0';
      subPermEl.textContent = 'برای فعال‌سازی موتور اعلان، APK جدید مرحله ۱ را نصب کن';
    } else if (status === 'unsupported') {
      valPermEl.textContent = 'پشتیبانی نمی‌شود';
      valPermEl.className = 'text-xs font-bold text-[#93a3a5] shrink-0';
      subPermEl.textContent = 'این مرورگر از نمایش نوتیفیکیشن پشتیبانی نمی‌کند';
    } else if (status === 'denied') {
      valPermEl.textContent = 'غیرفعال ‹';
      valPermEl.className = 'text-xs font-bold text-rose-300 shrink-0';
      subPermEl.textContent = 'برای دریافت یادآورها، لمس کن و مجوز اعلان را فعال کن';
    } else {
      valPermEl.textContent = 'فعال‌سازی ‹';
      valPermEl.className = 'text-xs font-bold text-[#7fd5d8] shrink-0';
      subPermEl.textContent = 'برای دریافت یادآور کارها و تایمر، مجوز اعلان را فعال کن';
    }
  }

  setTgSwitchState(
    document.getElementById('tg-switch-daily-reminder'),
    state.dailyReminderEnabled,
    false
  );

  if (timeInput && document.activeElement !== timeInput) {
    timeInput.value = state.dailyReminderTime || '21:00';
  }

  if (timeRow) {
    timeRow.classList.toggle('opacity-55', !state.dailyReminderEnabled);
  }

  if (subDailyEl) {
    subDailyEl.textContent = state.dailyReminderEnabled
      ? `هر شب ساعت ${toPersianDigits(state.dailyReminderTime || '21:00')} (در صورت ناتمام بودن کارهای امروز)`
      : 'یادآوری هوشمند شبانه برای تکمیل کارهای باقی‌مانده';
  }

  if (exactAlarmRow) {
    const showExactRow = isNativeAndroidApp() && hasFullNativeNotificationBridge();
    exactAlarmRow.classList.toggle('hidden', !showExactRow);
    if (showExactRow && exactAlarmVal) {
      const canExact = canScheduleExactAlarmsNative();
      exactAlarmVal.textContent = canExact ? 'دقیق ✓' : 'فعال‌سازی ‹';
      exactAlarmVal.className = canExact
        ? 'text-xs font-bold text-emerald-300 shrink-0'
        : 'text-xs font-bold text-amber-300 shrink-0';
    }
  }
}

function sendTestAppNotification() {
  const ok = sendInstantAppNotification({
    idKey: 'daily_flow_test_notif',
    title: '🔔 اعلان‌های Daily Flow فعال است!',
    body: `${state.profile.name || 'دوست من'}، یادآورها و نوتیفیکیشن‌های برنامه روی دستگاهت آماده به کار هستند ✨`,
    channelId: NOTIFICATION_CHANNELS.tasks,
  });

  if (ok) {
    playTactileSound('complete');
    triggerHaptic(12);
    triggerIslandToast('🔔', 'نوتیفیکیشن آزمایشی ارسال شد!');
  } else if (isNativeAndroidApp() && !hasFullNativeNotificationBridge()) {
    triggerIslandToast('📲', 'برای ارسال اعلان بومی، APK جدید را نصب کن', { duration: 3600 });
  } else {
    triggerIslandToast('⚠️', 'ارسال اعلان انجام نشد؛ مجوز اعلان‌ها را بررسی کن');
  }
}

window.__onNativeNotificationPermission = (granted) => {
  updateNotificationSettingsUI();
  if (granted) {
    playTactileSound('complete');
    if (state.dailyReminderEnabled) {
      syncDailyStreakReminderNotification(true, true);
    }
    if (state.focusRunning && typeof state.focusEndTimestamp === 'number') {
      scheduleFocusEndNotification();
    }
    if (pendingTestNotificationAfterGrant) {
      pendingTestNotificationAfterGrant = false;
      sendTestAppNotification();
    } else {
      triggerIslandToast('🔔', 'مجوز اعلان‌ها با موفقیت فعال شد');
    }
  } else {
    pendingTestNotificationAfterGrant = false;
    triggerIslandToast('⚠️', 'مجوز اعلان داده نشد؛ از تنظیمات گوشی فعال کن');
  }
};

window.__onNativeNotificationOpen = (channelType) => {
  if (channelType === 'focus') {
    switchTab('focus');
  } else {
    switchTab('tasks');
  }
};

function setAmbientMode(mode) {
  state.ambientMode = mode || 'off';
  if (activeAmbientCleanup) {
    try {
      activeAmbientCleanup();
    } catch (e) {}
    activeAmbientCleanup = null;
  }

  document.querySelectorAll('.ambient-chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.ambient === state.ambientMode);
  });

  const cycleBtn = document.getElementById('island-ambient-cycle-btn');
  if (cycleBtn) {
    const ambientLabels = {
      off: '🔇',
      rain: '🌧️ باران',
      brown: '🌊 عمیق',
      nature: '🍃 طبیعت',
    };
    cycleBtn.textContent = ambientLabels[state.ambientMode] || '🔇';
    cycleBtn.classList.toggle('text-[#7fd5d8]', state.ambientMode !== 'off');
    cycleBtn.classList.toggle('border-[#7fd5d8]/40', state.ambientMode !== 'off');
  }

  const waveEl = document.getElementById('island-wave');
  if (waveEl) {
    const showWave = state.focusRunning || state.ambientMode !== 'off';
    waveEl.classList.toggle('hidden', !showWave);
    waveEl.classList.toggle('flex', showWave);
  }

  if (state.ambientMode === 'off') return;
  const ctx = ensureAudioContext();
  if (!ctx) return;

  try {
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (state.ambientMode === 'brown') {
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 2.6;
      } else if (state.ambientMode === 'rain') {
        output[i] = white * 0.35;
      } else {
        output[i] = (lastOut + 0.05 * white) / 1.05;
        lastOut = output[i];
        output[i] *= 1.4;
      }
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = state.ambientMode === 'nature' ? 'bandpass' : 'lowpass';
    filter.frequency.value = state.ambientMode === 'rain' ? 950 : state.ambientMode === 'nature' ? 520 : 280;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.045;

    whiteNoise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);
    whiteNoise.start(0);

    activeAmbientCleanup = () => {
      whiteNoise.stop();
      whiteNoise.disconnect();
      filter.disconnect();
      gainNode.disconnect();
    };
  } catch (e) {}
}

function spawnCelebrationSparkles() {
  const colors = ['#7fd5d8', '#34d399', '#fbbf24', '#60a5fa', '#c084fc'];
  const cx = window.innerWidth / 2;
  const cy = 140;
  for (let i = 0; i < 16; i++) {
    const dot = document.createElement('span');
    dot.className = 'sparkle-particle';
    const angle = (Math.PI * 2 * i) / 16;
    const dist = 55 + Math.random() * 85;
    dot.style.left = `${cx}px`;
    dot.style.top = `${cy}px`;
    dot.style.backgroundColor = colors[i % colors.length];
    dot.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    dot.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), 840);
  }
}

function getSmartFocusCandidate() {
  const todayTasks = getTasksForDayView('today');
  if (todayTasks.length === 0) return null;
  const current = todayTasks.find((t) => t.id === state.focusedTaskId);
  if (current && !current.completed) return current;
  const activeTasks = todayTasks.filter((t) => !t.completed);
  return activeTasks.find((t) => t.urgent) || activeTasks[0] || current || todayTasks[0];
}

function advanceSmartFocusTask(cycleNext = false, directionStep = 1) {
  const todayTasks = getTasksForDayView('today');
  const activeTasks = todayTasks.filter((t) => !t.completed);
  const pool = activeTasks.length > 0 ? activeTasks : todayTasks;
  if (pool.length === 0) {
    state.focusedTaskId = null;
    if (state.focusRunning) scheduleFocusEndNotification();
    return null;
  }
  if (cycleNext) {
    const curIdx = pool.findIndex((t) => t.id === state.focusedTaskId);
    const step = directionStep < 0 ? -1 : 1;
    const baseIdx = curIdx === -1 ? 0 : curIdx;
    const nextIdx = (baseIdx + step + pool.length) % pool.length;
    const nextTask = pool[nextIdx];
    state.focusedTaskId = nextTask.id;

    const idleLabel = document.getElementById('island-idle-label');
    if (idleLabel) {
      idleLabel.classList.remove('is-sliding-next', 'is-sliding-prev');
      void idleLabel.offsetWidth;
      idleLabel.classList.add(step >= 0 ? 'is-sliding-next' : 'is-sliding-prev');
    }
    if (state.focusRunning) scheduleFocusEndNotification();
    return nextTask;
  }
  const nextSmart = activeTasks.find((t) => t.urgent) || activeTasks[0] || pool[0];
  state.focusedTaskId = nextSmart.id;
  if (state.focusRunning) scheduleFocusEndNotification();
  return nextSmart;
}

function clearIslandAnimationClasses(shell) {
  if (!shell) return;
  shell.classList.remove('is-popping');
}

function renderToastPayloadIntoDom(toastData) {
  if (!toastData) return;
  const iconEl = document.getElementById('island-toast-icon');
  const textEl = document.getElementById('island-toast-text');
  const actionBtn = document.getElementById('island-undo-btn');

  const expIconEl = document.getElementById('island-expanded-toast-icon');
  const expTextEl = document.getElementById('island-expanded-toast-text');
  const expActionBtn = document.getElementById('island-expanded-undo-btn');

  if (iconEl) iconEl.textContent = toastData.icon || '✨';
  if (textEl) textEl.textContent = toastData.text || '';
  if (actionBtn) {
    actionBtn.textContent = toastData.actionLabel || 'بازگردانی';
    actionBtn.classList.toggle('hidden', !toastData.hasAction);
  }

  if (expIconEl) expIconEl.textContent = toastData.icon || '✨';
  if (expTextEl) expTextEl.textContent = toastData.text || '';
  if (expActionBtn) {
    expActionBtn.textContent = toastData.actionLabel || 'بازگردانی';
    expActionBtn.classList.toggle('hidden', !toastData.hasAction);
  }
}

function setExpandedToastBannerVisible(visible) {
  const banner = document.getElementById('island-expanded-toast-banner');
  if (!banner) return;
  const isVisible = Boolean(visible);
  banner.classList.toggle('is-visible', isVisible);
  banner.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
  try {
    banner.inert = !isVisible;
  } catch (e) {}
}

function clearActiveIslandToastState() {
  if (state.toastTimeout) {
    clearTimeout(state.toastTimeout);
    state.toastTimeout = null;
  }
  state.activeIslandToast = null;
  state.toastActionCallback = null;
  setExpandedToastBannerVisible(false);
}

function expireIslandToast() {
  state.toastTimeout = null;
  state.activeIslandToast = null;
  state.toastActionCallback = null;
  setExpandedToastBannerVisible(false);

  /* تنها در صورتی به حالت پایه برمی‌گردد که آیلند در وضعیت toast باشد؛ منوی باز هرگز بسته نمی‌شود */
  if (state.islandMode === 'toast') {
    applyIslandVisualState('idle');
  }
}

function executeIslandToastAction() {
  const cb = state.activeIslandToast?.onAction || state.toastActionCallback;
  const wasToastMode = state.islandMode === 'toast';
  clearActiveIslandToastState();
  if (typeof cb === 'function') {
    cb();
  }
  if (wasToastMode) {
    applyIslandVisualState('idle');
  }
}

function applyIslandVisualState(mode) {
  state.islandMode = mode;
  const shell = document.getElementById('dynamic-island');
  const idleLayer = document.getElementById('island-idle-layer');
  const toastLayer = document.getElementById('island-toast-layer');
  const expandedLayer = document.getElementById('island-expanded-layer');
  if (!shell || !idleLayer || !toastLayer || !expandedLayer) return;

  const isIdle = mode === 'idle';
  const isToast = mode === 'toast';
  const isExpanded = mode === 'expanded';
  const hasLiveActivity = Boolean(state.focusRunning || state.ambientMode !== 'off');

  shell.classList.toggle('is-toast', isToast);
  shell.classList.toggle('is-expanded', isExpanded);
  shell.classList.toggle('is-live', isIdle && hasLiveActivity);
  idleLayer.classList.toggle('is-wide-idle', hasLiveActivity);

  idleLayer.classList.toggle('is-hidden', !isIdle);
  toastLayer.classList.toggle('is-hidden', !isToast);
  expandedLayer.classList.toggle('is-hidden', !isExpanded);

  /* همگام‌سازی کامل دسترس‌پذیری و ایزوله‌سازی فوکوس لایه‌های غیرفعال */
  idleLayer.setAttribute('aria-hidden', isIdle ? 'false' : 'true');
  idleLayer.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
  toastLayer.setAttribute('aria-hidden', isToast ? 'false' : 'true');
  expandedLayer.setAttribute('aria-hidden', isExpanded ? 'false' : 'true');

  try {
    idleLayer.inert = !isIdle;
    toastLayer.inert = !isToast;
    expandedLayer.inert = !isExpanded;
  } catch (e) {}

  syncDynamicIslandExpandedHeight();

  if (typeof syncBackLayerCallback === 'function') {
    syncBackLayerCallback();
  }
}

function renderAvatarInto(containerEl) {
  if (!containerEl) return;
  if (state.profile && state.profile.photoDataUrl) {
    containerEl.innerHTML = `<img src="${state.profile.photoDataUrl}" alt="پروفایل" class="w-full h-full object-cover" />`;
  } else {
    containerEl.textContent = (state.profile && state.profile.avatar) || '🧑‍💻';
  }
}

function syncDesktopRailUI() {
  const railIndicator = document.getElementById('rail-nav-indicator');
  if (!railIndicator) return;
  const tabOrder = ['tasks', 'focus', 'stats', 'settings'];
  const idx = Math.max(0, tabOrder.indexOf(state.activeTab));
  railIndicator.style.transform = `translate3d(0, ${idx * 52}px, 0)`;
}

function openDesktopInspector(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  state.inspectedTaskId = taskId;
  const inspector = document.getElementById('desktop-task-inspector');
  const overview = document.getElementById('desktop-overview-stack');
  if (inspector) {
    inspector.classList.remove('hidden');
    inspector.classList.add('flex');
  }
  if (overview) {
    overview.classList.add('hidden');
  }
  renderDesktopInspector();
  renderTasks();
  if (typeof syncBackLayerCallback === 'function') {
    syncBackLayerCallback();
  }
}

function closeDesktopInspector() {
  state.inspectedTaskId = null;
  const inspector = document.getElementById('desktop-task-inspector');
  const overview = document.getElementById('desktop-overview-stack');
  if (inspector) {
    inspector.classList.add('hidden');
    inspector.classList.remove('flex');
  }
  if (overview) {
    overview.classList.remove('hidden');
  }
  renderTasks();
  if (typeof syncBackLayerCallback === 'function') {
    syncBackLayerCallback();
  }
}

function syncDynamicIslandExpandedHeight() {
  const shell = document.getElementById('dynamic-island');
  const expandedLayer = document.getElementById('island-expanded-layer');
  if (!shell || !expandedLayer) return;

  const measured = Math.max(168, Math.ceil(expandedLayer.scrollHeight || expandedLayer.offsetHeight || 168));
  const shellWidth = shell.offsetWidth || Math.min(window.innerWidth * 0.92, 344);

  const closedInsetX = Math.max(0, Math.round((shellWidth - 226) / 2));
  const liveInsetX = Math.max(0, Math.round((shellWidth - 252) / 2));
  const closedInsetB = Math.max(0, measured - 44);
  const toastInsetB = Math.max(0, measured - 48);

  shell.style.setProperty('--island-expanded-h', `${measured}px`);
  shell.style.setProperty('--island-closed-inset-x', `${closedInsetX}px`);
  shell.style.setProperty('--island-live-inset-x', `${liveInsetX}px`);
  shell.style.setProperty('--island-closed-inset-b', `${closedInsetB}px`);
  shell.style.setProperty('--island-toast-inset-b', `${toastInsetB}px`);
}

function setIslandMode(mode, options = {}) {
  const shell = document.getElementById('dynamic-island');
  if (!shell) return;

  if (mode === 'expanded') {
    syncDynamicIslandExpandedHeight();
    if (state.activeIslandToast) {
      renderToastPayloadIntoDom(state.activeIslandToast);
      setExpandedToastBannerVisible(true);
    } else {
      setExpandedToastBannerVisible(false);
    }
    applyIslandVisualState('expanded');
    if (!options.skipMorph) {
      clearIslandAnimationClasses(shell);
    }
    return;
  }

  setExpandedToastBannerVisible(false);
  if (mode === 'idle' && state.activeIslandToast && state.activeIslandToast.hasAction) {
    renderToastPayloadIntoDom(state.activeIslandToast);
    applyIslandVisualState('toast');
    return;
  }

  applyIslandVisualState(mode === 'toast' ? 'toast' : 'idle');
}

function triggerIslandToast(icon, text, options = {}) {
  const duration = Number(options.duration) || 2400;
  const actionLabel = options.actionLabel || 'بازگردانی';
  const onAction = typeof options.onAction === 'function' ? options.onAction : null;
  const hasAction = Boolean(onAction);

  const toastData = { icon, text, actionLabel, hasAction, onAction };
  state.activeIslandToast = toastData;
  state.toastActionCallback = onAction;
  renderToastPayloadIntoDom(toastData);

  if (state.toastTimeout) {
    clearTimeout(state.toastTimeout);
    state.toastTimeout = null;
  }
  state.toastTimeout = setTimeout(expireIslandToast, duration);

  const shell = document.getElementById('dynamic-island');
  if (state.islandMode === 'expanded') {
    setExpandedToastBannerVisible(true);
    syncDynamicIslandExpandedHeight();
    return;
  }

  applyIslandVisualState('toast');
  if (shell) {
    shell.classList.remove('is-popping');
    void shell.offsetWidth;
    shell.classList.add('is-popping');
  }
}

function updateDynamicIslandSmartState(completedCount, totalCount, pct) {
  const shell = document.getElementById('dynamic-island');
  const idleLabel = document.getElementById('island-idle-label');
  const idleMetric = document.getElementById('island-idle-metric');
  const idleSubbadge = document.getElementById('island-idle-subbadge');
  const statusDot = document.getElementById('island-status-dot');
  const ringCircle = document.getElementById('island-dot-ring-circle');
  const hairlineFill = document.getElementById('island-progress-hairline-fill');
  const smartBadge = document.getElementById('island-smart-badge');
  const focusTitle = document.getElementById('island-focus-title');
  const smartStepText = document.getElementById('island-smart-step-text');
  const expandedDot = document.getElementById('island-expanded-dot');
  const quickCompleteBtn = document.getElementById('island-quick-complete-btn');
  const waveEl = document.getElementById('island-wave');

  const todayTasks = getTasksForDayView('today');
  const focusedTask = todayTasks.find((t) => t.id === state.focusedTaskId) || getSmartFocusCandidate();
  if (focusedTask && state.focusedTaskId !== focusedTask.id) {
    state.focusedTaskId = focusedTask.id;
  }

  const totalSec = Math.max(1, (state.focusDurationMinutes || 25) * 60);
  const remSec = Math.max(0, Math.min(totalSec, Number.isFinite(state.focusSeconds) ? state.focusSeconds : totalSec));
  const clockText = `${String(Math.floor(remSec / 60)).padStart(2, '0')}:${String(remSec % 60).padStart(2, '0')}`;
  const focusElapsedRatio = Math.max(0, Math.min(1, 1 - remSec / totalSec));

  const isLive = Boolean(state.focusRunning || state.ambientMode !== 'off');
  const idleLayerEl = document.getElementById('island-idle-layer');
  if (shell) {
    shell.classList.toggle('is-live', state.islandMode === 'idle' && isLive);
  }
  if (idleLayerEl) {
    idleLayerEl.classList.toggle('is-wide-idle', isLive);
  }

  if (statusDot) {
    statusDot.classList.toggle('island-dot-live', state.focusRunning);
  }
  if (expandedDot) {
    expandedDot.classList.toggle('island-dot-live', state.focusRunning);
  }

  if (waveEl) {
    waveEl.classList.toggle('hidden', !isLive);
    waveEl.classList.toggle('flex', isLive);
  }

  if (idleLabel) {
    if (focusedTask) {
      idleLabel.textContent = focusedTask.title;
    } else if (totalCount > 0 && completedCount === totalCount) {
      idleLabel.textContent = 'همه کارها انجام شد 🎉';
    } else {
      idleLabel.textContent = 'آماده تمرکز';
    }
  }

  if (idleSubbadge) {
    const subs = focusedTask && Array.isArray(focusedTask.subtasks) ? focusedTask.subtasks : [];
    if (!state.focusRunning && subs.length > 0) {
      const doneSubs = subs.filter((s) => s.completed).length;
      idleSubbadge.textContent = `${toPersianDigits(doneSubs)}/${toPersianDigits(subs.length)}`;
      idleSubbadge.classList.remove('hidden');
    } else {
      idleSubbadge.classList.add('hidden');
    }
  }

  if (idleMetric) {
    idleMetric.textContent = state.focusRunning ? clockText : `${pct}%`;
  }

  const ringRatio = state.focusRunning ? focusElapsedRatio : pct / 100;
  if (ringCircle) {
    const circumference = 43.98;
    ringCircle.style.strokeDashoffset = (circumference * (1 - Math.max(0, Math.min(1, ringRatio)))).toFixed(2);
  }

  if (hairlineFill) {
    hairlineFill.style.transform = `scaleX(${Math.max(0, Math.min(1, ringRatio)).toFixed(4)})`;
  }

  if (smartBadge) {
    if (state.focusRunning) {
      smartBadge.textContent = 'در حال تمرکز عمیق';
    } else if (focusedTask?.urgent) {
      smartBadge.textContent = 'اولویت فوری 🔥';
    } else if (focusedTask) {
      smartBadge.textContent = getFolderDisplay(focusedTask.category);
    } else {
      smartBadge.textContent = 'جلسه تمرکز عمیق';
    }
  }

  if (focusTitle) {
    focusTitle.textContent = focusedTask ? focusedTask.title : 'یک تسک را برای تمرکز انتخاب کن';
  }

  if (smartStepText) {
    if (!focusedTask) {
      smartStepText.textContent = 'یک کار اضافه کن یا از لیست انتخاب کن';
    } else {
      const subs = Array.isArray(focusedTask.subtasks) ? focusedTask.subtasks : [];
      const nextSub = subs.find((s) => !s.completed);
      if (nextSub) {
        smartStepText.textContent = `مرحله بعدی: ${nextSub.title}`;
      } else if (focusedTask.description) {
        smartStepText.textContent = focusedTask.description;
      } else if (focusedTask.completed) {
        smartStepText.textContent = 'این کار تکمیل شده است ✓';
      } else {
        smartStepText.textContent = 'آماده برای شروع تمرکز';
      }
    }
  }

  if (quickCompleteBtn) {
    const hasActiveFocused = Boolean(focusedTask && !focusedTask.completed);
    quickCompleteBtn.disabled = !hasActiveFocused;
    quickCompleteBtn.classList.toggle('opacity-45', !hasActiveFocused);
    const hasPendingSub =
      hasActiveFocused &&
      Array.isArray(focusedTask.subtasks) &&
      focusedTask.subtasks.some((s) => !s.completed);
    quickCompleteBtn.textContent = hasPendingSub ? '✓ مرحله' : '✓ تکمیل';
  }

  syncDynamicIslandExpandedHeight();
}

function updateFocusUI() {
  const totalSec = Math.max(1, (state.focusDurationMinutes || 25) * 60);
  const remSec = Math.max(0, Math.min(totalSec, Number.isFinite(state.focusSeconds) ? state.focusSeconds : totalSec));
  const clockText = `${String(Math.floor(remSec / 60)).padStart(2, '0')}:${String(remSec % 60).padStart(2, '0')}`;
  const elapsedRatio = Math.max(0, Math.min(1, 1 - remSec / totalSec));
  const isPausedMidSession = !state.focusRunning && remSec < totalSec && remSec > 0;

  const todayTasks = getTasksForDayView('today');
  const focusedTask = todayTasks.find((t) => t.id === state.focusedTaskId) || getSmartFocusCandidate();
  const taskLabel = focusedTask ? focusedTask.title : 'یک تسک را برای تمرکز انتخاب کن';

  const islandTimerEl = document.getElementById('island-timer-display');
  const islandStatePill = document.getElementById('island-timer-state-pill');
  const islandToggleBtn = document.getElementById('island-toggle-timer-btn');
  if (islandTimerEl) islandTimerEl.textContent = clockText;
  if (islandStatePill) {
    islandStatePill.textContent = state.focusRunning ? 'در حال اجرا' : isPausedMidSession ? 'مکث' : 'آماده';
  }
  if (islandToggleBtn) {
    islandToggleBtn.textContent = state.focusRunning
      ? 'توقف موقت'
      : isPausedMidSession
      ? 'ادامه تمرکز'
      : 'شروع تمرکز';
  }

  const pageTitleEl = document.getElementById('focus-page-task-title');
  const pageClockEl = document.getElementById('focus-page-clock');
  const pageStatusEl = document.getElementById('focus-page-status');
  const pageToggleBtn = document.getElementById('focus-page-toggle-btn');
  const ringEl = document.getElementById('focus-ring-circle');
  if (pageTitleEl) pageTitleEl.textContent = taskLabel;
  if (pageClockEl) pageClockEl.textContent = clockText;
  if (pageStatusEl) {
    pageStatusEl.textContent = state.focusRunning ? 'در حال تمرکز...' : isPausedMidSession ? 'متوقف شده' : 'آماده شروع';
  }
  if (pageToggleBtn) {
    pageToggleBtn.textContent = state.focusRunning
      ? 'توقف تمرکز'
      : isPausedMidSession
      ? 'ادامه تمرکز'
      : 'شروع تمرکز';
  }
  if (ringEl) {
    ringEl.style.strokeDashoffset = (326.72 * elapsedRatio).toFixed(2);
  }

  const deskTitleEl = document.getElementById('desktop-focus-task-title');
  const deskClockEl = document.getElementById('desktop-focus-clock');
  const deskToggleBtn = document.getElementById('desktop-focus-toggle-btn');
  if (deskTitleEl) deskTitleEl.textContent = taskLabel;
  if (deskClockEl) deskClockEl.textContent = clockText;
  if (deskToggleBtn) {
    deskToggleBtn.textContent = state.focusRunning ? 'توقف' : isPausedMidSession ? 'ادامه' : 'شروع تمرکز';
  }

  document.querySelectorAll('.focus-min-chip').forEach((chip) => {
    const isActive = Number(chip.dataset.focusMin) === state.focusDurationMinutes;
    const sizeType = chip.dataset.chipSize;
    if (sizeType === 'island') {
      chip.classList.toggle('is-active', isActive);
      chip.classList.toggle('text-[#0b1617]', isActive);
      chip.classList.toggle('text-slate-300', !isActive);
    } else if (sizeType === 'page') {
      chip.classList.toggle('bg-[#7fd5d8]', isActive);
      chip.classList.toggle('text-[#0b1617]', isActive);
      chip.classList.toggle('bg-white/10', !isActive);
      chip.classList.toggle('text-slate-200', !isActive);
    } else {
      chip.classList.toggle('bg-[#7fd5d8]', isActive);
      chip.classList.toggle('text-[#0b1617]', isActive);
      chip.classList.toggle('bg-white/10', !isActive);
      chip.classList.toggle('text-slate-300', !isActive);
    }
  });

  const minsList = [15, 25, 45];
  const pillIdx = minsList.indexOf(state.focusDurationMinutes);
  const pillInd = document.getElementById('island-timer-indicator');
  if (pillInd && pillIdx >= 0 && !pillInd.classList.contains('is-scrubbing')) {
    pillInd.style.transform = `translate3d(${pillIdx * 100}%, 0, 0)`;
  }

  updateHeaderAndProgress();
}

function setFocusDuration(minutes, options = {}) {
  const fromScrub = Boolean(options.fromScrub);
  const minsList = [15, 25, 45];
  const oldIdx = minsList.indexOf(state.focusDurationMinutes);
  const newIdx = minsList.indexOf(minutes);

  if (state.focusRunning) {
    pauseFocusTimer(true);
  }
  state.focusDurationMinutes = minutes;
  state.focusSeconds = minutes * 60;
  state.focusRemainingMs = minutes * 60 * 1000;
  state.focusEndTimestamp = null;
  state.focusLastRenderedSecond = state.focusSeconds;

  const indicator = document.getElementById('island-timer-indicator');
  if (indicator && !fromScrub && newIdx >= 0) {
    indicator.style.transform = `translate3d(${newIdx * 100}%, 0, 0)`;
    if (oldIdx >= 0 && oldIdx !== newIdx) {
      triggerBlobStretch(document.getElementById('island-timer-indicator-blob'), Math.abs(newIdx - oldIdx));
    }
  }

  saveState();
  updateFocusUI();
  if (state.activeTab === 'settings') renderSecondaryTabViews();
}

function syncFocusTimerTick(forceRender = false) {
  if (!state.focusRunning || typeof state.focusEndTimestamp !== 'number') return;
  const remMs = Math.max(0, state.focusEndTimestamp - Date.now());
  state.focusRemainingMs = remMs;
  const nextSec = Math.ceil(remMs / 1000);
  state.focusSeconds = nextSec;

  if (remMs <= 0) {
    if (state.focusIntervalId) {
      clearInterval(state.focusIntervalId);
      state.focusIntervalId = null;
    }
    cancelFocusEndNotification();
    state.focusRunning = false;
    state.focusEndTimestamp = null;
    state.focusRemainingMs = state.focusDurationMinutes * 60 * 1000;
    state.focusSeconds = state.focusDurationMinutes * 60;
    state.focusLastRenderedSecond = state.focusSeconds;
    saveState();
    updateFocusUI();
    playTactileSound('complete');
    triggerHaptic(25);
    spawnCelebrationSparkles();
    triggerIslandToast('🎉', 'جلسه تمرکز با موفقیت کامل شد!');
    return;
  }

  if (forceRender || nextSec !== state.focusLastRenderedSecond) {
    state.focusLastRenderedSecond = nextSec;
    updateFocusUI();
  }
}

function ensureFocusIntervalLoop() {
  if (state.focusIntervalId) {
    clearInterval(state.focusIntervalId);
    state.focusIntervalId = null;
  }
  state.focusIntervalId = setInterval(() => {
    syncFocusTimerTick(false);
  }, 250);
}

function startFocusTimer() {
  if (state.focusRunning) return;
  if (!state.focusedTaskId) {
    const candidate = getSmartFocusCandidate();
    if (candidate) state.focusedTaskId = candidate.id;
  }
  if (!state.focusRemainingMs || state.focusRemainingMs <= 0) {
    state.focusRemainingMs = (state.focusDurationMinutes || 25) * 60 * 1000;
  }
  state.focusEndTimestamp = Date.now() + state.focusRemainingMs;
  state.focusRunning = true;
  state.focusLastRenderedSecond = Math.ceil(state.focusRemainingMs / 1000);
  ensureFocusIntervalLoop();

  if (!isNativeAndroidApp() && typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission()
      .then((res) => {
        updateNotificationSettingsUI();
        if (res === 'granted' && state.focusRunning) {
          scheduleFocusEndNotification();
        }
      })
      .catch(() => {});
  }
  scheduleFocusEndNotification();

  saveState();
  updateFocusUI();
  playTactileSound('pop');
  triggerHaptic(10);
}

function pauseFocusTimer(silent = false) {
  if (typeof state.focusEndTimestamp === 'number') {
    state.focusRemainingMs = Math.max(0, state.focusEndTimestamp - Date.now());
  }
  state.focusSeconds = Math.ceil((state.focusRemainingMs || 0) / 1000);
  state.focusEndTimestamp = null;
  state.focusRunning = false;
  if (state.focusIntervalId) {
    clearInterval(state.focusIntervalId);
    state.focusIntervalId = null;
  }
  cancelFocusEndNotification();
  saveState();
  updateFocusUI();
  if (!silent) playTactileSound('pop');
}

function resetFocusTimer() {
  pauseFocusTimer(true);
  cancelFocusEndNotification();
  state.focusRemainingMs = (state.focusDurationMinutes || 25) * 60 * 1000;
  state.focusSeconds = (state.focusDurationMinutes || 25) * 60;
  state.focusLastRenderedSecond = state.focusSeconds;
  saveState();
  updateFocusUI();
  playTactileSound('pop');
}

function setFocusedTask(taskId) {
  const found = state.tasks.find((t) => t.id === taskId);
  if (!found) return;
  state.focusedTaskId = taskId;
  if (state.focusRunning) {
    scheduleFocusEndNotification();
  }
  saveState();
  renderTasks();
  updateFocusUI();
  playTactileSound('pop');
  triggerIslandToast('🎯', `تمرکز روی: ${found.title}`);
}

function updateHeaderAndProgress() {
  const greetingEl = document.getElementById('greeting-title');
  const dateEl = document.getElementById('jalali-date-label');
  const streakEl = document.getElementById('streak-badge');

  if (greetingEl) greetingEl.textContent = `سلام ${state.profile.name || 'دوست من'}!`;
  if (dateEl) {
    const dayMeta = getDayViewMeta(state.selectedDayView);
    dateEl.textContent = `${dayMeta.label} • ${formatJalaliForDayView(state.selectedDayView)}`;
  }
  if (streakEl) {
    streakEl.textContent = `🔥 ${toPersianDigits(state.streak.count || 1)} روز`;
  }

  renderAvatarInto(document.getElementById('header-avatar-badge'));
  renderAvatarInto(document.getElementById('rail-avatar-badge'));

  const privacyBtn = document.getElementById('privacy-quick-btn');
  const privacyLabel = document.getElementById('privacy-btn-label');
  if (privacyBtn) {
    privacyBtn.classList.toggle('bg-[#7fd5d8]/20', state.privacyBlur);
    privacyBtn.classList.toggle('text-[#7fd5d8]', state.privacyBlur);
  }
  if (privacyLabel) {
    privacyLabel.textContent = state.privacyBlur ? 'حریم خصوصی فعال' : 'حریم خصوصی';
  }

  const soundBtn = document.getElementById('sound-toggle-btn');
  const soundLabel = document.getElementById('sound-btn-label');
  if (soundBtn) {
    soundBtn.classList.toggle('opacity-60', !state.soundEnabled);
  }
  if (soundLabel) {
    soundLabel.textContent = state.soundEnabled ? 'صدا فعال' : 'بی‌صدا';
  }

  ['yesterday', 'today', 'tomorrow'].forEach((viewKey) => {
    const badgeEl = document.getElementById(`day-badge-${viewKey}`);
    if (!badgeEl) return;
    const list = getTasksForDayView(viewKey);
    const remaining = list.filter((t) => !t.completed).length;
    if (viewKey === 'today') {
      badgeEl.textContent = toPersianDigits(remaining);
      badgeEl.classList.remove('hidden');
    } else if (list.length > 0) {
      badgeEl.textContent = toPersianDigits(list.length);
      badgeEl.classList.remove('hidden');
    } else {
      badgeEl.classList.add('hidden');
    }
  });

  const activeViewTasks = getTasksForDayView(state.selectedDayView);
  const doneCount = activeViewTasks.filter((t) => t.completed).length;
  const totalCount = activeViewTasks.length;
  const pct = totalCount === 0 ? 0 : Math.min(100, Math.round((doneCount / totalCount) * 100));

  const ratioEl = document.getElementById('progress-ratio');
  const pctEl = document.getElementById('progress-percent');
  const barEl = document.getElementById('liquid-progress-bar');

  if (ratioEl) {
    ratioEl.textContent = `${toPersianDigits(doneCount)} از ${toPersianDigits(totalCount)} کار تکمیل شده • هدف ${toPersianDigits(state.dailyGoal || 5)}`;
  }
  if (pctEl) {
    pctEl.textContent = `${pct}%`;
  }
  if (barEl) {
    barEl.style.transform = `scaleX(${(pct / 100).toFixed(4)})`;
  }

  const todayTasks = getTasksForDayView('today');
  const todayDone = todayTasks.filter((t) => t.completed).length;
  const todayPct = todayTasks.length === 0 ? 0 : Math.min(100, Math.round((todayDone / todayTasks.length) * 100));
  updateDynamicIslandSmartState(todayDone, todayTasks.length, todayPct);
}

function setSelectedDayView(dayView, options = {}) {
  const fromScrub = Boolean(options.fromScrub);
  const dayOrder = ['yesterday', 'today', 'tomorrow'];
  const oldIdx = Math.max(0, dayOrder.indexOf(state.selectedDayView));
  const newIdx = Math.max(0, dayOrder.indexOf(dayView));
  const targetDay = dayOrder[newIdx];
  state.selectedDayView = targetDay;

  dayOrder.forEach((key) => {
    const channelEl = document.getElementById(`day-channel-${key}`);
    if (channelEl) {
      channelEl.classList.toggle('is-channel-hidden', key !== targetDay);
    }
  });

  document.querySelectorAll('.day-tab-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.dayView === targetDay);
  });

  const indicator = document.getElementById('day-nav-indicator');
  if (indicator && !fromScrub) {
    indicator.style.transform = `translate3d(${-newIdx * 100}%, 0, 0)`;
  }

  if (!fromScrub && oldIdx !== newIdx) {
    triggerBlobStretch(document.getElementById('day-nav-indicator-blob'), Math.abs(newIdx - oldIdx));
    playTactileSound('nav-step', newIdx - oldIdx);
    triggerHaptic(7);
  }

  renderTasks();
  updateHeaderAndProgress();
}

function renderFolderFilterChips() {
  const container = document.getElementById('folder-filter-chips-container');
  if (!container) return;

  const folders = [{ name: 'all', emoji: '📂', label: 'همه پوشه‌ها' }, ...getAllFolders().map((f) => ({ name: f.name, emoji: f.emoji, label: f.name }))];
  container.innerHTML = folders
    .map((f) => {
      const active = state.folderFilter === f.name;
      return `
        <button
          type="button"
          data-folder-filter="${escapeHtml(f.name)}"
          class="spring-btn whitespace-nowrap text-[11px] px-2.5 py-1 rounded-full border cursor-pointer ${
            active
              ? 'bg-[#7fd5d8]/20 border-[#7fd5d8]/45 text-[#7fd5d8] font-bold'
              : 'bg-white/[0.05] border-white/10 text-[#93a3a5]'
          }"
        >
          ${escapeHtml(f.emoji)} ${escapeHtml(f.label)}
        </button>
      `;
    })
    .join('');

  container.querySelectorAll('[data-folder-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.folderFilter = btn.dataset.folderFilter || 'all';
      renderFolderFilterChips();
      renderTasks();
      playTactileSound('pop');
    });
  });
}

function buildTaskCardHtml(task, dayView) {
  const subs = Array.isArray(task.subtasks) ? task.subtasks : [];
  const doneSubs = subs.filter((s) => s.completed).length;
  const isFocused = state.focusedTaskId === task.id;
  const isInspected = state.inspectedTaskId === task.id;
  const privacyClass = state.privacyBlur ? 'privacy-blur-text' : '';

  const subtasksHtml =
    subs.length > 0
      ? `<div class="mt-2.5 pt-2 border-t border-white/[0.07] flex flex-col gap-1.5">
          ${subs
            .map(
              (sub) => `
              <button
                type="button"
                data-action="toggle-subtask"
                data-task-id="${escapeHtml(task.id)}"
                data-sub-id="${escapeHtml(sub.id)}"
                data-day-view="${escapeHtml(dayView)}"
                class="flex items-center gap-2 text-right group cursor-pointer"
              >
                <span class="subtask-check ${sub.completed ? 'checked' : ''}">
                  ${
                    sub.completed
                      ? '<svg class="w-3 h-3 text-[#0b1617]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path class="check-stroke-anim" stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>'
                      : ''
                  }
                </span>
                <span dir="auto" class="text-xs leading-snug ${privacyClass} ${
                sub.completed ? 'line-through text-[#7d8e90]' : 'text-slate-200'
              }">${escapeHtml(sub.title)}</span>
              </button>
            `
            )
            .join('')}
        </div>`
      : '';

  const moveToTodayBtn =
    dayView !== 'today' && !task.isHabit
      ? `<button
          type="button"
          data-action="move-today"
          data-task-id="${escapeHtml(task.id)}"
          title="انتقال به امروز"
          class="spring-btn text-[10px] font-bold px-2 py-1 rounded-full bg-[#7fd5d8]/15 text-[#7fd5d8] border border-[#7fd5d8]/30 cursor-pointer"
        >
          ☀️ امروز
        </button>`
      : '';

  return `
    <div class="task-swipe-slot" data-slot-task-id="${escapeHtml(task.id)}">
      <div class="task-swipe-backdrop" aria-hidden="true">
        <span class="text-xs font-extrabold text-[#7fd5d8]">✓ انجام شد</span>
        <span class="text-xs font-extrabold text-rose-300">🗑️ حذف</span>
      </div>
      <article
        draggable="true"
        data-task-id="${escapeHtml(task.id)}"
        data-day-view="${escapeHtml(dayView)}"
        class="task-card liquid-card p-3.5 relative ${isInspected ? 'is-inspected' : ''} ${
    isFocused ? 'border-[#7fd5d8]/45' : ''
  }"
      >
        <div class="flex items-start justify-between gap-2.5">
          <div class="flex items-start gap-3 min-w-0 flex-1">
            <button
              type="button"
              data-action="toggle-task"
              data-task-id="${escapeHtml(task.id)}"
              data-day-view="${escapeHtml(dayView)}"
              aria-label="تغییر وضعیت انجام کار"
              class="check-circle mt-0.5 cursor-pointer ${task.completed ? 'checked' : ''}"
            >
              ${
                task.completed
                  ? '<svg class="w-3.5 h-3.5 text-[#0b1617]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path class="check-stroke-anim" stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>'
                  : ''
              }
            </button>

            <div class="min-w-0 flex-1">
              <h3 dir="auto" class="text-[13.5px] font-bold leading-snug ${privacyClass} ${
    task.completed ? 'line-through text-[#7d8e90]' : 'text-white'
  }">
                ${escapeHtml(task.title)}
              </h3>
              ${
                task.description
                  ? `<p dir="auto" class="text-[11px] text-[#93a3a5] mt-0.5 leading-relaxed ${privacyClass}">${escapeHtml(
                      task.description
                    )}</p>`
                  : ''
              }

              <div class="flex items-center gap-1.5 flex-wrap mt-2">
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${getCategoryBadgeStyle(
                  task.category
                )}">
                  ${escapeHtml(getFolderDisplay(task.category))}
                </span>
                ${
                  task.urgent
                    ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/30">🔥 فوری</span>'
                    : ''
                }
                ${
                  task.isHabit
                    ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-400/30">🔁 عادت</span>'
                    : ''
                }
                ${
                  subs.length > 0
                    ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/[0.07] text-[#93a3a5]">
                        ☑️ ${toPersianDigits(doneSubs)}/${toPersianDigits(subs.length)}
                      </span>`
                    : ''
                }
                ${
                  isFocused
                    ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#7fd5d8]/20 text-[#7fd5d8]">🎯 در حال تمرکز</span>'
                    : ''
                }
              </div>
            </div>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            ${moveToTodayBtn}
            <button
              type="button"
              data-action="focus-task"
              data-task-id="${escapeHtml(task.id)}"
              title="انتخاب برای تایمر تمرکز"
              class="spring-btn icon-circle-btn w-7 h-7 rounded-full ${
                isFocused ? 'bg-[#7fd5d8] text-[#0b1617]' : 'bg-white/[0.06] hover:bg-white/15 text-slate-300'
              } cursor-pointer"
            >
              <svg width="14" height="14" class="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              type="button"
              data-action="edit-task"
              data-task-id="${escapeHtml(task.id)}"
              title="ویرایش کار"
              class="spring-btn icon-circle-btn w-7 h-7 rounded-full bg-white/[0.06] hover:bg-white/15 text-slate-300 cursor-pointer"
            >
              <svg width="14" height="14" class="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </button>
            <button
              type="button"
              data-action="delete-task"
              data-task-id="${escapeHtml(task.id)}"
              title="حذف کار"
              class="spring-btn icon-circle-btn w-7 h-7 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 cursor-pointer"
            >
              <svg width="14" height="14" class="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </div>
        </div>
        ${subtasksHtml}
      </article>
    </div>
  `;
}

function renderTasks() {
  const q = state.searchQuery.trim().toLowerCase();

  ['yesterday', 'today', 'tomorrow'].forEach((viewKey) => {
    const channelEl = document.getElementById(`day-channel-${viewKey}`);
    if (!channelEl) return;

    let list = getTasksForDayView(viewKey);

    if (state.filter === 'active') list = list.filter((t) => !t.completed);
    else if (state.filter === 'completed') list = list.filter((t) => t.completed);
    else if (state.filter === 'urgent') list = list.filter((t) => t.urgent);
    else if (state.filter === 'habit') list = list.filter((t) => t.isHabit);

    if (state.folderFilter !== 'all') {
      list = list.filter((t) => t.category === state.folderFilter);
    }

    if (q) {
      list = list.filter((t) => {
        const subMatch = Array.isArray(t.subtasks) && t.subtasks.some((s) => (s.title || '').toLowerCase().includes(q));
        return (
          (t.title || '').toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q) ||
          (t.category || '').toLowerCase().includes(q) ||
          subMatch
        );
      });
    }

    if (state.autoSortCompleted) {
      list = [...list].sort((a, b) => Number(a.completed) - Number(b.completed));
    }

    if (list.length === 0) {
      const dayLabel = getDayViewMeta(viewKey).label;
      channelEl.innerHTML = `
        <div class="liquid-surface-fast rounded-3xl p-6 text-center flex flex-col items-center gap-2.5">
          <span class="text-2xl">🌿</span>
          <p class="text-xs font-bold text-white">هیچ کاری در لیست «${dayLabel}» یافت نشد</p>
          <p class="text-[11px] text-[#93a3a5]">با دکمه + پایین صفحه یک کار جدید برای ${dayLabel} اضافه کن.</p>
          <button
            type="button"
            data-action="empty-add-task"
            data-day-view="${viewKey}"
            class="spring-btn mt-1 px-4 py-2 rounded-full bg-[#7fd5d8] text-[#0b1617] text-xs font-extrabold cursor-pointer"
          >
            + افزودن کار برای ${dayLabel}
          </button>
        </div>
      `;
    } else {
      channelEl.innerHTML = list.map((task) => buildTaskCardHtml(task, viewKey)).join('');
    }
  });

  const currentViewTasks = getTasksForDayView(state.selectedDayView);
  const hasCompleted = currentViewTasks.some((t) => t.completed && !t.isHabit);
  const clearMob = document.getElementById('clear-completed-btn');
  const clearDesk = document.getElementById('clear-completed-desktop-btn');
  if (clearMob) {
    clearMob.classList.toggle('opacity-0', !hasCompleted);
    clearMob.classList.toggle('pointer-events-none', !hasCompleted);
  }
  if (clearDesk) {
    clearDesk.classList.toggle('opacity-0', !hasCompleted);
    clearDesk.classList.toggle('pointer-events-none', !hasCompleted);
  }
}

function setupTaskListDelegation() {
  const taskListEl = document.getElementById('task-list');
  if (!taskListEl) return;

  taskListEl.addEventListener('click', (e) => {
    if (suppressNextCardClick) {
      suppressNextCardClick = false;
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      e.stopPropagation();
      const action = actionBtn.dataset.action;
      const taskId = actionBtn.dataset.taskId;
      const dayView = actionBtn.dataset.dayView || state.selectedDayView;

      if (action === 'toggle-task') {
        toggleTask(taskId, false, dayView);
      } else if (action === 'toggle-subtask') {
        toggleSubtask(taskId, actionBtn.dataset.subId, false, dayView);
      } else if (action === 'focus-task') {
        setFocusedTask(taskId);
      } else if (action === 'edit-task') {
        if (window.innerWidth >= 1024) {
          openDesktopInspector(taskId);
        } else {
          openTaskEditModal(taskId);
        }
      } else if (action === 'delete-task') {
        deleteTask(taskId);
      } else if (action === 'move-today') {
        const task = state.tasks.find((t) => t.id === taskId);
        if (task) {
          task.scheduledDate = getTodayKey();
          saveState();
          renderTasks();
          updateHeaderAndProgress();
          playTactileSound('pop');
          triggerIslandToast('☀️', 'کار به برنامه امروز منتقل شد');
        }
      } else if (action === 'empty-add-task') {
        openTaskComposer(dayView);
      }
      return;
    }

    const card = e.target.closest('.task-card');
    if (card && card.dataset.taskId) {
      if (window.innerWidth >= 1024) {
        openDesktopInspector(card.dataset.taskId);
      } else {
        openTaskEditModal(card.dataset.taskId);
      }
    }
  });

  /* پشتیبانی از سوایپ افقی روی کارت کار برای تکمیل یا حذف */
  let swipeSlot = null;
  let swipeCard = null;
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeDx = 0;
  let isSwiping = false;

  taskListEl.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      const slot = e.target.closest('.task-swipe-slot');
      const card = slot?.querySelector('.task-card');
      if (!slot || !card) return;
      swipeSlot = slot;
      swipeCard = card;
      swipeStartX = e.touches[0].clientX;
      swipeStartY = e.touches[0].clientY;
      swipeDx = 0;
      isSwiping = false;
    },
    { passive: true }
  );

  taskListEl.addEventListener(
    'touchmove',
    (e) => {
      if (!swipeCard || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - swipeStartX;
      const dy = e.touches[0].clientY - swipeStartY;

      if (!isSwiping) {
        if (Math.abs(dy) > Math.abs(dx) * 1.15 && Math.abs(dy) > 8) {
          swipeCard = null;
          swipeSlot = null;
          return;
        }
        if (Math.abs(dx) < 12) return;
        isSwiping = true;
        suppressNextCardClick = true;
        swipeSlot.classList.add('is-actively-swiping');
      }

      if (e.cancelable) e.preventDefault();
      swipeDx = Math.max(-130, Math.min(130, dx));
      swipeCard.style.transform = `translate3d(${swipeDx}px, 0, 0)`;
      swipeSlot.classList.toggle('is-swiping-complete', swipeDx > 48);
      swipeSlot.classList.toggle('is-swiping-delete', swipeDx < -48);
    },
    { passive: false }
  );

  const finishCardSwipe = () => {
    if (!swipeCard || !swipeSlot) return;
    const card = swipeCard;
    const slot = swipeSlot;
    const taskId = card.dataset.taskId;
    const dayView = card.dataset.dayView || state.selectedDayView;
    const dx = swipeDx;

    swipeCard = null;
    swipeSlot = null;
    slot.classList.remove('is-actively-swiping', 'is-swiping-complete', 'is-swiping-delete');
    card.style.transform = '';

    if (isSwiping) {
      if (dx > 76 && taskId) {
        toggleTask(taskId, false, dayView);
      } else if (dx < -76 && taskId) {
        deleteTask(taskId);
      }
      setTimeout(() => {
        suppressNextCardClick = false;
      }, 80);
    }
    isSwiping = false;
  };

  taskListEl.addEventListener('touchend', finishCardSwipe);
  taskListEl.addEventListener('touchcancel', finishCardSwipe);

  /* پشتیبانی از Drag & Drop برای مرتب‌سازی کارها در دسکتاپ */
  taskListEl.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.task-card');
    if (!card) return;
    draggedTaskId = card.dataset.taskId;
    card.classList.add('is-dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedTaskId);
    }
  });

  taskListEl.addEventListener('dragend', () => {
    draggedTaskId = null;
    taskListEl.querySelectorAll('.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
    taskListEl.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach((el) =>
      el.classList.remove('drag-over-top', 'drag-over-bottom')
    );
  });

  taskListEl.addEventListener('dragover', (e) => {
    if (!draggedTaskId) return;
    const slot = e.target.closest('.task-swipe-slot');
    if (!slot || slot.dataset.slotTaskId === draggedTaskId) return;
    e.preventDefault();
    const rect = slot.getBoundingClientRect();
    const isTop = e.clientY < rect.top + rect.height / 2;
    slot.classList.toggle('drag-over-top', isTop);
    slot.classList.toggle('drag-over-bottom', !isTop);
  });

  taskListEl.addEventListener('dragleave', (e) => {
    const slot = e.target.closest('.task-swipe-slot');
    slot?.classList.remove('drag-over-top', 'drag-over-bottom');
  });

  taskListEl.addEventListener('drop', (e) => {
    if (!draggedTaskId) return;
    const slot = e.target.closest('.task-swipe-slot');
    if (!slot) return;
    e.preventDefault();
    const targetId = slot.dataset.slotTaskId;
    slot.classList.remove('drag-over-top', 'drag-over-bottom');
    if (!targetId || targetId === draggedTaskId) return;

    const fromIdx = state.tasks.findIndex((t) => t.id === draggedTaskId);
    const toIdx = state.tasks.findIndex((t) => t.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = state.tasks.splice(fromIdx, 1);
    state.tasks.splice(toIdx, 0, moved);
    saveState();
    renderTasks();
    playTactileSound('pop');
  });
}

function addTask(title, options = {}) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return;

  const dayView = options.dayView || state.selectedDayView || 'today';
  const isHabit = Boolean(options.isHabit);
  const scheduledDate = isHabit ? getTodayKey() : getDayKeyForView(dayView);
  const rawSubs = Array.isArray(options.subtasks) ? options.subtasks : [];

  const newTask = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: cleanTitle,
    description: String(options.description || '').trim(),
    category: options.category || state.selectedCategory || 'شخصی',
    urgent: Boolean(options.urgent),
    isHabit,
    autoCompleteSubtasks: options.autoCompleteSubtasks !== false,
    completed: false,
    scheduledDate,
    habitHistory: isHabit ? {} : undefined,
    subtasks: rawSubs.map((st, idx) => ({
      id: `sub_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
      title: typeof st === 'string' ? st : String(st.title || '').trim(),
      completed: false,
    })),
    createdAt: Date.now(),
  };

  state.tasks.unshift(newTask);
  if (!state.focusedTaskId && scheduledDate === getTodayKey()) {
    state.focusedTaskId = newTask.id;
  }

  saveState();
  renderTasks();
  if (!isHabit && state.selectedDayView !== dayView) {
    setSelectedDayView(dayView);
  } else {
    updateHeaderAndProgress();
  }
  if (state.activeTab === 'stats') renderSecondaryTabViews();
  playTactileSound('complete');
  triggerIslandToast('✨', `«${cleanTitle}» اضافه شد`);
}

function toggleTask(taskId, silent = false, dayView = state.selectedDayView) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  const todayKey = getTodayKey();
  const targetDayKey = getDayKeyForView(dayView);
  let nextCompleted = false;

  if (task.isHabit && targetDayKey !== todayKey) {
    if (!task.habitHistory || typeof task.habitHistory !== 'object') {
      task.habitHistory = {};
    }
    const prevRec = task.habitHistory[targetDayKey] || { completed: false, doneSubIds: [] };
    nextCompleted = !prevRec.completed;
    task.habitHistory[targetDayKey] = {
      completed: nextCompleted,
      doneSubIds: nextCompleted ? (task.subtasks || []).map((s) => s.id) : [],
    };
  } else {
    nextCompleted = !task.completed;
    task.completed = nextCompleted;
    if (task.isHabit) {
      syncHabitDaySnapshot(task, todayKey);
    }
  }

  if (nextCompleted && state.focusedTaskId === task.id) {
    advanceSmartFocusTask(false);
  }

  saveState();
  renderTasks();
  updateHeaderAndProgress();
  if (state.inspectedTaskId === task.id) renderDesktopInspector();
  if (state.activeTab === 'stats') renderSecondaryTabViews();

  if (!silent) {
    if (nextCompleted) {
      playTactileSound('complete');
      triggerHaptic(12);
      spawnCelebrationSparkles();
      triggerIslandToast('🎉', `آفرین! «${task.title}» انجام شد`);
    } else {
      playTactileSound('pop');
    }
  }
}

function toggleSubtask(taskId, subtaskId, silent = false, dayView = state.selectedDayView) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task || !Array.isArray(task.subtasks)) return;

  const todayKey = getTodayKey();
  const targetDayKey = getDayKeyForView(dayView);

  if (task.isHabit && targetDayKey !== todayKey) {
    if (!task.habitHistory || typeof task.habitHistory !== 'object') {
      task.habitHistory = {};
    }
    const rec = task.habitHistory[targetDayKey] || { completed: false, doneSubIds: [] };
    const set = new Set(rec.doneSubIds || []);
    if (set.has(subtaskId)) set.delete(subtaskId);
    else set.add(subtaskId);
    const allDone = task.subtasks.length > 0 && task.subtasks.every((s) => set.has(s.id));
    task.habitHistory[targetDayKey] = {
      completed: task.autoCompleteSubtasks !== false ? allDone : rec.completed,
      doneSubIds: Array.from(set),
    };
  } else {
    const sub = task.subtasks.find((s) => s.id === subtaskId);
    if (!sub) return;
    sub.completed = !sub.completed;

    if (task.autoCompleteSubtasks !== false && task.subtasks.length > 0) {
      const allDone = task.subtasks.every((s) => s.completed);
      if (allDone && !task.completed) {
        task.completed = true;
        if (!silent) spawnCelebrationSparkles();
      } else if (!allDone && task.completed) {
        task.completed = false;
      }
    }
    if (task.isHabit) {
      syncHabitDaySnapshot(task, todayKey);
    }
  }

  saveState();
  renderTasks();
  updateHeaderAndProgress();
  if (state.inspectedTaskId === task.id) renderDesktopInspector();
  if (state.activeTab === 'stats') renderSecondaryTabViews();
  if (!silent) {
    playTactileSound('pop');
    triggerHaptic(8);
  }
}

function deleteTask(taskId) {
  const idx = state.tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return;

  const removed = state.tasks[idx];
  state.undoSnapshot = JSON.parse(JSON.stringify(state.tasks));
  state.tasks.splice(idx, 1);

  if (state.focusedTaskId === taskId) {
    const next = getSmartFocusCandidate();
    state.focusedTaskId = next ? next.id : null;
    if (state.focusRunning) scheduleFocusEndNotification();
  }
  if (state.inspectedTaskId === taskId) {
    closeDesktopInspector();
  }

  saveState();
  renderTasks();
  updateHeaderAndProgress();
  if (state.activeTab === 'stats') renderSecondaryTabViews();
  playTactileSound('delete');
  triggerHaptic(10);

  triggerIslandToast('🗑️', `«${removed.title}» حذف شد`, {
    duration: 4200,
    actionLabel: 'بازگردانی',
    onAction: () => {
      if (!state.undoSnapshot) return;
      state.tasks = state.undoSnapshot;
      state.undoSnapshot = null;
      const next = getSmartFocusCandidate();
      state.focusedTaskId = next ? next.id : null;
      if (state.focusRunning) scheduleFocusEndNotification();
      saveState();
      renderTasks();
      updateHeaderAndProgress();
      if (state.activeTab === 'stats') renderSecondaryTabViews();
      playTactileSound('complete');
      triggerIslandToast('↩️', 'کار بازگردانده شد');
    },
  });
}

/* ==================== مدیریت دفترچه یادداشت ==================== */
function setNotebookFilter(nextFilter, options = {}) {
  const fromScrub = Boolean(options.fromScrub);
  const filterOrder = ['all', 'pinned', 'idea', 'quote', 'later', 'general'];
  const oldIdx = filterOrder.indexOf(state.notebookFilter);
  const newIdx = filterOrder.indexOf(nextFilter);
  state.notebookFilter = nextFilter;

  syncDynamicPillIndicator({
    barId: 'notebook-filter-pill-bar',
    indicatorId: 'notebook-filter-indicator',
    blobId: 'notebook-filter-indicator-blob',
    btnSelector: '.notebook-filter-chip',
    activeValue: nextFilter,
    dataAttr: 'noteFilter',
    stepDistance: oldIdx >= 0 && newIdx >= 0 ? Math.abs(newIdx - oldIdx) : 0,
    animateStretch: !fromScrub && oldIdx !== newIdx,
    fromScrub,
  });

  renderNotebookModalList();
}

function getSortedNotebookEntries() {
  return [...state.quickNotes].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) {
      return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    }
    return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
  });
}

function renderQuickNotes() {
  const listEl = document.getElementById('quick-notes-list');
  const countEl = document.getElementById('quick-notes-count');
  const footerBtn = document.getElementById('view-all-notes-footer-btn');
  if (!listEl) return;

  const sorted = getSortedNotebookEntries();
  if (countEl) countEl.textContent = toPersianDigits(sorted.length);
  if (footerBtn) footerBtn.classList.toggle('hidden', sorted.length <= 3);

  if (sorted.length === 0) {
    listEl.innerHTML = `<p class="text-[11px] text-[#7d8e90] text-center py-2">یادداشتی ثبت نشده است؛ ایده یا نکته مهمی داری بنویس ✨</p>`;
    return;
  }

  const privacyClass = state.privacyBlur ? 'privacy-blur-text' : '';
  listEl.innerHTML = sorted
    .slice(0, 3)
    .map((note) => {
      const tagMeta = NOTE_TAGS[note.tag] || NOTE_TAGS.general;
      const displayTitle = note.title || note.text;
      return `
        <div
          data-open-note-id="${escapeHtml(note.id)}"
          class="notebook-entry-card ${note.pinned ? 'is-pinned' : ''} px-3 py-2 flex items-center justify-between gap-2 cursor-pointer"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              ${note.pinned ? '<span class="text-[10px]">📌</span>' : ''}
              <span class="text-[10px] shrink-0">${tagMeta.emoji}</span>
              <span dir="auto" class="text-xs font-bold text-white truncate ${privacyClass}">${escapeHtml(displayTitle)}</span>
            </div>
            ${
              note.title && note.text
                ? `<p dir="auto" class="text-[10px] text-[#93a3a5] truncate mt-0.5 ${privacyClass}">${escapeHtml(note.text)}</p>`
                : ''
            }
          </div>
          <span class="text-[10px] text-[#7fd5d8] shrink-0">‹</span>
        </div>
      `;
    })
    .join('');

  listEl.querySelectorAll('[data-open-note-id]').forEach((card) => {
    card.addEventListener('click', () => {
      openNoteEditorModal(card.dataset.openNoteId);
    });
  });
}

function renderNotebookModalList() {
  const listEl = document.getElementById('notebook-entries-list');
  const subtitleEl = document.getElementById('notebook-modal-subtitle');
  if (!listEl) return;

  const q = state.notebookSearchQuery.trim().toLowerCase();
  let entries = getSortedNotebookEntries();

  if (state.notebookFilter === 'pinned') {
    entries = entries.filter((n) => n.pinned);
  } else if (state.notebookFilter !== 'all') {
    entries = entries.filter((n) => n.tag === state.notebookFilter);
  }

  if (q) {
    entries = entries.filter(
      (n) => (n.title || '').toLowerCase().includes(q) || (n.text || '').toLowerCase().includes(q)
    );
  }

  if (subtitleEl) {
    subtitleEl.textContent = `${toPersianDigits(entries.length)} یادداشت در دفترچه ذخیره شده است`;
  }

  if (entries.length === 0) {
    listEl.innerHTML = `
      <div class="rounded-3xl bg-white/[0.03] border border-white/[0.07] p-8 text-center flex flex-col items-center gap-2 my-auto">
        <span class="text-3xl">📓</span>
        <p class="text-xs font-bold text-white">یادداشتی در این بخش پیدا نشد</p>
        <p class="text-[11px] text-[#93a3a5]">روی دکمه «+ یادداشت جدید» بزن تا ایده یا متن جدیدی ثبت کنی.</p>
      </div>
    `;
    return;
  }

  const privacyClass = state.privacyBlur ? 'privacy-blur-text' : '';
  listEl.innerHTML = entries
    .map((note) => {
      const tagMeta = NOTE_TAGS[note.tag] || NOTE_TAGS.general;
      return `
        <article
          data-nb-card-id="${escapeHtml(note.id)}"
          class="notebook-entry-card ${note.pinned ? 'is-pinned' : ''} p-3.5 flex flex-col gap-2 cursor-pointer"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${tagMeta.badgeClass}">
                  ${tagMeta.emoji} ${tagMeta.label}
                </span>
                ${
                  note.pinned
                    ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#7fd5d8]/20 text-[#7fd5d8]">📌 سنجاق‌شده</span>'
                    : ''
                }
                <span class="text-[10px] text-[#93a3a5]">${formatJalaliDateTime(note.updatedAt || note.createdAt)}</span>
              </div>
              ${
                note.title
                  ? `<h4 dir="auto" class="text-sm font-extrabold text-white mt-1.5 ${privacyClass}">${escapeHtml(note.title)}</h4>`
                  : ''
              }
            </div>

            <div class="flex items-center gap-1 shrink-0">
              <button
                type="button"
                data-nb-pin="${escapeHtml(note.id)}"
                title="سنجاق کردن"
                class="spring-btn icon-circle-btn w-7 h-7 rounded-full ${
                  note.pinned ? 'bg-[#7fd5d8] text-[#0b1617]' : 'bg-white/10 text-slate-300'
                } cursor-pointer"
              >
                <span class="text-xs pointer-events-none">📌</span>
              </button>
              <button
                type="button"
                data-nb-copy="${escapeHtml(note.id)}"
                title="کپی متن"
                class="spring-btn icon-circle-btn w-7 h-7 rounded-full bg-white/10 text-slate-300 cursor-pointer"
              >
                <span class="text-xs pointer-events-none">📋</span>
              </button>
              <button
                type="button"
                data-nb-del="${escapeHtml(note.id)}"
                title="حذف یادداشت"
                class="spring-btn icon-circle-btn w-7 h-7 rounded-full bg-rose-500/15 text-rose-300 cursor-pointer"
              >
                <span class="text-xs pointer-events-none">🗑️</span>
              </button>
            </div>
          </div>

          ${
            note.text
              ? `<p dir="auto" class="text-xs text-slate-200 leading-relaxed whitespace-pre-line line-clamp-4 ${privacyClass}">${escapeHtml(
                  note.text
                )}</p>`
              : ''
          }
        </article>
      `;
    })
    .join('');

  listEl.querySelectorAll('[data-nb-pin]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const note = state.quickNotes.find((n) => n.id === btn.dataset.nbPin);
      if (!note) return;
      note.pinned = !note.pinned;
      saveState();
      renderQuickNotes();
      renderNotebookModalList();
      playTactileSound('pop');
    });
  });

  listEl.querySelectorAll('[data-nb-copy]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyNotebookEntryText(btn.dataset.nbCopy);
    });
  });

  listEl.querySelectorAll('[data-nb-del]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteQuickNote(btn.dataset.nbDel);
    });
  });

  listEl.querySelectorAll('[data-nb-card-id]').forEach((card) => {
    card.addEventListener('click', () => {
      openNoteEditorModal(card.dataset.nbCardId);
    });
  });
}

function openNotebookModal() {
  renderNotebookModalList();
  openModal('notebook-modal');
  requestAnimationFrame(() => {
    syncDynamicPillIndicator({
      barId: 'notebook-filter-pill-bar',
      indicatorId: 'notebook-filter-indicator',
      blobId: 'notebook-filter-indicator-blob',
      btnSelector: '.notebook-filter-chip',
      activeValue: state.notebookFilter,
      dataAttr: 'noteFilter',
      animateStretch: false,
      fromScrub: true,
    });
  });
}

function updateNoteEditorControlsUI() {
  document.querySelectorAll('.note-tag-choice-btn').forEach((btn) => {
    const active = btn.dataset.editorTag === state.draftNoteTag;
    btn.classList.toggle('bg-[#7fd5d8]', active);
    btn.classList.toggle('text-[#0b1617]', active);
    btn.classList.toggle('font-bold', active);
    btn.classList.toggle('bg-white/[0.06]', !active);
    btn.classList.toggle('border-white/10', !active);
    btn.classList.toggle('text-slate-300', !active);
  });

  const pinBtn = document.getElementById('note-editor-pin-btn');
  if (pinBtn) {
    pinBtn.classList.toggle('bg-[#7fd5d8]', state.draftNotePinned);
    pinBtn.classList.toggle('text-[#0b1617]', state.draftNotePinned);
    pinBtn.classList.toggle('border-[#7fd5d8]', state.draftNotePinned);
    pinBtn.classList.toggle('bg-white/10', !state.draftNotePinned);
    pinBtn.classList.toggle('text-slate-300', !state.draftNotePinned);
  }

  const titleLen = document.getElementById('note-editor-title-input')?.value.length || 0;
  const bodyLen = document.getElementById('note-editor-body-input')?.value.length || 0;
  const charCountEl = document.getElementById('note-editor-char-count');
  if (charCountEl) {
    charCountEl.textContent = `${toPersianDigits(titleLen + bodyLen)} کاراکتر`;
  }
}

function openNoteEditorModal(noteId = null) {
  const existing = noteId ? state.quickNotes.find((n) => n.id === noteId) : null;
  state.editingNoteId = existing ? existing.id : null;
  state.draftNoteTag = existing ? existing.tag || 'general' : 'general';
  state.draftNotePinned = existing ? Boolean(existing.pinned) : false;

  const headingEl = document.getElementById('note-editor-heading');
  const dateBadgeEl = document.getElementById('note-editor-date-badge');
  const titleInput = document.getElementById('note-editor-title-input');
  const bodyInput = document.getElementById('note-editor-body-input');
  const extraActions = document.getElementById('note-editor-extra-actions');

  if (headingEl) headingEl.textContent = existing ? 'ویرایش یادداشت' : 'یادداشت جدید';
  if (dateBadgeEl) {
    dateBadgeEl.textContent = existing ? formatJalaliDateTime(existing.updatedAt || existing.createdAt) : formatJalaliToday();
  }
  if (titleInput) titleInput.value = existing ? existing.title || '' : '';
  if (bodyInput) bodyInput.value = existing ? existing.text || '' : '';
  if (extraActions) {
    extraActions.classList.toggle('hidden', !existing);
    extraActions.classList.toggle('grid', Boolean(existing));
  }

  updateNoteEditorControlsUI();
  openModal('note-editor-modal');
}

function addQuickNote(rawText) {
  const clean = String(rawText || '').trim();
  if (!clean) return;
  const now = Date.now();
  state.quickNotes.unshift({
    id: `note_${now}_${Math.random().toString(36).slice(2, 6)}`,
    title: '',
    text: clean,
    tag: 'general',
    pinned: false,
    createdAt: now,
    updatedAt: now,
  });
  saveState();
  renderQuickNotes();
  renderNotebookModalList();
  playTactileSound('complete');
  triggerIslandToast('📓', 'یادداشت ثبت شد');
}

function deleteQuickNote(noteId) {
  const idx = state.quickNotes.findIndex((n) => n.id === noteId);
  if (idx === -1) return;
  state.noteUndoSnapshot = JSON.parse(JSON.stringify(state.quickNotes));
  state.quickNotes.splice(idx, 1);
  saveState();
  renderQuickNotes();
  renderNotebookModalList();
  playTactileSound('delete');

  triggerIslandToast('🗑️', 'یادداشت حذف شد', {
    duration: 4000,
    actionLabel: 'بازگردانی',
    onAction: () => {
      if (!state.noteUndoSnapshot) return;
      state.quickNotes = state.noteUndoSnapshot;
      state.noteUndoSnapshot = null;
      saveState();
      renderQuickNotes();
      renderNotebookModalList();
      playTactileSound('complete');
      triggerIslandToast('↩️', 'یادداشت بازگردانده شد');
    },
  });
}

function copyNotebookEntryText(noteId) {
  const note = state.quickNotes.find((n) => n.id === noteId);
  if (!note) return;
  const fullText = [note.title, note.text].filter(Boolean).join('\n');
  const onCopied = () => {
    playTactileSound('complete');
    triggerIslandToast('📋', 'متن یادداشت کپی شد');
  };
  const legacyCopy = () => {
    const ta = document.createElement('textarea');
    ta.value = fullText;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand('copy')) {
        onCopied();
      }
    } catch (e) {}
    ta.remove();
  };
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(fullText).then(onCopied).catch(legacyCopy);
  } else {
    legacyCopy();
  }
}

function renderDesktopInspector() {
  const task = state.tasks.find((t) => t.id === state.inspectedTaskId);
  if (!task) {
    closeDesktopInspector();
    return;
  }

  const titleInput = document.getElementById('inspector-title-input');
  const descInput = document.getElementById('inspector-desc-input');
  if (titleInput && document.activeElement !== titleInput) titleInput.value = task.title;
  if (descInput && document.activeElement !== descInput) descInput.value = task.description || '';

  const dayRow = document.getElementById('inspector-day-row');
  if (dayRow) {
    dayRow.classList.toggle('hidden', Boolean(task.isHabit));
    const currentDayView = getDayViewFromKey(task.scheduledDate || getTodayKey());
    dayRow.querySelectorAll('.inspector-day-btn').forEach((btn) => {
      const active = btn.dataset.inspectorDay === currentDayView;
      btn.classList.toggle('bg-[#7fd5d8]', active);
      btn.classList.toggle('text-[#0b1617]', active);
      btn.classList.toggle('border-[#7fd5d8]', active);
      btn.classList.toggle('bg-white/[0.06]', !active);
      btn.classList.toggle('border-white/10', !active);
      btn.classList.toggle('text-slate-300', !active);
    });
  }

  const catContainer = document.getElementById('inspector-categories');
  if (catContainer) {
    catContainer.innerHTML = getAllFolders()
      .map((folder) => {
        const active = task.category === folder.name;
        return `
          <button
            type="button"
            data-inspector-cat="${escapeHtml(folder.name)}"
            class="spring-btn text-[11px] px-2.5 py-1 rounded-full border cursor-pointer ${
              active
                ? 'bg-[#7fd5d8] text-[#0b1617] border-[#7fd5d8] font-bold'
                : 'bg-white/[0.06] border-white/10 text-slate-300'
            }"
          >
            ${escapeHtml(folder.emoji)} ${escapeHtml(folder.name)}
          </button>
        `;
      })
      .join('');

    catContainer.querySelectorAll('[data-inspector-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        task.category = btn.dataset.inspectorCat;
        saveState();
        renderDesktopInspector();
        renderTasks();
        playTactileSound('pop');
      });
    });
  }

  const urgentBtn = document.getElementById('inspector-urgent-btn');
  if (urgentBtn) {
    urgentBtn.classList.toggle('bg-amber-500/20', task.urgent);
    urgentBtn.classList.toggle('border-amber-400/45', task.urgent);
    urgentBtn.classList.toggle('text-amber-300', task.urgent);
  }

  const habitBtn = document.getElementById('inspector-habit-btn');
  if (habitBtn) {
    habitBtn.classList.toggle('bg-indigo-500/20', task.isHabit);
    habitBtn.classList.toggle('border-indigo-400/45', task.isHabit);
    habitBtn.classList.toggle('text-indigo-300', task.isHabit);
  }

  const subs = Array.isArray(task.subtasks) ? task.subtasks : [];
  const counterEl = document.getElementById('inspector-subtasks-counter');
  const listEl = document.getElementById('inspector-subtasks-list');
  if (counterEl) {
    const doneCount = subs.filter((s) => s.completed).length;
    counterEl.textContent = `${toPersianDigits(doneCount)} از ${toPersianDigits(subs.length)} مورد`;
  }

  if (listEl) {
    if (subs.length === 0) {
      listEl.innerHTML = `<p class="text-[11px] text-[#7d8e90] text-center py-2">هنوز زیرکاری ثبت نشده است</p>`;
    } else {
      listEl.innerHTML = subs
        .map(
          (sub) => `
          <div class="flex items-center justify-between gap-2 rounded-2xl bg-white/[0.04] border border-white/[0.07] px-3 py-2">
            <button type="button" data-inspector-sub-toggle="${sub.id}" class="flex items-center gap-2 min-w-0 flex-1 text-right cursor-pointer">
              <span class="subtask-check ${sub.completed ? 'checked' : ''}">
                ${sub.completed ? '<svg class="w-3 h-3 text-[#0b1617]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path class="check-stroke-anim" stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>' : ''}
              </span>
              <span dir="auto" class="text-xs truncate ${sub.completed ? 'line-through text-[#7d8e90]' : 'text-white'}">${escapeHtml(sub.title)}</span>
            </button>
            <button type="button" data-inspector-sub-del="${sub.id}" aria-label="حذف زیرکار" class="spring-btn icon-circle-btn w-6 h-6 rounded-full bg-white/10 text-slate-300 shrink-0 cursor-pointer">
              <svg width="12" height="12" class="w-3 h-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        `
        )
        .join('');

      listEl.querySelectorAll('[data-inspector-sub-toggle]').forEach((btn) => {
        btn.addEventListener('click', () => toggleSubtask(task.id, btn.dataset.inspectorSubToggle, false, 'today'));
      });

      listEl.querySelectorAll('[data-inspector-sub-del]').forEach((btn) => {
        btn.addEventListener('click', () => {
          task.subtasks = task.subtasks.filter((s) => s.id !== btn.dataset.inspectorSubDel);
          saveState();
          renderDesktopInspector();
          renderTasks();
          playTactileSound('delete');
        });
      });
    }
  }
}

function analyzeTaskSmartDimensions(task) {
  const subTexts = Array.isArray(task?.subtasks) ? task.subtasks.map((s) => s.title || '').join(' ') : '';
  const rawCorpus = `${task?.title || ''} ${task?.description || ''} ${subTexts} ${task?.category || ''}`.toLowerCase();

  const weights = { mind: 0, efficiency: 0, discipline: 0, body: 0 };

  const mindKeywords = [
    'کتاب', 'مطالعه', 'یادگیری', 'آموزش', 'درس', 'زبان', 'مقاله', 'پادکست', 'مدیتیشن',
    'مراقبه', 'ذهن', 'تمرکز', 'تحقیق', 'جزوه', 'دوره', 'کلاس', 'دانشگاه', 'نوشتن', 'فکر',
    'خواندن', 'book', 'read', 'study', 'learn', 'meditat', 'mind', 'course',
  ];
  const efficiencyKeywords = [
    'کار', 'پروژه', 'گزارش', 'جلسه', 'برنامه', 'کد', 'سایت', 'طراحی', 'ایمیل', 'فروش',
    'مشتری', 'ارائه', 'توسعه', 'مدیریت', 'مالی', 'فاکتور', 'وظیفه', 'تحویل', 'سفارش',
    'work', 'project', 'task', 'code', 'design', 'report', 'meeting', 'plan',
  ];
  const disciplineKeywords = [
    'عادت', 'نظم', 'روتین', 'سحرخیزی', 'بیدار', 'مرتب', 'پاکسازی', 'برنامه‌ریزی', 'چک‌لیست',
    'روزانه', 'هفتگی', 'پیگیری', 'مرور', 'قانون', 'تعهد', 'مسئولیت', 'پس‌انداز',
    'habit', 'routine', 'daily', 'clean', 'review', 'discipline', 'track',
  ];
  const bodyKeywords = [
    'ورزش', 'تمرین', 'باشگاه', 'شنا', 'دویدن', 'دوی', 'پیاده‌روی', 'آب', 'تغذیه', 'رژیم',
    'خواب', 'کششی', 'یوگا', 'فیتنس', 'بدنسازی', 'سلامت', 'سلامتی', 'پزشک', 'دندان', 'ویتامین',
    'میوه', 'پلانک', 'کوهنوردی', 'دوچرخه', 'gym', 'workout', 'run', 'walk', 'water', 'sleep', 'health',
  ];

  mindKeywords.forEach((kw) => {
    if (rawCorpus.includes(kw)) weights.mind += 2.2;
  });
  efficiencyKeywords.forEach((kw) => {
    if (rawCorpus.includes(kw)) weights.efficiency += 2.2;
  });
  disciplineKeywords.forEach((kw) => {
    if (rawCorpus.includes(kw)) weights.discipline += 2.2;
  });
  bodyKeywords.forEach((kw) => {
    if (rawCorpus.includes(kw)) weights.body += 2.2;
  });

  const cat = task?.category || '';
  if (cat === 'یادگیری') weights.mind += 3.5;
  else if (cat === 'کار') weights.efficiency += 3.5;
  else if (cat === 'سلامتی') weights.body += 3.5;
  else if (cat === 'شخصی') weights.discipline += 2.0;

  if (task?.isHabit) weights.discipline += 3.0;
  if (task?.urgent) weights.efficiency += 1.5;
  if (Array.isArray(task?.subtasks) && task.subtasks.length >= 2) {
    weights.discipline += 1.4;
  }

  if (weights.mind === 0 && weights.efficiency === 0 && weights.discipline === 0 && weights.body === 0) {
    weights.discipline = 2.0;
    weights.efficiency = 1.2;
  }

  return weights;
}

function computeSmartRadarProfile() {
  const totals = { mind: 0, efficiency: 0, discipline: 0, body: 0 };
  const matchedByAxis = { mind: [], efficiency: [], discipline: [], body: [] };

  const todayTasks = getTasksForDayView('today');
  todayTasks.forEach((task) => {
    const w = analyzeTaskSmartDimensions(task);
    const subs = Array.isArray(task.subtasks) ? task.subtasks : [];
    const subRatio = subs.length > 0 ? subs.filter((s) => s.completed).length / subs.length : 0;
    const progressMultiplier = task.completed ? 1.45 : 0.65 + subRatio * 0.6;

    Object.keys(totals).forEach((axisKey) => {
      const contribution = w[axisKey] * progressMultiplier;
      totals[axisKey] += contribution;
      if (w[axisKey] >= 1.8) {
        matchedByAxis[axisKey].push({
          id: task.id,
          title: task.title,
          completed: task.completed,
          weight: w[axisKey],
        });
      }
    });
  });

  const streakBonus = Math.min(18, (state.streak.count || 1) * 2.5);
  totals.discipline += streakBonus * 0.25;

  const maxVal = Math.max(8, totals.mind, totals.efficiency, totals.discipline, totals.body);
  const scores = {
    mind: Math.min(98, Math.max(16, Math.round((totals.mind / maxVal) * 86 + (totals.mind > 0 ? 10 : 0)))),
    efficiency: Math.min(98, Math.max(16, Math.round((totals.efficiency / maxVal) * 86 + (totals.efficiency > 0 ? 10 : 0)))),
    discipline: Math.min(98, Math.max(16, Math.round((totals.discipline / maxVal) * 86 + (totals.discipline > 0 ? 10 : 0)))),
    body: Math.min(98, Math.max(16, Math.round((totals.body / maxVal) * 86 + (totals.body > 0 ? 10 : 0)))),
  };

  const orderedAxes = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topAxisKey = orderedAxes[0][0];
  const spread = orderedAxes[0][1] - orderedAxes[3][1];

  return { scores, matchedByAxis, topAxisKey, spread, todayCount: todayTasks.length };
}

function animateRadarPolygon(targetScores) {
  if (state.radarAnimFrame) {
    cancelAnimationFrame(state.radarAnimFrame);
    state.radarAnimFrame = null;
  }

  const startScores = { ...state.radarCurrentScores };
  const startTime = performance.now();
  const duration = state.detectedHz <= 60 ? 320 : 400;
  const cx = 170;
  const cy = 135;
  const maxRadius = 84;

  function applyGeometry(s) {
    const topY = cy - (s.mind / 100) * maxRadius;
    const rightX = cx + (s.efficiency / 100) * maxRadius;
    const bottomY = cy + (s.discipline / 100) * maxRadius;
    const leftX = cx - (s.body / 100) * maxRadius;

    const poly = document.getElementById('smart-radar-polygon');
    if (poly) {
      poly.setAttribute(
        'points',
        `${cx.toFixed(1)},${topY.toFixed(1)} ${rightX.toFixed(1)},${cy} ${cx.toFixed(1)},${bottomY.toFixed(1)} ${leftX.toFixed(1)},${cy}`
      );
    }

    const setCircle = (id, x, y) => {
      const el = document.getElementById(id);
      if (el) {
        el.setAttribute('cx', x.toFixed(1));
        el.setAttribute('cy', y.toFixed(1));
      }
    };

    setCircle('radar-node-mind', cx, topY);
    setCircle('radar-halo-mind', cx, topY);
    setCircle('radar-node-efficiency', rightX, cy);
    setCircle('radar-halo-efficiency', rightX, cy);
    setCircle('radar-node-discipline', cx, bottomY);
    setCircle('radar-halo-discipline', cx, bottomY);
    setCircle('radar-node-body', leftX, cy);
    setCircle('radar-halo-body', leftX, cy);
  }

  function step(now) {
    const elapsed = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - elapsed, 3);
    const interpolated = {
      mind: startScores.mind + (targetScores.mind - startScores.mind) * eased,
      efficiency: startScores.efficiency + (targetScores.efficiency - startScores.efficiency) * eased,
      discipline: startScores.discipline + (targetScores.discipline - startScores.discipline) * eased,
      body: startScores.body + (targetScores.body - startScores.body) * eased,
    };
    state.radarCurrentScores = interpolated;
    applyGeometry(interpolated);
    if (elapsed < 1) {
      state.radarAnimFrame = requestAnimationFrame(step);
    }
  }

  state.radarAnimFrame = requestAnimationFrame(step);
}

function renderSmartRadarChart() {
  const { scores, matchedByAxis, topAxisKey, spread, todayCount } = computeSmartRadarProfile();

  ['mind', 'efficiency', 'discipline', 'body'].forEach((axisKey) => {
    const pctEl = document.getElementById(`radar-pct-${axisKey}`);
    if (pctEl) pctEl.textContent = `${scores[axisKey]}%`;
  });

  document.querySelectorAll('.radar-axis-pill').forEach((btn) => {
    btn.classList.toggle('is-selected', btn.dataset.radarAxis === state.selectedRadarAxis);
  });

  const badgeEl = document.getElementById('radar-dominant-badge');
  if (badgeEl) {
    if (todayCount === 0) {
      badgeEl.textContent = '✨ آماده تحلیل';
    } else if (spread <= 14) {
      badgeEl.textContent = '⚖️ رشد متعادل';
    } else {
      const topInfo = RADAR_AXES[topAxisKey];
      badgeEl.textContent = `${topInfo.emoji} تمرکز بر ${topInfo.label}`;
    }
  }

  const titleEl = document.getElementById('radar-insight-title');
  const descEl = document.getElementById('radar-insight-desc');
  const tasksEl = document.getElementById('radar-matched-tasks');
  const resetBtn = document.getElementById('radar-reset-axis-btn');

  if (state.selectedRadarAxis !== 'all' && RADAR_AXES[state.selectedRadarAxis]) {
    const axis = RADAR_AXES[state.selectedRadarAxis];
    const list = matchedByAxis[axis.key] || [];
    if (titleEl) {
      titleEl.textContent = `${axis.emoji} بُعد ${axis.label} (${toPersianDigits(scores[axis.key])}٪)`;
    }
    if (descEl) {
      descEl.textContent =
        list.length > 0
          ? `${axis.tip} — ${toPersianDigits(list.length)} کار در این محور شناسایی شد:`
          : `${axis.tip}. هنوز کاری مرتبط با این بُعد برای امروز ثبت نکرده‌ای.`;
    }
    if (resetBtn) resetBtn.classList.remove('hidden');
    if (tasksEl) {
      tasksEl.innerHTML = list
        .map(
          (item) => `
          <span class="text-[11px] px-2.5 py-1 rounded-full border ${
            item.completed
              ? 'bg-[#7fd5d8]/20 border-[#7fd5d8]/40 text-[#7fd5d8] font-bold'
              : 'bg-white/[0.06] border-white/10 text-slate-300'
          }">
            ${item.completed ? '✓ ' : '• '}${escapeHtml(item.title)}
          </span>
        `
        )
        .join('');
    }
  } else {
    const topInfo = RADAR_AXES[topAxisKey];
    if (titleEl) titleEl.textContent = 'تحلیل هوشمند الگوریتم';
    if (descEl) {
      descEl.textContent =
        todayCount === 0
          ? 'با ثبت و انجام کارها، الگوریتم هوشمند به‌طور خودکار سهم هر کار را در رشد ذهن، کارایی، انضباط و جسم محاسبه می‌کند.'
          : `بیشترین رشد فعلی شما در بُعد «${topInfo.label} ${topInfo.emoji}» ثبت شده است. روی هر محور نمودار بزن تا کارهای مرتبط با آن را ببینی.`;
    }
    if (resetBtn) resetBtn.classList.add('hidden');
    if (tasksEl) {
      tasksEl.innerHTML = ['mind', 'efficiency', 'discipline', 'body']
        .map((k) => {
          const ax = RADAR_AXES[k];
          return `
            <button type="button" data-radar-quick="${k}" class="spring-btn text-[11px] px-2.5 py-1 rounded-full bg-white/[0.06] hover:bg-white/15 border border-white/10 text-slate-200 cursor-pointer">
              ${ax.emoji} ${ax.label}: <strong class="text-[#7fd5d8]">${toPersianDigits(scores[k])}٪</strong>
            </button>
          `;
        })
        .join('');

      tasksEl.querySelectorAll('[data-radar-quick]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.selectedRadarAxis = btn.dataset.radarQuick;
          renderSmartRadarChart();
          playTactileSound('pop');
        });
      });
    }
  }

  animateRadarPolygon(scores);
}

function renderSecondaryTabViews() {
  const todayTasks = getTasksForDayView('today');
  const done = todayTasks.filter((t) => t.completed).length;
  const active = todayTasks.length - done;

  const doneEl = document.getElementById('stat-done-count');
  const activeEl = document.getElementById('stat-active-count');
  const streakEl = document.getElementById('stat-streak-count');
  if (doneEl) doneEl.textContent = toPersianDigits(done);
  if (activeEl) activeEl.textContent = toPersianDigits(active);
  if (streakEl) streakEl.textContent = `${toPersianDigits(state.streak.count || 1)} روز`;

  renderSmartRadarChart();

  const daysMeta = getRecent7DaysMeta();
  const maxCount = Math.max(1, ...daysMeta.map((d) => d.count));
  const weekTotal = daysMeta.reduce((sum, d) => sum + d.count, 0);
  const weekSummaryEl = document.getElementById('weekly-chart-summary');
  const weekBarsEl = document.getElementById('weekly-chart-bars');

  if (weekSummaryEl) {
    weekSummaryEl.textContent = `مجموع ${toPersianDigits(weekTotal)} کار تکمیل‌شده در هفته اخیر`;
  }
  if (weekBarsEl) {
    weekBarsEl.innerHTML = daysMeta
      .map((day) => {
        const barHeightPct = day.count === 0 ? 10 : Math.max(18, Math.round((day.count / maxCount) * 100));
        return `
          <div class="flex flex-col items-center justify-end h-full gap-1.5">
            <span class="text-[10px] font-bold ${day.isToday ? 'text-[#7fd5d8]' : 'text-[#93a3a5]'}">${toPersianDigits(day.count)}</span>
            <div class="w-full max-w-[26px] h-20 rounded-full bg-white/[0.06] flex items-end p-0.5 overflow-hidden">
              <div class="w-full rounded-full ${day.count > 0 ? 'chart-bar-fill' : 'bg-white/10'}" style="height: ${barHeightPct}%"></div>
            </div>
            <span class="text-[10px] font-bold ${day.isToday ? 'text-[#7fd5d8]' : 'text-[#93a3a5]'}">${day.label}</span>
          </div>
        `;
      })
      .join('');
  }

  const catList = document.getElementById('category-breakdown-list');
  if (catList) {
    catList.innerHTML = getAllFolders()
      .map((folder) => {
        const catTasks = todayTasks.filter((t) => t.category === folder.name);
        const catDone = catTasks.filter((t) => t.completed).length;
        const pct = catTasks.length === 0 ? 0 : Math.round((catDone / catTasks.length) * 100);
        return `
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between text-xs">
              <span class="font-bold text-white">${escapeHtml(folder.emoji)} ${escapeHtml(folder.name)}</span>
              <span class="text-[#93a3a5]">${toPersianDigits(catDone)} از ${toPersianDigits(catTasks.length)} (${pct}%)</span>
            </div>
            <div class="liquid-bar-track h-2 w-full">
              <div class="liquid-bar-fill" style="transform: scaleX(${(pct / 100).toFixed(4)})"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  const tgName = document.getElementById('tg-profile-name-display');
  const tgBio = document.getElementById('tg-profile-bio-display');
  if (tgName) tgName.textContent = state.profile.name || 'دوست من';
  if (tgBio) tgBio.textContent = state.profile.bio || 'تمرکز عمیق و پیشرفت روزانه';
  renderAvatarInto(document.getElementById('tg-profile-avatar-display'));

  const goalVal = document.getElementById('tg-val-daily-goal');
  const durVal = document.getElementById('tg-val-focus-duration');
  const defCatVal = document.getElementById('tg-val-default-category');
  const foldersCountVal = document.getElementById('tg-val-folders-count');
  const storageVal = document.getElementById('tg-val-storage-size');

  if (goalVal) goalVal.textContent = `${toPersianDigits(state.dailyGoal)} کار`;
  if (durVal) durVal.textContent = `${state.focusDurationMinutes}m`;
  if (defCatVal) defCatVal.textContent = getFolderDisplay(state.selectedCategory);
  if (foldersCountVal) foldersCountVal.textContent = `${toPersianDigits(getAllFolders().length)} پوشه ‹`;

  setTgSwitchState(document.getElementById('tg-switch-autosort'), state.autoSortCompleted, false);
  setTgSwitchState(document.getElementById('tg-switch-privacy'), state.privacyBlur, false);
  setTgSwitchState(document.getElementById('tg-switch-sound'), state.soundEnabled, false);

  updateNotificationSettingsUI();
  updateGpuSettingsLabels();

  if (storageVal) {
    const bytes = new Blob([memoryFallbackStorage || '']).size;
    const kb = Math.max(1, Math.round(bytes / 1024));
    storageVal.textContent = `${kb} KB ‹`;
  }
}

function triggerBlobStretch(blobEl, stepDistance = 1) {
  if (!blobEl) return;
  const dist = Math.max(1, Math.min(3, Number(stepDistance) || 1));
  const stretchPrimary = dist === 1 ? '1.16' : dist === 2 ? '1.30' : '1.42';
  const squashSecondary = dist === 1 ? '0.92' : dist === 2 ? '0.86' : '0.83';
  blobEl.style.setProperty('--stretch-x', stretchPrimary);
  blobEl.style.setProperty('--squash-y', squashSecondary);
  blobEl.style.setProperty('--stretch-y', stretchPrimary);
  blobEl.style.setProperty('--squash-x', squashSecondary);
  blobEl.classList.remove('is-stretching');
  void blobEl.offsetWidth;
  blobEl.classList.add('is-stretching');
}

function setTaskFilter(nextFilter, options = {}) {
  const fromScrub = Boolean(options.fromScrub);
  const filterOrder = ['all', 'active', 'completed', 'urgent', 'habit'];
  const oldIdx = filterOrder.indexOf(state.filter);
  const newIdx = filterOrder.indexOf(nextFilter);
  state.filter = nextFilter;

  syncDynamicPillIndicator({
    barId: 'task-filter-pill-bar',
    indicatorId: 'task-filter-indicator',
    blobId: 'task-filter-indicator-blob',
    btnSelector: '.filter-chip',
    activeValue: nextFilter,
    dataAttr: 'filter',
    stepDistance: oldIdx >= 0 && newIdx >= 0 ? Math.abs(newIdx - oldIdx) : 0,
    animateStretch: !fromScrub && oldIdx !== newIdx,
    fromScrub,
  });

  renderTasks();
}

function handleSmartTabReTap(tabName) {
  if (tabName === 'tasks') {
    if (window.scrollY > 24) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      playTactileSound('pop');
      return;
    }
    if (state.selectedDayView !== 'today') {
      setSelectedDayView('today');
      return;
    }
    if (state.filter !== 'all' || state.folderFilter !== 'all' || state.searchQuery.trim()) {
      state.folderFilter = 'all';
      state.searchQuery = '';
      const searchInp = document.getElementById('search-tasks-input');
      const clearSearchBtn = document.getElementById('clear-search-btn');
      if (searchInp) searchInp.value = '';
      clearSearchBtn?.classList.add('hidden');
      clearSearchBtn?.classList.remove('flex');
      setTaskFilter('all', { fromScrub: false });
      renderFolderFilterChips();
      updateHeaderAndProgress();
      playTactileSound('pop');
      triggerIslandToast('✨', 'نمایش همه کارهای امروز');
      return;
    }
  } else if (tabName === 'settings') {
    const sub = document.getElementById('tg-appearance-subpage');
    if (sub && !sub.classList.contains('hidden')) {
      sub.classList.add('hidden');
      sub.classList.remove('flex');
      document.getElementById('tg-settings-main')?.classList.remove('hidden');
      if (typeof syncBackLayerCallback === 'function') syncBackLayerCallback();
      playTactileSound('pop');
      return;
    }
  }

  if (window.scrollY > 24) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    playTactileSound('pop');
  }
}

function switchTab(tabName, options = {}) {
  const fromScrub = Boolean(options.fromScrub);
  const tabOrder = ['tasks', 'focus', 'stats', 'settings'];
  const oldIdx = Math.max(0, tabOrder.indexOf(state.activeTab));
  const newIdx = Math.max(0, tabOrder.indexOf(tabName));
  const stepDelta = newIdx - oldIdx;
  const isSameTab = stepDelta === 0;

  if (isSameTab) {
    if (!fromScrub) {
      triggerBlobStretch(document.getElementById('tg-nav-indicator-blob'), 1);
      triggerBlobStretch(document.getElementById('rail-nav-indicator-blob'), 1);
      handleSmartTabReTap(tabName);
    }
    return;
  }

  state.activeTab = tabName;

  /* نمایش آنی و کاملاً شارپ محتوای تب جدید در ۰ میلی‌ثانیه بدون محو شدن یا چشمک */
  document.querySelectorAll('.tab-view').forEach((view) => {
    const isTarget = view.id === `tab-view-${tabName}`;
    view.classList.toggle('hidden', !isTarget);
    view.classList.toggle('is-tab-hidden', !isTarget);
  });

  document.querySelectorAll('.tg-nav-btn, .rail-nav-btn').forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('is-active', isActive);
    btn.classList.remove('is-bouncing');
    if (isActive && !fromScrub) {
      void btn.offsetWidth;
      btn.classList.add('is-bouncing');
    }
  });

  const indicator = document.getElementById('tg-nav-indicator');
  if (indicator && !fromScrub) {
    indicator.style.transform = `translate3d(${-newIdx * 100}%, 0, 0)`;
  }

  if (!fromScrub) {
    const dist = Math.abs(stepDelta);
    triggerBlobStretch(document.getElementById('tg-nav-indicator-blob'), dist);
    triggerBlobStretch(document.getElementById('rail-nav-indicator-blob'), dist);
    playTactileSound('nav-step', stepDelta);
    triggerHaptic(8);
  }

  if (tabName === 'tasks') {
    requestAnimationFrame(() => {
      syncDynamicPillIndicator({
        barId: 'task-filter-pill-bar',
        indicatorId: 'task-filter-indicator',
        blobId: 'task-filter-indicator-blob',
        btnSelector: '.filter-chip',
        activeValue: state.filter,
        dataAttr: 'filter',
        animateStretch: false,
        fromScrub: true,
      });
    });
  }

  if (tabName === 'settings') {
    document.getElementById('tg-appearance-subpage')?.classList.add('hidden');
    document.getElementById('tg-appearance-subpage')?.classList.remove('flex');
    document.getElementById('tg-settings-main')?.classList.remove('hidden');
  }

  syncDesktopRailUI();
  if (typeof syncBackLayerCallback === 'function') {
    syncBackLayerCallback();
  }

  if (tabName === 'stats' || tabName === 'settings') {
    renderSecondaryTabViews();
  }
}

/* ==================== سر خوردن کپسول شیشه‌ای زیر انگشت (Interactive Finger Scrubbing) ==================== */
function setupLiquidBarScrubbing({ barEl, indicatorId, blobId, items, getCurrentIndex, onSelectIndex, direction = 'rtl', edgeInset = 4 }) {
  if (!barEl || !Array.isArray(items) || items.length < 2) return;

  let startX = 0;
  let startY = 0;
  let isScrubbing = false;
  let lastIdx = 0;
  let suppressBarClick = false;
  let scrubRafPending = false;
  let pendingTranslatePct = 0;
  const isLtr = direction === 'ltr';

  const indicatorEl = () => document.getElementById(indicatorId);
  const blobEl = () => document.getElementById(blobId);

  const applyScrubFrame = () => {
    scrubRafPending = false;
    if (!isScrubbing) return;
    const ind = indicatorEl();
    if (ind) {
      ind.style.transform = `translate3d(${pendingTranslatePct.toFixed(2)}%, 0, 0)`;
    }
  };

  barEl.addEventListener(
    'click',
    (e) => {
      if (suppressBarClick) {
        e.stopImmediatePropagation();
        e.preventDefault();
        suppressBarClick = false;
      }
    },
    true
  );

  barEl.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      isScrubbing = false;
      lastIdx = Math.max(0, getCurrentIndex());
    },
    { passive: true }
  );

  barEl.addEventListener(
    'touchmove',
    (e) => {
      if (!startX || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (!isScrubbing) {
        if (Math.abs(dy) > Math.abs(dx) * 1.25 && Math.abs(dy) > 8) {
          startX = 0;
          return;
        }
        if (Math.abs(dx) < 8) return;
        isScrubbing = true;
        suppressBarClick = true;
        indicatorEl()?.classList.add('is-scrubbing');
        blobEl()?.classList.add('is-scrubbing-blob');
      }

      if (e.cancelable) e.preventDefault();

      const rect = barEl.getBoundingClientRect();
      const usableWidth = Math.max(1, rect.width - edgeInset * 2);
      const relOffset = isLtr ? t.clientX - rect.left - edgeInset : rect.right - edgeInset - t.clientX;
      const rawSlotPos = (relOffset / usableWidth) * items.length - 0.5;

      const minSlot = 0;
      const maxSlot = items.length - 1;
      let dampedSlot = rawSlotPos;
      if (rawSlotPos < minSlot) {
        dampedSlot = minSlot + computeIosRubberBand(rawSlotPos - minSlot, 0.35);
      } else if (rawSlotPos > maxSlot) {
        dampedSlot = maxSlot + computeIosRubberBand(rawSlotPos - maxSlot, 0.35);
      }

      pendingTranslatePct = isLtr ? dampedSlot * 100 : -dampedSlot * 100;
      if (!scrubRafPending) {
        scrubRafPending = true;
        requestAnimationFrame(applyScrubFrame);
      }

      const clampedRatio = Math.max(0, Math.min(0.9999, relOffset / usableWidth));
      const hoveredIdx = Math.floor(clampedRatio * items.length);

      if (hoveredIdx !== lastIdx) {
        const stepDir = hoveredIdx - lastIdx;
        lastIdx = hoveredIdx;
        onSelectIndex(hoveredIdx, true);
        playTactileSound('scrub-tick', stepDir);
        triggerHaptic(6);
      }
    },
    { passive: false }
  );

  const finishScrub = () => {
    startX = 0;
    if (!isScrubbing) return;
    isScrubbing = false;
    scrubRafPending = false;

    const ind = indicatorEl();
    const blb = blobEl();
    ind?.classList.remove('is-scrubbing');
    blb?.classList.remove('is-scrubbing-blob');

    if (ind) {
      ind.style.transform = `translate3d(${(isLtr ? lastIdx : -lastIdx) * 100}%, 0, 0)`;
    }
    triggerBlobStretch(blb, 1);

    setTimeout(() => {
      suppressBarClick = false;
    }, 90);
  };

  barEl.addEventListener('touchend', finishScrub);
  barEl.addEventListener('touchcancel', finishScrub);
}

/* اسکرول انگشتی برای کپسول‌های با عرض متغیر (فیلتر کارها و فیلتر دفترچه یادداشت) */
function setupDynamicPillScrubbing({ barEl, indicatorId, blobId, btnSelector, dataAttr, getCurrentValue, onSelectValue }) {
  if (!barEl) return;

  let startX = 0;
  let startY = 0;
  let isScrubbing = false;
  let lastVal = '';
  let suppressBarClick = false;
  let scrubRafPending = false;
  let pendingX = 0;
  let pendingW = 0;

  const indicatorEl = () => document.getElementById(indicatorId);
  const blobEl = () => document.getElementById(blobId);

  const applyFrame = () => {
    scrubRafPending = false;
    if (!isScrubbing) return;
    const ind = indicatorEl();
    if (ind && pendingW > 0) {
      ind.style.width = `${pendingW}px`;
      ind.style.transform = `translate3d(${pendingX}px, 0, 0)`;
    }
  };

  barEl.addEventListener(
    'click',
    (e) => {
      if (suppressBarClick) {
        e.stopImmediatePropagation();
        e.preventDefault();
        suppressBarClick = false;
      }
    },
    true
  );

  barEl.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isScrubbing = false;
      lastVal = getCurrentValue();
    },
    { passive: true }
  );

  barEl.addEventListener(
    'touchmove',
    (e) => {
      if (!startX || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (!isScrubbing) {
        if (Math.abs(dy) > Math.abs(dx) * 1.25 && Math.abs(dy) > 8) {
          startX = 0;
          return;
        }
        if (Math.abs(dx) < 8) return;
        isScrubbing = true;
        suppressBarClick = true;
        indicatorEl()?.classList.add('is-scrubbing');
        blobEl()?.classList.add('is-scrubbing-blob');
      }

      if (e.cancelable) e.preventDefault();

      const buttons = Array.from(barEl.querySelectorAll(btnSelector));
      if (buttons.length === 0) return;

      let matchedBtn = null;
      let minDist = Infinity;
      buttons.forEach((btn) => {
        const rect = btn.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        const dist = Math.abs(t.clientX - center);
        if (dist < minDist) {
          minDist = dist;
          matchedBtn = btn;
        }
      });

      if (!matchedBtn) return;

      pendingX = matchedBtn.offsetLeft;
      pendingW = matchedBtn.offsetWidth;
      if (!scrubRafPending) {
        scrubRafPending = true;
        requestAnimationFrame(applyFrame);
      }

      const nextVal = matchedBtn.dataset[dataAttr];
      if (nextVal && nextVal !== lastVal) {
        const oldIdx = buttons.findIndex((b) => b.dataset[dataAttr] === lastVal);
        const newIdx = buttons.indexOf(matchedBtn);
        lastVal = nextVal;
        onSelectValue(nextVal, true);
        playTactileSound('scrub-tick', newIdx - oldIdx);
        triggerHaptic(6);
      }
    },
    { passive: false }
  );

  const finishScrub = () => {
    startX = 0;
    if (!isScrubbing) return;
    isScrubbing = false;
    scrubRafPending = false;

    const ind = indicatorEl();
    const blb = blobEl();
    ind?.classList.remove('is-scrubbing');
    blb?.classList.remove('is-scrubbing-blob');

    const activeBtn = Array.from(barEl.querySelectorAll(btnSelector)).find(
      (b) => b.dataset[dataAttr] === lastVal
    );
    if (ind && activeBtn && activeBtn.offsetWidth > 0) {
      ind.style.width = `${activeBtn.offsetWidth}px`;
      ind.style.transform = `translate3d(${activeBtn.offsetLeft}px, 0, 0)`;
    }
    triggerBlobStretch(blb, 1);

    setTimeout(() => {
      suppressBarClick = false;
    }, 90);
  };

  barEl.addEventListener('touchend', finishScrub);
  barEl.addEventListener('touchcancel', finishScrub);
}

const modalCloseTimers = new Map();

/* ایجاد عمق پس‌زمینه همگام با شیت (Telegram / iOS UISheetPresentation Depth Effect) */
function updateMainStageDepth(depthRatio, smoothTransition = true) {
  const mainStage = document.getElementById('app-main-stage');
  if (!mainStage) return;

  if (depthRatio <= 0.001) {
    mainStage.classList.remove('is-stage-settled-back');
    if (smoothTransition) {
      mainStage.classList.add('is-stage-animating', 'is-stage-restoring');
      mainStage.style.transform = '';
      setTimeout(() => {
        mainStage.classList.remove('is-stage-animating', 'is-stage-restoring');
      }, 480);
    } else {
      mainStage.classList.remove('is-stage-animating', 'is-stage-restoring');
      mainStage.style.transform = '';
    }
    return;
  }

  const clamped = Math.max(0, Math.min(1, depthRatio));
  const scale = 1 - clamped * 0.046;
  const translateY = clamped * 10;

  mainStage.classList.add('is-stage-animating');
  if (smoothTransition) {
    mainStage.style.transition = 'transform calc(0.46s * var(--motion-scale)) cubic-bezier(0.19, 1, 0.22, 1)';
  } else {
    mainStage.style.transition = 'none';
  }
  mainStage.style.transform = `translate3d(0, ${translateY.toFixed(1)}px, 0) scale3d(${scale.toFixed(4)}, ${scale.toFixed(4)}, 1)`;
}

function resetSheetInlineStyles(modalEl) {
  if (!modalEl) return;
  modalEl.style.opacity = '';
  modalEl.style.transition = '';
  const sheet = modalEl.querySelector('.sheet-animate');
  if (sheet) {
    sheet.style.transform = '';
    sheet.style.transition = '';
    sheet.style.opacity = '';
    sheet.style.animation = '';
  }
}

function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (modalCloseTimers.has(id)) {
    clearTimeout(modalCloseTimers.get(id));
    modalCloseTimers.delete(id);
  }
  resetSheetInlineStyles(el);
  el.classList.remove('hidden', 'is-closing');
  el.classList.add('flex');

  if (id !== 'task-composer-modal' && window.innerWidth < 1024) {
    updateMainStageDepth(0.65, true);
  }

  if (typeof syncBackLayerCallback === 'function') {
    syncBackLayerCallback();
  }
}

function closeModal(id, fromDrag = false) {
  const el = document.getElementById(id);
  if (!el || el.classList.contains('hidden') || el.classList.contains('is-closing')) return;

  const isMobileComposer = id === 'task-composer-modal' && window.innerWidth < 640 && composerShutterController;

  if (isMobileComposer && !fromDrag) {
    composerShutterController.animateClose();
  } else if (!fromDrag) {
    resetSheetInlineStyles(el);
  }

  el.classList.add('is-closing');

  const notebookOpen =
    id === 'note-editor-modal' &&
    !document.getElementById('notebook-modal')?.classList.contains('hidden');

  if (!isMobileComposer && !notebookOpen) {
    updateMainStageDepth(0, true);
  }

  if (typeof syncBackLayerCallback === 'function') {
    syncBackLayerCallback();
  }

  const closeDelay = isMobileComposer ? 410 : 340;
  const timer = setTimeout(() => {
    el.classList.add('hidden');
    el.classList.remove('flex', 'is-closing');
    resetSheetInlineStyles(el);
    if (id === 'task-composer-modal' && composerShutterController) {
      composerShutterController.resetState();
    }
    modalCloseTimers.delete(id);
  }, closeDelay);

  modalCloseTimers.set(id, timer);
}

/* ==================== موتور شیت تک‌لایه تمام‌GPU بخش «کار جدید» با میکرو-کشسانی مایع ==================== */
function initComposerShutterGesture() {
  const modal = document.getElementById('task-composer-modal');
  const sheet = document.getElementById('composer-shutter-sheet');
  const scrollBody = document.getElementById('composer-scroll-body');
  const leadingBtn = document.getElementById('composer-leading-btn');
  const grabberZone = document.getElementById('composer-grabber-zone');
  const unifiedHeader = document.getElementById('composer-unified-header');
  const formEl = document.getElementById('task-composer-form');
  if (!modal || !sheet || !scrollBody) return null;

  let isFullscreen = false;
  let startedInFullscreen = false;
  let currentY = 0;
  let currentScaleX = 1;
  let currentScaleY = 1;
  let restY = 240;
  let cachedVh = 0;
  let dragging = false;
  let suppressComposerTap = false;
  let startTouchY = 0;
  let startTouchX = 0;
  let startSheetY = 0;
  let startedOnDragZone = false;
  let touchSamples = [];
  let rafPending = false;
  let dragLocked = false;
  let settleTimer = null;

  const IOS_SILK_CURVE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const IOS_CLOSE_CURVE = 'cubic-bezier(0.32, 0.72, 0, 1)';
  const isMobileShutter = () => window.innerWidth < 640;

  const getViewportH = () => {
    const vv = window.visualViewport;
    return vv ? Math.round(vv.height) : window.innerHeight;
  };

  const clearSettleTimer = () => {
    if (settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
  };

  const readLiveTranslateY = () => {
    try {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(sheet).transform);
      if (Number.isFinite(matrix.m42)) return matrix.m42;
    } catch (e) {}
    return currentY;
  };

  const syncIslandVisibilityForFullscreen = (hideIsland) => {
    const islandEl = document.getElementById('dynamic-island');
    if (!islandEl) return;
    if (hideIsland && state.islandMode === 'expanded') {
      setIslandMode('idle', { skipMorph: true });
    }
    islandEl.classList.toggle('is-hidden-for-sheet', Boolean(hideIsland));
  };

  const setFullscreenState = (nextFs) => {
    if (isFullscreen === nextFs) {
      syncIslandVisibilityForFullscreen(nextFs);
      return;
    }
    isFullscreen = nextFs;
    sheet.classList.toggle('is-fullscreen', isFullscreen);
    syncIslandVisibilityForFullscreen(isFullscreen);
  };

  const computeHalfMetrics = () => {
    const vh = getViewportH();
    const grabH = grabberZone ? grabberZone.offsetHeight : 22;
    const headH = unifiedHeader ? unifiedHeader.offsetHeight : 56;
    const formH = formEl ? formEl.offsetHeight : 360;
    const bottomSafePad = 22;

    const totalContentH = grabH + headH + formH + bottomSafePad;
    const maxHalfH = Math.round(vh * 0.85);
    const visibleH = Math.min(maxHalfH, Math.max(260, totalContentH));
    const computedRestY = Math.max(54, vh - visibleH);
    const maxScrollBodyH = Math.max(160, visibleH - grabH - headH);

    return { vh, restY: computedRestY, maxScrollBodyH };
  };

  const computeAdaptiveDuration = (distPx, velY) => {
    const speed = Math.abs(velY);
    if (speed > 1400) return 440;
    if (speed > 700) return 500;
    return Math.min(600, Math.max(480, Math.round(460 + Math.abs(distPx) * 0.25)));
  };

  const snapToHalf = (initialVel = 0) => {
    if (!isMobileShutter()) return;
    clearSettleTimer();
    setFullscreenState(false);

    const metrics = computeHalfMetrics();
    cachedVh = metrics.vh;
    restY = metrics.restY;
    const liveY = readLiveTranslateY();
    const dur = computeAdaptiveDuration(restY - liveY, initialVel);

    modal.style.transition = `opacity ${dur}ms ${IOS_SILK_CURVE}`;
    modal.style.opacity = '1';
    updateMainStageDepth(0.65, true);

    sheet.style.opacity = '1';
    sheet.style.transition = `transform ${dur}ms ${IOS_SILK_CURVE}`;
    sheet.style.transform = `translate3d(0, ${restY.toFixed(1)}px, 0) scale3d(1, 1, 1)`;
    currentY = restY;
    currentScaleX = 1;
    currentScaleY = 1;

    settleTimer = setTimeout(() => {
      sheet.style.transition = 'none';
      if (!isFullscreen) {
        scrollBody.style.maxHeight = `${metrics.maxScrollBodyH}px`;
      }
    }, dur + 20);
  };

  const snapToFullscreen = (initialVel = 0) => {
    if (!isMobileShutter()) return;
    clearSettleTimer();

    const liveY = readLiveTranslateY();
    const dur = computeAdaptiveDuration(liveY, initialVel);
    scrollBody.style.maxHeight = '';
    setFullscreenState(true);

    modal.style.transition = `opacity ${dur}ms ${IOS_SILK_CURVE}`;
    modal.style.opacity = '1';
    updateMainStageDepth(1, true);

    sheet.style.opacity = '1';
    /* میکرو-کشسانی عمودی بسیار ظریف (۱.۸٪) هنگام قفل شدن تمام‌صفحه روی GPU بدون تار کردن متن */
    const entryStretchY = Math.min(1.022, 1.01 + Math.min(800, Math.abs(initialVel)) * 0.000014);
    const entrySquashX = 2 - entryStretchY;
    sheet.style.transition = `transform ${Math.round(dur * 0.34)}ms cubic-bezier(0.2, 0.9, 0.3, 1)`;
    sheet.style.transform = `translate3d(0, 0, 0) scale3d(${entrySquashX.toFixed(4)}, ${entryStretchY.toFixed(4)}, 1)`;
    currentY = 0;
    currentScaleX = 1;
    currentScaleY = 1;

    settleTimer = setTimeout(() => {
      sheet.style.transition = `transform ${Math.round(dur * 0.66)}ms ${IOS_SILK_CURVE}`;
      sheet.style.transform = 'translate3d(0, 0, 0) scale3d(1, 1, 1)';
      settleTimer = setTimeout(() => {
        sheet.style.transition = 'none';
      }, Math.round(dur * 0.66) + 20);
    }, Math.round(dur * 0.32));

    playTactileSound('pop');
    triggerHaptic(8);
  };

  const recalculateHalfHeight = () => {
    if (!isMobileShutter() || isFullscreen || dragging) return;
    if (modal.classList.contains('hidden') || modal.classList.contains('is-closing')) return;
    const metrics = computeHalfMetrics();
    cachedVh = metrics.vh;
    restY = metrics.restY;
    scrollBody.style.maxHeight = `${metrics.maxScrollBodyH}px`;
    sheet.style.transition = `transform 340ms ${IOS_SILK_CURVE}`;
    sheet.style.transform = `translate3d(0, ${restY.toFixed(1)}px, 0) scale3d(1, 1, 1)`;
    currentY = restY;
    currentScaleX = 1;
    currentScaleY = 1;
  };

  const animateOpen = () => {
    clearSettleTimer();
    if (!isMobileShutter()) {
      setFullscreenState(false);
      scrollBody.style.maxHeight = '';
      return;
    }

    setFullscreenState(false);
    scrollBody.scrollTop = 0;
    scrollBody.style.maxHeight = '';

    const metrics = computeHalfMetrics();
    cachedVh = metrics.vh;
    restY = metrics.restY;
    scrollBody.style.maxHeight = `${metrics.maxScrollBodyH}px`;

    modal.style.transition = 'none';
    modal.style.opacity = '0';
    sheet.style.transition = 'none';
    sheet.style.opacity = '1';
    /* شروع از حالت کمی جمع‌شده افقی و کشیده عمودی برای حس جهش مایع هنگام باز شدن */
    sheet.style.transform = `translate3d(0, ${metrics.vh}px, 0) scale3d(0.978, 1.024, 1)`;
    currentY = metrics.vh;
    currentScaleX = 1;
    currentScaleY = 1;
    updateMainStageDepth(0, false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        modal.style.transition = `opacity 480ms ${IOS_SILK_CURVE}`;
        modal.style.opacity = '1';
        updateMainStageDepth(0.65, true);

        sheet.style.transition = `transform 510ms ${IOS_SILK_CURVE}`;
        sheet.style.transform = `translate3d(0, ${restY.toFixed(1)}px, 0) scale3d(1, 1, 1)`;
        currentY = restY;

        settleTimer = setTimeout(() => {
          sheet.style.transition = 'none';
        }, 530);
      });
    });
  };

  const animateClose = (initialVel = 0) => {
    clearSettleTimer();
    if (!isMobileShutter()) return;
    setFullscreenState(false);

    const vh = getViewportH();
    const dist = Math.max(120, vh - currentY);
    const dur = Math.min(440, Math.max(360, computeAdaptiveDuration(dist, initialVel)));

    modal.style.transition = `opacity ${dur}ms ${IOS_CLOSE_CURVE}`;
    modal.style.opacity = '0';
    updateMainStageDepth(0, true);

    /* جمع شدن ظریف عرض شیت به سمت پایین صفحه و دکمه شناور + */
    sheet.style.transition = `transform ${dur}ms ${IOS_CLOSE_CURVE}`;
    sheet.style.opacity = '1';
    sheet.style.transform = `translate3d(0, ${vh}px, 0) scale3d(0.955, 0.985, 1)`;
    currentY = vh;
    currentScaleX = 1;
    currentScaleY = 1;
  };

  const resetState = () => {
    clearSettleTimer();
    isFullscreen = false;
    startedInFullscreen = false;
    currentY = 0;
    currentScaleX = 1;
    currentScaleY = 1;
    dragging = false;
    suppressComposerTap = false;
    dragLocked = false;
    rafPending = false;
    touchSamples = [];
    syncIslandVisibilityForFullscreen(false);
    modal.style.transition = '';
    modal.style.opacity = '';
    scrollBody.style.maxHeight = '';
    sheet.classList.remove('is-fullscreen');
    sheet.style.transition = 'none';
    sheet.style.opacity = '';
    sheet.style.transform = '';
  };

  sheet.addEventListener(
    'click',
    (e) => {
      if (suppressComposerTap) {
        e.stopImmediatePropagation();
        e.preventDefault();
        suppressComposerTap = false;
      }
    },
    true
  );

  scrollBody.addEventListener('focusin', (e) => {
    if (!isMobileShutter() || dragging) return;
    const tag = e.target?.tagName;
    if ((tag === 'INPUT' || tag === 'TEXTAREA') && !isFullscreen) {
      snapToFullscreen(-280);
    }
  });

  leadingBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isMobileShutter() && isFullscreen) {
      snapToHalf(260);
      playTactileSound('pop');
    } else {
      closeModal('task-composer-modal');
    }
  });

  grabberZone?.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    if (!isMobileShutter() || dragging) return;
    if (!isFullscreen) {
      snapToFullscreen(-420);
    }
  });

  /* حین درگ، موقعیت Y به همراه میکرو-کشسانی GPU (حداکثر ۲٪) اعمال می‌شود تا متن کاملاً شارپ بماند */
  const renderDragFrame = () => {
    rafPending = false;
    if (!dragging) return;
    sheet.style.transform = `translate3d(0, ${currentY.toFixed(1)}px, 0) scale3d(${currentScaleX.toFixed(4)}, ${currentScaleY.toFixed(4)}, 1)`;
  };

  const computeReleaseVelocity = () => {
    if (touchSamples.length < 2) return 0;
    const newest = touchSamples[touchSamples.length - 1];
    let oldest = touchSamples[0];
    for (let i = touchSamples.length - 2; i >= 0; i--) {
      if (newest.t - touchSamples[i].t >= 45) {
        oldest = touchSamples[i];
        break;
      }
    }
    const dt = Math.max(8, newest.t - oldest.t);
    return ((newest.y - oldest.y) / dt) * 1000;
  };

  sheet.addEventListener(
    'touchstart',
    (e) => {
      if (!isMobileShutter() || e.touches.length !== 1) return;
      if (e.target.closest('[data-liquid-scrub-bar]')) return;

      clearSettleTimer();
      const liveY = readLiveTranslateY();
      sheet.style.transition = 'none';
      sheet.style.opacity = '1';
      sheet.style.transform = `translate3d(0, ${liveY.toFixed(1)}px, 0) scale3d(1, 1, 1)`;
      currentY = liveY;
      currentScaleX = 1;
      currentScaleY = 1;

      modal.style.transition = 'none';
      modal.style.opacity = '1';

      const touch = e.touches[0];
      const now = performance.now();
      startTouchY = touch.clientY;
      startTouchX = touch.clientX;
      startSheetY = liveY;
      startedInFullscreen = isFullscreen;
      cachedVh = getViewportH();
      startedOnDragZone = Boolean(e.target.closest('[data-composer-drag-zone]'));
      touchSamples = [{ y: touch.clientY, t: now }];
      dragging = false;
      suppressComposerTap = false;
      dragLocked = false;
    },
    { passive: true }
  );

  sheet.addEventListener(
    'touchmove',
    (e) => {
      if (!isMobileShutter() || !startTouchY || dragLocked) return;
      const touch = e.touches[0];
      const dy = touch.clientY - startTouchY;
      const dx = touch.clientX - startTouchX;

      if (!dragging) {
        if (Math.abs(dx) > Math.abs(dy) * 1.25 && Math.abs(dx) > 10) {
          dragLocked = true;
          return;
        }
        if (Math.abs(dy) < 7) return;

        if (startedOnDragZone) {
          dragging = true;
        } else if (!isFullscreen && dy < 0) {
          dragging = true;
        } else if (!isFullscreen && dy > 0 && scrollBody.scrollTop <= 2) {
          dragging = true;
        } else if (isFullscreen && dy > 0 && scrollBody.scrollTop <= 2) {
          dragging = true;
        } else if (isFullscreen && dy > 0 && scrollBody.scrollTop > 2) {
          return;
        } else {
          dragLocked = true;
          return;
        }

        if (dragging) {
          suppressComposerTap = true;
          scrollBody.style.maxHeight = '';
          if (document.activeElement && document.activeElement.closest('#composer-shutter-sheet')) {
            document.activeElement.blur();
          }
        }
      }

      if (dragging) {
        if (e.cancelable) e.preventDefault();
        const now = performance.now();
        const prevSample = touchSamples[touchSamples.length - 1];
        const instantVel = prevSample ? (touch.clientY - prevSample.y) / Math.max(8, now - prevSample.t) : 0;
        touchSamples.push({ y: touch.clientY, t: now });
        if (touchSamples.length > 6) touchSamples.shift();

        let nextY = startSheetY + dy;
        if (nextY < 0) {
          const overscroll = computeIosRubberBand(nextY, 44);
          nextY = overscroll;
          const pullRatio = Math.min(1, Math.abs(overscroll) / 24);
          currentScaleY = 1 + pullRatio * 0.022;
          currentScaleX = 1 - pullRatio * 0.011;
        } else {
          /* کشسانی بسیار ظریف وابسته به سرعت حرکت عمودی دست (محدود به ۱.۶٪) */
          const velStretch = Math.max(-0.016, Math.min(0.016, -instantVel * 0.008));
          currentScaleY = 1 + velStretch;
          currentScaleX = 1 - velStretch * 0.5;
        }

        currentY = nextY;

        if (!rafPending) {
          rafPending = true;
          requestAnimationFrame(renderDragFrame);
        }
      }
    },
    { passive: false }
  );

  const finishShutterDrag = () => {
    startTouchY = 0;
    dragLocked = false;
    if (!dragging) return;
    dragging = false;
    rafPending = false;

    const velocityY = computeReleaseVelocity();
    touchSamples = [];
    const vh = cachedVh || getViewportH();
    const ninetyPercentOpenY = Math.round(vh * 0.10);

    if (startedInFullscreen) {
      const halfThresholdY = Math.round(vh * 0.22);
      const closeThresholdY = Math.round(vh * 0.56);
      if (currentY >= closeThresholdY || (velocityY > 1400 && currentY >= vh * 0.34)) {
        animateClose(velocityY);
        playTactileSound('pop');
        triggerHaptic(8);
        closeModal('task-composer-modal', true);
      } else if (currentY >= halfThresholdY || (velocityY > 240 && currentY > 24)) {
        snapToHalf(velocityY);
        playTactileSound('pop');
      } else {
        snapToFullscreen(velocityY);
      }
    } else {
      if (currentY <= ninetyPercentOpenY || (velocityY < -720 && currentY < restY * 0.65)) {
        snapToFullscreen(velocityY);
      } else if (currentY >= restY + 85 || (velocityY > 680 && currentY > restY + 30)) {
        animateClose(velocityY);
        playTactileSound('pop');
        triggerHaptic(8);
        closeModal('task-composer-modal', true);
      } else {
        snapToHalf(velocityY);
      }
    }

    setTimeout(() => {
      suppressComposerTap = false;
    }, 80);
  };

  sheet.addEventListener('touchend', finishShutterDrag);
  sheet.addEventListener('touchcancel', finishShutterDrag);

  return {
    animateOpen,
    animateClose,
    resetState,
    snapToHalf,
    snapToFullscreen,
    recalculateHalfHeight,
    isFullscreenMode: () => isFullscreen,
  };
}

function setupSheetSwipeToClose(modalId) {
  const modal = document.getElementById(modalId);
  const sheet = modal?.querySelector('.sheet-animate');
  if (!modal || !sheet) return;

  let startY = 0;
  let startX = 0;
  let currentDy = 0;
  let canDrag = false;
  let isDragging = false;
  let sheetRafPending = false;
  let lastY = 0;
  let lastT = 0;
  let velY = 0;

  const applySheetDragFrame = () => {
    sheetRafPending = false;
    if (!isDragging) return;
    sheet.style.transform = `translate3d(0, ${currentDy}px, 0)`;
  };

  sheet.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      if (e.target.closest('[data-liquid-scrub-bar]')) return;
      const startedOnHandle = Boolean(e.target.closest('[data-sheet-handle]'));
      canDrag = startedOnHandle || sheet.scrollTop <= 2;
      if (!canDrag) return;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      lastY = startY;
      lastT = performance.now();
      velY = 0;
      currentDy = 0;
      isDragging = false;
    },
    { passive: true }
  );

  sheet.addEventListener(
    'touchmove',
    (e) => {
      if (!canDrag) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;

      if (!isDragging) {
        if (dy < 0) {
          canDrag = false;
          return;
        }
        if (dy > 10 && dy > Math.abs(dx) * 1.2 && sheet.scrollTop <= 0) {
          isDragging = true;
          sheet.style.animation = 'none';
          sheet.style.transition = 'none';
        } else {
          return;
        }
      }

      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      velY = ((e.touches[0].clientY - lastY) / dt) * 1000;
      lastY = e.touches[0].clientY;
      lastT = now;

      currentDy = Math.max(0, dy);
      if (!sheetRafPending) {
        sheetRafPending = true;
        requestAnimationFrame(applySheetDragFrame);
      }
    },
    { passive: false }
  );

  const finishDrag = () => {
    if (!isDragging) {
      canDrag = false;
      return;
    }
    isDragging = false;
    canDrag = false;
    sheetRafPending = false;

    if (currentDy > 90 || velY > 580) {
      sheet.style.transition = 'transform 0.34s cubic-bezier(0.32, 0.72, 0, 1)';
      sheet.style.transform = 'translate3d(0, 100%, 0)';
      playTactileSound('pop');
      triggerHaptic(8);
      closeModal(modalId, true);
    } else {
      sheet.style.transition = 'transform 0.44s cubic-bezier(0.19, 1, 0.22, 1)';
      sheet.style.transform = 'translate3d(0, 0, 0)';
    }
  };

  sheet.addEventListener('touchend', finishDrag);
  sheet.addEventListener('touchcancel', finishDrag);
}

function updateProfileModalPreview() {
  const previewEl = document.getElementById('profile-modal-preview');
  const removeBtn = document.getElementById('remove-avatar-photo-btn');
  if (previewEl) {
    if (state.draftPhotoDataUrl) {
      previewEl.innerHTML = `<img src="${state.draftPhotoDataUrl}" alt="پیش‌نمایش" class="w-full h-full object-cover" />`;
    } else {
      previewEl.textContent = state.draftAvatar || '🧑‍💻';
    }
  }
  if (removeBtn) {
    removeBtn.classList.toggle('hidden', !state.draftPhotoDataUrl);
  }
  document.querySelectorAll('.avatar-choice-btn').forEach((btn) => {
    const selected = !state.draftPhotoDataUrl && btn.dataset.avatar === state.draftAvatar;
    btn.classList.toggle('bg-[#7fd5d8]/25', selected);
    btn.classList.toggle('border', selected);
    btn.classList.toggle('border-[#7fd5d8]', selected);
  });
}

function openProfileModal() {
  state.draftAvatar = state.profile.avatar || '🧑‍💻';
  state.draftPhotoDataUrl = state.profile.photoDataUrl || '';
  const nameInput = document.getElementById('profile-name-input');
  const bioInput = document.getElementById('profile-bio-input');
  if (nameInput) nameInput.value = state.profile.name || '';
  if (bioInput) bioInput.value = state.profile.bio || '';
  updateProfileModalPreview();
  openModal('profile-modal');
}

function encodeSyncCode(dataObj) {
  const jsonStr = JSON.stringify(dataObj);
  const bytes = new TextEncoder().encode(jsonStr);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'DF2:' + btoa(binary);
}

function decodeSyncCode(codeStr) {
  const clean = String(codeStr || '').trim();
  if (!clean) throw new Error('EMPTY_BACKUP');
  if (clean.startsWith('{')) {
    return JSON.parse(clean);
  }
  const rawB64 = clean.startsWith('DF2:') ? clean.slice(4) : clean;
  const binary = atob(rawB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const jsonStr = new TextDecoder().decode(bytes);
  return JSON.parse(jsonStr);
}

function openSyncModal() {
  const codeBox = document.getElementById('sync-code-box');
  const importInput = document.getElementById('import-code-input');
  if (importInput) importInput.value = '';
  if (codeBox) {
    try {
      const exportPayload = {
        tasks: state.tasks,
        customFolders: state.customFolders,
        quickNotes: state.quickNotes,
        dailyGoal: state.dailyGoal,
        dailyReminderEnabled: state.dailyReminderEnabled,
        dailyReminderTime: state.dailyReminderTime,
        accentTheme: state.accentTheme,
        colorMode: state.colorMode,
        cardRadius: state.cardRadius,
        lastHabitResetDay: state.lastHabitResetDay,
        profile: {
          name: state.profile.name,
          bio: state.profile.bio,
          avatar: state.profile.avatar,
        },
        streak: state.streak,
      };
      codeBox.value = encodeSyncCode(exportPayload);
    } catch (e) {
      codeBox.value = memoryFallbackStorage || '';
    }
  }
  openModal('sync-modal');
}

function exportBackupJsonFile() {
  saveState();
  const dataStr = memoryFallbackStorage || JSON.stringify({ tasks: state.tasks }, null, 2);
  const fileName = `daily-flow-backup-${getTodayKey()}.json`;

  if (window.AndroidNative && typeof window.AndroidNative.shareBackupText === 'function') {
    window.AndroidNative.shareBackupText(fileName, dataStr);
    triggerIslandToast('💾', 'پنجره ذخیره پشتیبان باز شد');
    return;
  }

  try {
    const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
    triggerIslandToast('💾', 'فایل پشتیبان JSON دانلود شد');
  } catch (e) {
    openSyncModal();
    triggerIslandToast('📋', 'از گزینه «کپی کد انتقال» استفاده کن');
  }
}

function renderTaskEditModalControls() {
  const task = state.tasks.find((t) => t.id === state.editingTaskId);
  if (!task) return;

  const daySection = document.getElementById('edit-task-day-section');
  if (daySection) {
    daySection.classList.toggle('hidden', Boolean(state.draftEditHabit));
    daySection.querySelectorAll('.edit-day-choice-btn').forEach((btn) => {
      const active = btn.dataset.editDay === state.draftEditDay;
      btn.classList.toggle('bg-[#7fd5d8]', active);
      btn.classList.toggle('text-[#0b1617]', active);
      btn.classList.toggle('border-[#7fd5d8]', active);
      btn.classList.toggle('bg-white/[0.06]', !active);
      btn.classList.toggle('border-white/10', !active);
      btn.classList.toggle('text-slate-300', !active);
    });
  }

  const catContainer = document.getElementById('edit-task-categories');
  if (catContainer) {
    catContainer.innerHTML = getAllFolders()
      .map((folder) => {
        const active = state.draftEditCategory === folder.name;
        return `
          <button
            type="button"
            data-edit-cat="${escapeHtml(folder.name)}"
            class="spring-btn text-xs px-3 py-1.5 rounded-full border cursor-pointer ${
              active
                ? 'bg-[#7fd5d8] text-[#0b1617] border-[#7fd5d8] font-bold'
                : 'bg-white/[0.06] border-white/10 text-slate-300'
            }"
          >
            ${escapeHtml(folder.emoji)} ${escapeHtml(folder.name)}
          </button>
        `;
      })
      .join('');

    catContainer.querySelectorAll('[data-edit-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.draftEditCategory = btn.dataset.editCat;
        renderTaskEditModalControls();
        playTactileSound('pop');
      });
    });
  }

  const urgentBtn = document.getElementById('edit-task-urgent-btn');
  if (urgentBtn) {
    urgentBtn.classList.toggle('bg-amber-500/20', state.draftEditUrgent);
    urgentBtn.classList.toggle('border-amber-400/45', state.draftEditUrgent);
    urgentBtn.classList.toggle('text-amber-300', state.draftEditUrgent);
  }

  const habitBtn = document.getElementById('edit-task-habit-btn');
  if (habitBtn) {
    habitBtn.classList.toggle('bg-indigo-500/20', state.draftEditHabit);
    habitBtn.classList.toggle('border-indigo-400/45', state.draftEditHabit);
    habitBtn.classList.toggle('text-indigo-300', state.draftEditHabit);
  }

  const subs = Array.isArray(task.subtasks) ? task.subtasks : [];
  const counterEl = document.getElementById('edit-subtasks-counter');
  const listEl = document.getElementById('edit-subtasks-list');
  if (counterEl) {
    counterEl.textContent = `${toPersianDigits(subs.length)} مرحله`;
  }
  if (listEl) {
    listEl.innerHTML = subs
      .map(
        (sub) => `
        <div class="flex items-center justify-between gap-2 rounded-2xl bg-white/[0.04] border border-white/[0.08] px-3 py-2">
          <button type="button" data-edit-sub-toggle="${sub.id}" class="flex items-center gap-2 min-w-0 flex-1 text-right cursor-pointer">
            <span class="subtask-check ${sub.completed ? 'checked' : ''}">
              ${sub.completed ? '<svg class="w-3 h-3 text-[#0b1617]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path class="check-stroke-anim" stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>' : ''}
            </span>
            <span dir="auto" class="text-xs truncate ${sub.completed ? 'line-through text-[#7d8e90]' : 'text-white'}">${escapeHtml(sub.title)}</span>
          </button>
          <button type="button" data-edit-sub-del="${sub.id}" aria-label="حذف مرحله" class="spring-btn icon-circle-btn w-6 h-6 rounded-full bg-white/10 text-slate-300 shrink-0 cursor-pointer">
            <svg width="12" height="12" class="w-3 h-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      `
      )
      .join('');

    listEl.querySelectorAll('[data-edit-sub-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        toggleSubtask(task.id, btn.dataset.editSubToggle, true, 'today');
        renderTaskEditModalControls();
      });
    });

    listEl.querySelectorAll('[data-edit-sub-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        task.subtasks = task.subtasks.filter((s) => s.id !== btn.dataset.editSubDel);
        saveState();
        renderTasks();
        renderTaskEditModalControls();
        playTactileSound('delete');
      });
    });
  }
}

function openTaskEditModal(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  state.editingTaskId = taskId;
  state.draftEditCategory = task.category || 'شخصی';
  state.draftEditDay = getDayViewFromKey(task.scheduledDate || getTodayKey());
  state.draftEditUrgent = Boolean(task.urgent);
  state.draftEditHabit = Boolean(task.isHabit);

  const titleInput = document.getElementById('edit-task-title-input');
  const descInput = document.getElementById('edit-task-desc-input');
  const newSubInput = document.getElementById('new-subtask-input');
  if (titleInput) titleInput.value = task.title;
  if (descInput) descInput.value = task.description || '';
  if (newSubInput) newSubInput.value = '';

  renderTaskEditModalControls();
  openModal('task-edit-modal');
}

function addSubtaskFromEditModal() {
  const task = state.tasks.find((t) => t.id === state.editingTaskId);
  const input = document.getElementById('new-subtask-input');
  if (!task || !input) return;
  const clean = input.value.trim();
  if (!clean) return;
  if (!Array.isArray(task.subtasks)) task.subtasks = [];
  task.subtasks.push({
    id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    title: clean,
    completed: false,
  });
  input.value = '';
  saveState();
  renderTasks();
  renderTaskEditModalControls();
  playTactileSound('pop');
}

function renderCustomFoldersManageList() {
  const listEl = document.getElementById('custom-folders-manage-list');
  if (!listEl) return;

  document.querySelectorAll('.folder-emoji-chip').forEach((chip) => {
    const selected = chip.dataset.folderEmoji === state.draftFolderEmoji;
    chip.classList.toggle('bg-[#7fd5d8]/20', selected);
    chip.classList.toggle('border-[#7fd5d8]/45', selected);
    chip.classList.toggle('bg-[#161e20]', !selected);
    chip.classList.toggle('border-white/10', !selected);
  });

  listEl.innerHTML = getAllFolders()
    .map(
      (folder) => `
      <div class="flex items-center justify-between gap-2 rounded-2xl bg-white/[0.04] border border-white/[0.08] px-3.5 py-2.5">
        <span class="text-xs font-bold text-white">${escapeHtml(folder.emoji)} ${escapeHtml(folder.name)}</span>
        ${
          folder.builtIn
            ? '<span class="text-[10px] text-[#93a3a5]">پیش‌فرض</span>'
            : `<button type="button" data-delete-folder="${escapeHtml(folder.name)}" class="spring-btn text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-300 cursor-pointer">حذف</button>`
        }
      </div>
    `
    )
    .join('');

  listEl.querySelectorAll('[data-delete-folder]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const folderName = btn.dataset.deleteFolder;
      state.customFolders = state.customFolders.filter((f) => f.name !== folderName);
      if (state.folderFilter === folderName) state.folderFilter = 'all';
      if (state.selectedCategory === folderName) state.selectedCategory = 'شخصی';
      saveState();
      renderFolderFilterChips();
      renderCustomFoldersManageList();
      if (state.activeTab === 'settings') renderSecondaryTabViews();
      playTactileSound('delete');
    });
  });
}

function openFoldersModal() {
  state.draftFolderEmoji = '🎓';
  const input = document.getElementById('custom-folder-name-input');
  if (input) input.value = '';
  renderCustomFoldersManageList();
  openModal('folders-modal');
}

function updateComposerSmartBadges() {
  const badgesEl = document.getElementById('composer-smart-detect-badges');
  const titleInput = document.getElementById('composer-title-input');
  const descInput = document.getElementById('composer-desc-input');
  const submitBtn = document.getElementById('composer-submit-btn');
  if (!badgesEl || !titleInput) return;

  const titleVal = titleInput.value.trim();
  const isDisabled = titleVal.length === 0;
  if (submitBtn) submitBtn.disabled = isDisabled;

  const weights = analyzeTaskSmartDimensions({
    title: titleVal,
    description: descInput ? descInput.value.trim() : '',
    category: state.composerCategory,
    isHabit: state.composerHabit,
    urgent: state.composerUrgent,
    subtasks: state.composerSubtasks.map((t) => ({ title: t })),
  });

  const activeAxes = Object.entries(weights)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  badgesEl.innerHTML = activeAxes
    .map(([axisKey]) => {
      const ax = RADAR_AXES[axisKey];
      return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#7fd5d8]/15 text-[#7fd5d8]">${ax.emoji} ${ax.label}</span>`;
    })
    .join('');
}

function renderComposerSubtasks() {
  const listEl = document.getElementById('composer-subtasks-list');
  const badgeEl = document.getElementById('composer-subtasks-badge');
  const addBtn = document.getElementById('composer-add-option-btn');
  const hintEl = document.getElementById('composer-remaining-hint');
  if (!listEl) return;

  const count = state.composerSubtasks.length;
  if (badgeEl) badgeEl.textContent = `${toPersianDigits(count)} مورد`;
  if (addBtn) addBtn.classList.toggle('hidden', count >= 12);
  if (hintEl) {
    const rem = Math.max(0, 12 - count);
    hintEl.textContent =
      rem === 0
        ? 'حداکثر ۱۲ زیرکار اضافه شده است.'
        : `می‌توانی تا ${toPersianDigits(rem)} زیرکار دیگر اضافه کنی.`;
  }

  listEl.innerHTML = state.composerSubtasks
    .map(
      (val, idx) => `
      <div class="flex items-center gap-2 px-4 py-2">
        <span class="w-4 h-4 rounded-md border border-[#7fd5d8]/45 shrink-0"></span>
        <input
          type="text"
          dir="auto"
          maxlength="90"
          data-composer-sub-idx="${idx}"
          value="${escapeHtml(val)}"
          placeholder="عنوان زیرکار ${toPersianDigits(idx + 1)}..."
          class="flex-1 bg-transparent py-1 text-xs text-white placeholder-[#7d8e90] outline-none"
        />
        <button
          type="button"
          data-composer-sub-remove="${idx}"
          aria-label="حذف زیرکار"
          class="spring-btn icon-circle-btn w-6 h-6 rounded-full bg-white/10 text-slate-300 shrink-0 cursor-pointer"
        >
          <svg width="12" height="12" class="w-3 h-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    `
    )
    .join('');

  listEl.querySelectorAll('[data-composer-sub-idx]').forEach((inp) => {
    const idx = Number(inp.dataset.composerSubIdx);
    inp.addEventListener('input', () => {
      state.composerSubtasks[idx] = inp.value;
      updateComposerSmartBadges();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (state.composerSubtasks.length < 12) {
          state.composerSubtasks.push('');
          renderComposerSubtasks();
          setTimeout(() => {
            const inputs = listEl.querySelectorAll('[data-composer-sub-idx]');
            inputs[inputs.length - 1]?.focus();
          }, 30);
        }
      }
    });
  });

  listEl.querySelectorAll('[data-composer-sub-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.composerSubRemove);
      state.composerSubtasks.splice(idx, 1);
      renderComposerSubtasks();
      updateComposerSmartBadges();
      playTactileSound('delete');
    });
  });

  if (composerShutterController) {
    composerShutterController.recalculateHalfHeight();
  }
}

function updateComposerTogglesUI(options = {}) {
  const fromScrub = Boolean(options.fromScrub);
  const animateSwitches = Boolean(options.animateSwitches);
  const catVal = document.getElementById('composer-val-category');
  const fsFolderTag = document.getElementById('composer-fs-folder-tag');
  const fsDayTag = document.getElementById('composer-fs-day-tag');
  const daySubtext = document.getElementById('composer-day-subtext');
  const folderLabel = getFolderDisplay(state.composerCategory);
  const dayMeta = getDayViewMeta(state.composerDay);

  if (catVal) catVal.textContent = folderLabel;
  if (fsFolderTag) fsFolderTag.textContent = folderLabel;
  if (fsDayTag) fsDayTag.textContent = dayMeta.badge;

  if (daySubtext) {
    if (state.composerHabit) {
      daySubtext.textContent = 'به عنوان عادت، هر روز تکرار می‌شود 🔁';
    } else if (state.composerDay === 'tomorrow') {
      daySubtext.textContent = `فردا (${formatJalaliForDayView('tomorrow')}) در لیست امروز می‌آید`;
    } else if (state.composerDay === 'yesterday') {
      daySubtext.textContent = `در سابقه دیروز (${formatJalaliForDayView('yesterday')}) ثبت می‌شود`;
    } else {
      daySubtext.textContent = 'فقط در برنامه امروز نمایش داده می‌شود';
    }
  }

  const dayOrder = ['yesterday', 'today', 'tomorrow'];
  const dayIdx = Math.max(0, dayOrder.indexOf(state.composerDay));
  const dayIndicator = document.getElementById('composer-day-indicator');
  if (dayIndicator && !fromScrub) {
    dayIndicator.style.transform = `translate3d(${-dayIdx * 100}%, 0, 0)`;
  }

  document.querySelectorAll('.composer-day-chip').forEach((chip) => {
    const active = chip.dataset.composerDay === state.composerDay;
    chip.classList.toggle('is-active', active);
    chip.classList.toggle('text-[#0b1617]', active);
    chip.classList.toggle('font-extrabold', active);
    chip.classList.toggle('text-slate-300', !active);
  });

  setTgSwitchState(document.getElementById('composer-switch-autocomplete'), state.composerAutoComplete, animateSwitches);
  setTgSwitchState(document.getElementById('composer-switch-urgent'), state.composerUrgent, animateSwitches);
  setTgSwitchState(document.getElementById('composer-switch-habit'), state.composerHabit, animateSwitches);
}

function openTaskComposer(defaultDayOverride = null) {
  state.composerSubtasks = [];
  state.composerDay = defaultDayOverride || state.selectedDayView || 'today';
  state.composerCategory = state.folderFilter !== 'all' ? state.folderFilter : state.selectedCategory || 'شخصی';
  state.composerAutoComplete = true;
  state.composerUrgent = state.filter === 'urgent';
  state.composerHabit = state.filter === 'habit';

  const titleInput = document.getElementById('composer-title-input');
  const descInput = document.getElementById('composer-desc-input');
  if (titleInput) titleInput.value = '';
  if (descInput) descInput.value = '';

  updateComposerTogglesUI({ animateSwitches: false });
  renderComposerSubtasks();
  updateComposerSmartBadges();
  openModal('task-composer-modal');

  if (composerShutterController) {
    composerShutterController.animateOpen();
  }

  const isMobileTouch =
    window.innerWidth < 768 ||
    ('ontouchstart' in window && navigator.maxTouchPoints > 0 && window.innerWidth < 1024);

  if (isMobileTouch) {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  } else {
    setTimeout(() => titleInput?.focus(), 90);
  }
}

function renderCommandPaletteList(queryText = '') {
  const listEl = document.getElementById('command-palette-list');
  if (!listEl) return;

  const q = String(queryText || '').trim().toLowerCase();
  const items = [
    {
      icon: '➕',
      title: q ? `ایجاد کار برای امروز: «${queryText.trim()}»` : 'ایجاد کار برای امروز',
      sub: 'ثبت تسک در برنامه امروز',
      action: () => {
        closeModal('command-palette-modal');
        if (q) {
          addTask(queryText.trim(), { dayView: 'today' });
        } else {
          openTaskComposer('today');
        }
      },
    },
    {
      icon: '🌅',
      title: q ? `برنامه‌ریزی برای فردا: «${queryText.trim()}»` : 'ثبت تسک فردایی',
      sub: 'آماده‌سازی کار برای فردا',
      action: () => {
        closeModal('command-palette-modal');
        if (q) {
          addTask(queryText.trim(), { dayView: 'tomorrow' });
        } else {
          openTaskComposer('tomorrow');
        }
      },
    },
    {
      icon: '⏪',
      title: 'مشاهده کارهای دیروز (و انتقال به امروز)',
      sub: 'بررسی عملکرد دیروز یا انتقال کارهای ناتمام',
      action: () => {
        closeModal('command-palette-modal');
        switchTab('tasks');
        setSelectedDayView('yesterday');
      },
    },
    {
      icon: '📓',
      title: 'باز کردن دفترچه یادداشت',
      sub: 'مشاهده و جستجو در یادداشت‌ها و ایده‌ها',
      action: () => {
        closeModal('command-palette-modal');
        openNotebookModal();
      },
    },
    {
      icon: '✍️',
      title: q ? `ثبت در دفترچه: «${queryText.trim()}»` : 'نوشتن یادداشت جدید در دفترچه',
      sub: 'ثبت عنوان و متن چندخطی با تاریخ شمسی',
      action: () => {
        closeModal('command-palette-modal');
        if (q) {
          addQuickNote(queryText.trim());
        } else {
          openNoteEditorModal(null);
        }
      },
    },
    {
      icon: state.focusRunning ? '⏸️' : '⏱️',
      title: state.focusRunning ? 'توقف تایمر تمرکز' : 'شروع تایمر تمرکز عمیق',
      sub: 'همگام با داینامیک آیلند',
      action: () => {
        closeModal('command-palette-modal');
        state.focusRunning ? pauseFocusTimer() : startFocusTimer();
      },
    },
    {
      icon: state.colorMode === 'dark' ? '☀️' : '🌙',
      title: state.colorMode === 'dark' ? 'تغییر به حالت روز (Light Mode)' : 'تغییر به حالت شب (Dark Mode)',
      sub: 'تغییر پوسته شیشه‌ای برنامه',
      action: () => {
        closeModal('command-palette-modal');
        state.colorMode = state.colorMode === 'dark' ? 'light' : 'dark';
        applyThemePreferences();
        saveState();
        playTactileSound('pop');
      },
    },
    {
      icon: '📊',
      title: 'نمایش آمار و نمودار راداری رشد',
      sub: 'تحلیل ذهن، کارایی، انضباط و جسم',
      action: () => {
        closeModal('command-palette-modal');
        switchTab('stats');
      },
    },
    {
      icon: '⚙️',
      title: 'تنظیمات و پشتیبان‌گیری آفلاین',
      sub: 'مدیریت پوشه‌ها، تم و خروجی JSON',
      action: () => {
        closeModal('command-palette-modal');
        switchTab('settings');
      },
    },
  ];

  getTasksForDayView('today').slice(0, 6).forEach((task) => {
    items.push({
      icon: task.completed ? '✅' : '🎯',
      title: `تمرکز روی: ${task.title}`,
      sub: getFolderDisplay(task.category),
      action: () => {
        closeModal('command-palette-modal');
        setFocusedTask(task.id);
      },
    });
  });

  currentCmdItems = q
    ? items.filter((it, idx) => idx <= 1 || idx === 4 || it.title.toLowerCase().includes(q) || it.sub.toLowerCase().includes(q))
    : items;

  cmdSelectedIndex = Math.min(cmdSelectedIndex, Math.max(0, currentCmdItems.length - 1));

  listEl.innerHTML = currentCmdItems
    .map(
      (item, idx) => `
      <button
        type="button"
        data-cmd-idx="${idx}"
        class="cmd-item w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl border border-transparent text-right cursor-pointer ${
          idx === cmdSelectedIndex ? 'is-selected' : 'hover:bg-white/[0.06]'
        }"
      >
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="text-base shrink-0">${item.icon}</span>
          <div class="min-w-0">
            <div dir="auto" class="text-xs font-bold text-white truncate">${escapeHtml(item.title)}</div>
            <div class="text-[10px] text-[#93a3a5] truncate">${escapeHtml(item.sub)}</div>
          </div>
        </div>
        <span class="text-[10px] text-[#7fd5d8] shrink-0">↵</span>
      </button>
    `
    )
    .join('');

  listEl.querySelectorAll('[data-cmd-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = currentCmdItems[Number(btn.dataset.cmdIdx)];
      if (item) item.action();
    });
  });
}

function openCommandPalette() {
  const input = document.getElementById('command-palette-input');
  cmdSelectedIndex = 0;
  if (input) input.value = '';
  renderCommandPaletteList('');
  openModal('command-palette-modal');
  setTimeout(() => input?.focus(), 60);
}

function setupAndroidBackButtonHandler() {
  let hasBackLayer = false;
  let ignoreNextPop = false;
  const isNativeWrapper = Boolean(window.AndroidNative);

  const orderedModals = [
    'command-palette-modal',
    'note-editor-modal',
    'notebook-modal',
    'task-composer-modal',
    'task-edit-modal',
    'folders-modal',
    'profile-modal',
    'sync-modal',
    'cleanup-modal',
  ];

  const isModalVisible = (id) => {
    const el = document.getElementById(id);
    return Boolean(el && !el.classList.contains('hidden') && !el.classList.contains('is-closing'));
  };

  const isAnyLayerOpen = () => {
    for (let i = 0; i < orderedModals.length; i++) {
      if (isModalVisible(orderedModals[i])) return true;
    }
    if (state.islandMode === 'expanded') return true;
    const appearanceSubpage = document.getElementById('tg-appearance-subpage');
    if (appearanceSubpage && !appearanceSubpage.classList.contains('hidden')) return true;
    if (state.inspectedTaskId) return true;
    if (state.activeTab !== 'tasks') return true;
    return false;
  };

  const syncBackLayerState = () => {
    if (isNativeWrapper) return;
    const shouldHaveLayer = isAnyLayerOpen();
    if (shouldHaveLayer && !hasBackLayer) {
      hasBackLayer = true;
      try {
        window.history.pushState({ dfLayer: true }, '');
      } catch (e) {}
    } else if (!shouldHaveLayer && hasBackLayer) {
      hasBackLayer = false;
      ignoreNextPop = true;
      try {
        window.history.back();
      } catch (e) {
        ignoreNextPop = false;
      }
    }
  };

  syncBackLayerCallback = syncBackLayerState;

  const handleHardwareBackAction = () => {
    for (let i = 0; i < orderedModals.length; i++) {
      if (isModalVisible(orderedModals[i])) {
        if (
          orderedModals[i] === 'task-composer-modal' &&
          composerShutterController &&
          composerShutterController.isFullscreenMode()
        ) {
          composerShutterController.snapToHalf();
          playTactileSound('pop');
          return true;
        }
        closeModal(orderedModals[i]);
        playTactileSound('pop');
        return true;
      }
    }

    if (state.islandMode === 'expanded') {
      setIslandMode('idle');
      playTactileSound('pop');
      return true;
    }

    const appearanceSubpage = document.getElementById('tg-appearance-subpage');
    if (appearanceSubpage && !appearanceSubpage.classList.contains('hidden')) {
      appearanceSubpage.classList.add('hidden');
      appearanceSubpage.classList.remove('flex');
      document.getElementById('tg-settings-main')?.classList.remove('hidden');
      syncBackLayerState();
      playTactileSound('pop');
      return true;
    }

    if (state.inspectedTaskId) {
      closeDesktopInspector();
      playTactileSound('pop');
      return true;
    }

    if (state.activeTab !== 'tasks') {
      switchTab('tasks');
      return true;
    }

    return false;
  };

  window.__handleNativeBack = () => handleHardwareBackAction();

  window.addEventListener('popstate', () => {
    if (ignoreNextPop) {
      ignoreNextPop = false;
      return;
    }
    hasBackLayer = false;
    const consumed = handleHardwareBackAction();
    if (consumed) {
      syncBackLayerState();
    }
  });

  document.addEventListener('backbutton', (e) => {
    const consumed = handleHardwareBackAction();
    if (consumed) {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      syncBackLayerState();
    }
  });
}

function setupFullScreenViewportSync() {
  const root = document.documentElement;
  const syncViewport = () => {
    const vv = window.visualViewport;
    const height = vv ? Math.round(vv.height) : window.innerHeight;
    const keyboardHeight = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    root.style.setProperty('--app-viewport-height', `${height}px`);
    root.style.setProperty('--keyboard-offset', `${keyboardHeight}px`);
    if (window.innerWidth >= 640) {
      document.getElementById('dynamic-island')?.classList.remove('is-hidden-for-sheet');
    }
    syncDynamicIslandExpandedHeight();
    syncDynamicPillIndicator({
      barId: 'task-filter-pill-bar',
      indicatorId: 'task-filter-indicator',
      blobId: 'task-filter-indicator-blob',
      btnSelector: '.filter-chip',
      activeValue: state.filter,
      dataAttr: 'filter',
      animateStretch: false,
      fromScrub: true,
    });
  };

  syncViewport();
  window.addEventListener('resize', syncViewport, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(syncViewport, 120), { passive: true });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewport, { passive: true });
    window.visualViewport.addEventListener('scroll', syncViewport, { passive: true });
  }

  document.addEventListener('focusin', (e) => {
    const target = e.target;
    if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA')) return;
    setTimeout(() => {
      syncViewport();
      try {
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch (err) {}
    }, 260);
  });
}

function registerOfflineServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((reg) => {
        reg.update().catch(() => {});
      })
      .catch(() => {});
  });
}

function initApp() {
  const supportsGpuIslandClip =
    typeof CSS !== 'undefined' &&
    typeof CSS.registerProperty === 'function' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('clip-path', 'inset(0px round 22px)');
  document.body.classList.toggle('island-legacy-box', !supportsGpuIslandClip);

  loadState();
  applyAdaptiveRenderCalibration();
  initAdaptiveRenderEngine();
  applyThemePreferences();
  setupTaskListDelegation();
  renderFolderFilterChips();
  renderTasks();
  renderQuickNotes();
  updateFocusUI();
  updateHeaderAndProgress();
  syncDynamicIslandExpandedHeight();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncDynamicIslandExpandedHeight).catch(() => {});
  }
  setupFullScreenViewportSync();
  setupAndroidBackButtonHandler();
  registerOfflineServiceWorker();

  if (state.focusRunning && typeof state.focusEndTimestamp === 'number') {
    syncFocusTimerTick(true);
    if (state.focusRunning) {
      ensureFocusIntervalLoop();
      scheduleFocusEndNotification();
    }
  }

  const wakeUpAtomicTimer = () => {
    if (state.focusRunning) {
      syncFocusTimerTick(true);
    }
    updateNotificationSettingsUI();
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) wakeUpAtomicTimer();
  });
  window.addEventListener('pageshow', wakeUpAtomicTimer, { passive: true });
  window.addEventListener('focus', wakeUpAtomicTimer, { passive: true });

  if (state.dailyReminderEnabled) {
    syncDailyStreakReminderNotification(true, true);
  }
  updateNotificationSettingsUI();

  composerShutterController = initComposerShutterGesture();

  /* رویدادها و اسکرول انگشتی نوار سه‌روزه: دیروز | امروز | فردا */
  const dayOrderList = ['yesterday', 'today', 'tomorrow'];
  document.querySelectorAll('.day-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setSelectedDayView(btn.dataset.dayView || 'today');
    });
  });

  setupLiquidBarScrubbing({
    barEl: document.getElementById('day-switcher-bar'),
    indicatorId: 'day-nav-indicator',
    blobId: 'day-nav-indicator-blob',
    items: dayOrderList,
    getCurrentIndex: () => dayOrderList.indexOf(state.selectedDayView),
    onSelectIndex: (idx, fromScrub) => {
      const targetDay = dayOrderList[idx];
      if (targetDay) setSelectedDayView(targetDay, { fromScrub });
    },
    direction: 'rtl',
    edgeInset: 4,
  });

  const bottomTabOrderList = ['tasks', 'focus', 'stats', 'settings'];
  setupLiquidBarScrubbing({
    barEl: document.querySelector('.tg-nav-pill'),
    indicatorId: 'tg-nav-indicator',
    blobId: 'tg-nav-indicator-blob',
    items: bottomTabOrderList,
    getCurrentIndex: () => bottomTabOrderList.indexOf(state.activeTab),
    onSelectIndex: (idx, fromScrub) => {
      const targetTab = bottomTabOrderList[idx];
      if (targetTab) switchTab(targetTab, { fromScrub });
    },
    direction: 'rtl',
    edgeInset: 4,
  });

  const islandTimerMinsList = [15, 25, 45];
  setupLiquidBarScrubbing({
    barEl: document.getElementById('island-timer-pill-group'),
    indicatorId: 'island-timer-indicator',
    blobId: 'island-timer-indicator-blob',
    items: islandTimerMinsList,
    getCurrentIndex: () => islandTimerMinsList.indexOf(state.focusDurationMinutes),
    onSelectIndex: (idx, fromScrub) => {
      const targetMin = islandTimerMinsList[idx];
      if (targetMin) setFocusDuration(targetMin, { fromScrub });
    },
    direction: 'ltr',
    edgeInset: 2,
  });

  setupLiquidBarScrubbing({
    barEl: document.getElementById('composer-day-pill-group'),
    indicatorId: 'composer-day-indicator',
    blobId: 'composer-day-indicator-blob',
    items: dayOrderList,
    getCurrentIndex: () => dayOrderList.indexOf(state.composerDay),
    onSelectIndex: (idx, fromScrub) => {
      const nextDay = dayOrderList[idx];
      if (nextDay) {
        state.composerDay = nextDay;
        updateComposerTogglesUI({ fromScrub, animateSwitches: false });
      }
    },
    direction: 'rtl',
    edgeInset: 4,
  });

  setupDynamicPillScrubbing({
    barEl: document.getElementById('task-filter-pill-bar'),
    indicatorId: 'task-filter-indicator',
    blobId: 'task-filter-indicator-blob',
    btnSelector: '.filter-chip',
    dataAttr: 'filter',
    getCurrentValue: () => state.filter,
    onSelectValue: (val, fromScrub) => setTaskFilter(val, { fromScrub }),
  });

  setupDynamicPillScrubbing({
    barEl: document.getElementById('notebook-filter-pill-bar'),
    indicatorId: 'notebook-filter-indicator',
    blobId: 'notebook-filter-indicator-blob',
    btnSelector: '.notebook-filter-chip',
    dataAttr: 'noteFilter',
    getCurrentValue: () => state.notebookFilter,
    onSelectValue: (val, fromScrub) => setNotebookFilter(val, { fromScrub }),
  });

  /* ==================== تعامل زنده، دسترس‌پذیری و ایزوله‌سازی کامل لمس لایه‌های داخلی داینامیک آیلند ==================== */
  const islandEl = document.getElementById('dynamic-island');
  const islandIdleLayerEl = document.getElementById('island-idle-layer');
  if (islandEl) {
    let islandTouchStartX = 0;
    let islandTouchStartY = 0;
    let islandGestureAxis = null; // 'vertical' | 'horizontal'
    let islandPullActive = false;
    let islandPullDx = 0;
    let islandPullDy = 0;
    let islandDetentCrossed = false;
    let islandPullRafPending = false;
    let islandSuppressClick = false;
    let islandPressReleaseTimer = null;
    let pendingIslandTransform = '';
    let pendingIdleParallaxX = 0;
    let pendingSpecularPct = 50;

    /* مهار انتشار رویدادهای لمس و کلیک در سطح کانتینر آیلند تا ژست‌های داخلی کار کنند و به صفحه نشت نکنند */
    ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointerdown', 'click'].forEach((evtName) => {
      islandEl.addEventListener(
        evtName,
        (ev) => {
          ev.stopPropagation();
        },
        { passive: true }
      );
    });

    islandIdleLayerEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (state.islandMode === 'idle') {
          setIslandMode('expanded');
          playTactileSound('pop');
          setTimeout(() => {
            document.getElementById('island-toggle-timer-btn')?.focus();
          }, 60);
        }
      }
    });

    islandEl.addEventListener('animationend', () => {
      clearIslandAnimationClasses(islandEl);
    });

    const applyIslandPullFrame = () => {
      islandPullRafPending = false;
      if (!islandPullActive) return;
      islandEl.style.transform = pendingIslandTransform;
      islandEl.style.setProperty('--island-specular-x', `${pendingSpecularPct.toFixed(1)}%`);
      if (islandIdleLayerEl && islandGestureAxis === 'horizontal') {
        islandIdleLayerEl.style.transform = `translate3d(calc(-50% + ${pendingIdleParallaxX.toFixed(2)}px), 0, 0)`;
      }
    };

    islandEl.addEventListener(
      'click',
      (e) => {
        if (islandPressReleaseTimer) {
          clearTimeout(islandPressReleaseTimer);
          islandPressReleaseTimer = null;
        }
        islandEl.classList.remove('is-island-pressing');

        if (islandSuppressClick) {
          e.stopImmediatePropagation();
          e.preventDefault();
          islandSuppressClick = false;
          return;
        }
        if (state.islandMode === 'idle') {
          setIslandMode('expanded');
          playTactileSound('pop');
          triggerHaptic(8);
        } else if (state.islandMode === 'toast' && !e.target.closest('#island-undo-btn')) {
          setIslandMode('expanded');
        }
      },
      true
    );

    islandEl.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 1 || islandEl.classList.contains('is-hidden-for-sheet')) return;
        const activeLayer = e.target.closest('.island-layer');
        if (!activeLayer || activeLayer.classList.contains('is-hidden')) {
          islandTouchStartY = 0;
          return;
        }
        if (
          state.islandMode === 'expanded' &&
          (e.target.closest('button') ||
            e.target.closest('[data-liquid-scrub-bar]') ||
            e.target.closest('#island-expanded-toast-banner'))
        ) {
          islandTouchStartY = 0;
          return;
        }
        if (islandPressReleaseTimer) {
          clearTimeout(islandPressReleaseTimer);
          islandPressReleaseTimer = null;
        }
        const t = e.touches[0];
        islandTouchStartX = t.clientX;
        islandTouchStartY = t.clientY;
        islandGestureAxis = null;
        islandPullActive = false;
        islandPullDx = 0;
        islandPullDy = 0;
        islandDetentCrossed = false;
        clearIslandAnimationClasses(islandEl);
        if (state.islandMode === 'expanded') {
          islandEl.classList.add('is-island-pressing');
        }
      },
      { passive: true }
    );

    islandEl.addEventListener(
      'touchmove',
      (e) => {
        if (!islandTouchStartY || e.touches.length !== 1) return;
        const t = e.touches[0];
        const dx = t.clientX - islandTouchStartX;
        const dy = t.clientY - islandTouchStartY;

        if (!islandPullActive) {
          if (Math.abs(dy) < 6 && Math.abs(dx) < 7) return;
          if (Math.abs(dx) > Math.abs(dy) * 1.15) {
            if (state.islandMode !== 'idle') {
              islandTouchStartY = 0;
              islandEl.classList.remove('is-island-pressing');
              return;
            }
            islandGestureAxis = 'horizontal';
          } else {
            islandGestureAxis = 'vertical';
          }
          islandPullActive = true;
          islandSuppressClick = true;
          islandEl.classList.remove('is-island-pressing');
          islandEl.classList.add('is-island-pulling', 'is-island-rim-glow');
          if (islandIdleLayerEl && islandGestureAxis === 'horizontal') {
            islandIdleLayerEl.style.transition = 'none';
          }
        }

        if (e.cancelable) e.preventDefault();
        islandPullDx = dx;
        islandPullDy = dy;

        const shellRect = islandEl.getBoundingClientRect();
        if (shellRect.width > 0) {
          pendingSpecularPct = Math.max(12, Math.min(88, ((t.clientX - shellRect.left) / shellRect.width) * 100));
        }

        let stretchX = 1;
        let stretchY = 1;
        let shiftX = 0;
        let shiftY = 0;

        if (islandGestureAxis === 'horizontal') {
          const pullH = computeIosRubberBand(dx, 70);
          shiftX = pullH * 0.42;
          stretchX = 1 + Math.abs(pullH) * 0.0024;
          stretchY = Math.max(0.96, 1 - Math.abs(pullH) * 0.0009);
          pendingIdleParallaxX = pullH * 0.24;

          const crossed = Math.abs(dx) > 36;
          if (crossed !== islandDetentCrossed) {
            islandDetentCrossed = crossed;
            triggerHaptic(7);
            playTactileSound('scrub-tick', dx < 0 ? 1 : -1);
          }
        } else if (state.islandMode === 'idle' || state.islandMode === 'toast') {
          if (dy > 0) {
            const pull = computeIosRubberBand(dy, 72);
            stretchY = 1 + pull * 0.0095;
            stretchX = 1 + pull * 0.0024;
            shiftY = pull * 0.16;

            const crossed = dy > 38;
            if (crossed !== islandDetentCrossed) {
              islandDetentCrossed = crossed;
              triggerHaptic(7);
              playTactileSound('scrub-tick', crossed ? 1 : -1);
            }
          } else {
            const push = computeIosRubberBand(Math.abs(dy), 48);
            stretchY = Math.max(0.88, 1 - push * 0.0045);
            stretchX = 1 + push * 0.0022;
            shiftY = -push * 0.12;
            islandDetentCrossed = false;
          }
        } else if (state.islandMode === 'expanded') {
          if (dy < 0) {
            const pullUp = computeIosRubberBand(Math.abs(dy), 76);
            stretchY = Math.max(0.84, 1 - pullUp * 0.0042);
            stretchX = Math.max(0.93, 1 - pullUp * 0.0018);
            shiftY = -pullUp * 0.18;

            const crossed = dy < -34;
            if (crossed !== islandDetentCrossed) {
              islandDetentCrossed = crossed;
              triggerHaptic(7);
              playTactileSound('scrub-tick', crossed ? -1 : 1);
            }
          } else {
            const pullDown = computeIosRubberBand(dy, 64);
            stretchY = 1 + pullDown * 0.0028;
            stretchX = Math.max(0.96, 1 - pullDown * 0.0012);
            shiftY = pullDown * 0.16;
            islandDetentCrossed = false;
          }
        }

        pendingIslandTransform = `translate3d(${shiftX.toFixed(2)}px, ${shiftY.toFixed(2)}px, 0) scale3d(${stretchX.toFixed(4)}, ${stretchY.toFixed(4)}, 1)`;
        if (!islandPullRafPending) {
          islandPullRafPending = true;
          requestAnimationFrame(applyIslandPullFrame);
        }
      },
      { passive: false }
    );

    const finishIslandPull = () => {
      if (!islandTouchStartY) {
        islandEl.classList.remove('is-island-pressing');
        return;
      }
      islandTouchStartY = 0;

      if (!islandPullActive) {
        /* حفظ حالت فشردگی تا لحظه اجرای click برای جلوگیری از پرش چندفریمی بین touchend و باز شدن آیلند */
        if (islandPressReleaseTimer) clearTimeout(islandPressReleaseTimer);
        islandPressReleaseTimer = setTimeout(() => {
          islandEl.classList.remove('is-island-pressing');
          islandPressReleaseTimer = null;
        }, 65);
        return;
      }

      const completedAxis = islandGestureAxis;
      islandEl.classList.remove('is-island-pressing');
      islandPullActive = false;
      islandPullRafPending = false;
      islandGestureAxis = null;
      islandEl.classList.remove('is-island-pulling', 'is-island-rim-glow');
      islandEl.style.transform = '';
      islandEl.style.setProperty('--island-specular-x', '50%');

      if (islandIdleLayerEl) {
        islandIdleLayerEl.style.transition = '';
        islandIdleLayerEl.style.transform = '';
      }

      if (completedAxis === 'horizontal' && state.islandMode === 'idle' && Math.abs(islandPullDx) > 36) {
        const stepDir = islandPullDx < 0 ? 1 : -1;
        const switchedTask = advanceSmartFocusTask(true, stepDir);
        if (switchedTask) {
          saveState();
          renderTasks();
          updateHeaderAndProgress();
          playTactileSound('nav-step', stepDir);
          triggerHaptic(10);
        }
      } else if (completedAxis === 'vertical') {
        if ((state.islandMode === 'idle' || state.islandMode === 'toast') && islandPullDy > 38) {
          setIslandMode('expanded', { skipMorph: true });
          playTactileSound('pop');
          triggerHaptic(10);
        } else if (state.islandMode === 'expanded' && islandPullDy < -34) {
          setIslandMode('idle', { skipMorph: true });
          playTactileSound('pop');
          triggerHaptic(8);
        }
      }

      setTimeout(() => {
        islandSuppressClick = false;
      }, 120);
    };

    islandEl.addEventListener('touchend', finishIslandPull);
    islandEl.addEventListener('touchcancel', finishIslandPull);
  }

  document.addEventListener('click', (e) => {
    if (state.islandMode === 'expanded' && !e.target.closest('#dynamic-island')) {
      setIslandMode('idle');
    }
  });

  document.getElementById('island-close-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    setIslandMode('idle');
    playTactileSound('pop');
  });

  document.getElementById('island-next-task-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    advanceSmartFocusTask(true);
    saveState();
    renderTasks();
    updateHeaderAndProgress();
    playTactileSound('pop');
  });

  document.getElementById('island-toggle-timer-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.focusRunning ? pauseFocusTimer() : startFocusTimer();
  });

  document.getElementById('island-reset-timer-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    resetFocusTimer();
  });

  document.getElementById('island-quick-complete-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const focusedTask = getTasksForDayView('today').find((t) => t.id === state.focusedTaskId);
    if (!focusedTask || focusedTask.completed) return;
    const nextSub = Array.isArray(focusedTask.subtasks)
      ? focusedTask.subtasks.find((s) => !s.completed)
      : null;
    if (nextSub) {
      toggleSubtask(focusedTask.id, nextSub.id, false, 'today');
    } else {
      toggleTask(focusedTask.id, false, 'today');
    }
  });

  document.getElementById('island-ambient-cycle-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const modes = ['off', 'rain', 'brown', 'nature'];
    const nextMode = modes[(modes.indexOf(state.ambientMode) + 1) % modes.length];
    setAmbientMode(nextMode);
    playTactileSound('pop');
  });

  document.getElementById('island-undo-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    executeIslandToastAction();
  });

  document.getElementById('island-expanded-undo-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    executeIslandToastAction();
  });

  document.querySelectorAll('.focus-min-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      setFocusDuration(Number(chip.dataset.focusMin) || 25);
      playTactileSound('pop');
    });
  });

  document.querySelectorAll('.ambient-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      setAmbientMode(chip.dataset.ambient || 'off');
      playTactileSound('pop');
    });
  });

  document.getElementById('focus-page-toggle-btn')?.addEventListener('click', () => {
    state.focusRunning ? pauseFocusTimer() : startFocusTimer();
  });
  document.getElementById('focus-page-reset-btn')?.addEventListener('click', resetFocusTimer);

  document.getElementById('desktop-focus-toggle-btn')?.addEventListener('click', () => {
    state.focusRunning ? pauseFocusTimer() : startFocusTimer();
  });
  document.getElementById('desktop-focus-reset-btn')?.addEventListener('click', resetFocusTimer);

  const dropzone = document.getElementById('desktop-focus-dropzone');
  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('is-drag-target');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('is-drag-target');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-drag-target');
      const taskId = draggedTaskId || e.dataTransfer?.getData('text/plain');
      if (taskId) setFocusedTask(taskId);
    });
  }

  document.querySelectorAll('.tg-nav-btn, .rail-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab) switchTab(btn.dataset.tab);
    });
  });

  const fabBtn = document.getElementById('fab-quick-add-btn');
  fabBtn?.addEventListener('click', () => {
    triggerFabLiquidPop(fabBtn);
    openTaskComposer();
  });
  document.getElementById('rail-new-task-btn')?.addEventListener('click', () => openTaskComposer());
  document.getElementById('rail-avatar-btn')?.addEventListener('click', openProfileModal);
  document.getElementById('header-avatar-btn')?.addEventListener('click', openProfileModal);
  document.getElementById('rail-cmd-btn')?.addEventListener('click', openCommandPalette);
  document.getElementById('rail-theme-btn')?.addEventListener('click', () => {
    state.colorMode = state.colorMode === 'dark' ? 'light' : 'dark';
    applyThemePreferences();
    saveState();
    playTactileSound('pop');
  });

  document.getElementById('privacy-quick-btn')?.addEventListener('click', () => {
    state.privacyBlur = !state.privacyBlur;
    saveState();
    renderTasks();
    renderQuickNotes();
    renderNotebookModalList();
    updateHeaderAndProgress();
    playTactileSound('pop');
  });

  document.getElementById('sound-toggle-btn')?.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    saveState();
    updateHeaderAndProgress();
    if (state.soundEnabled) playTactileSound('pop');
  });

  const searchInput = document.getElementById('search-tasks-input');
  const clearSearchBtn = document.getElementById('clear-search-btn');
  searchInput?.addEventListener('input', () => {
    state.searchQuery = searchInput.value;
    const hasText = state.searchQuery.trim().length > 0;
    clearSearchBtn?.classList.toggle('hidden', !hasText);
    clearSearchBtn?.classList.toggle('flex', hasText);
    renderTasks();
  });

  clearSearchBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    state.searchQuery = '';
    clearSearchBtn.classList.add('hidden');
    clearSearchBtn.classList.remove('flex');
    renderTasks();
  });

  document.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const nextFilter = chip.dataset.filter || 'all';
      const filterOrder = ['all', 'active', 'completed', 'urgent', 'habit'];
      const stepDir = filterOrder.indexOf(nextFilter) - filterOrder.indexOf(state.filter);
      setTaskFilter(nextFilter);
      playTactileSound('nav-step', stepDir);
    });
  });

  const handleClearCompleted = () => {
    const activeDayKey = getDayKeyForView(state.selectedDayView);
    const before = state.tasks.length;
    state.tasks = state.tasks.filter((t) => {
      if (t.isHabit) return true;
      const taskDay = t.scheduledDate || getTodayKey();
      if (taskDay === activeDayKey && t.completed) return false;
      return true;
    });
    if (state.tasks.length === before) return;
    const next = getSmartFocusCandidate();
    state.focusedTaskId = next ? next.id : null;
    if (state.focusRunning) scheduleFocusEndNotification();
    saveState();
    renderTasks();
    updateHeaderAndProgress();
    playTactileSound('delete');
    triggerIslandToast('🧹', 'کارهای تکمیل‌شده حذف شدند');
  };

  document.getElementById('clear-completed-btn')?.addEventListener('click', handleClearCompleted);
  document.getElementById('clear-completed-desktop-btn')?.addEventListener('click', handleClearCompleted);

  document.getElementById('close-desktop-inspector-btn')?.addEventListener('click', closeDesktopInspector);
  document.getElementById('inspector-focus-btn')?.addEventListener('click', () => {
    if (state.inspectedTaskId) setFocusedTask(state.inspectedTaskId);
  });
  document.getElementById('inspector-delete-btn')?.addEventListener('click', () => {
    if (state.inspectedTaskId) deleteTask(state.inspectedTaskId);
  });

  document.querySelectorAll('.inspector-day-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const task = state.tasks.find((t) => t.id === state.inspectedTaskId);
      if (!task || task.isHabit) return;
      const targetDayView = btn.dataset.inspectorDay || 'today';
      task.scheduledDate = getDayKeyForView(targetDayView);
      saveState();
      renderDesktopInspector();
      renderTasks();
      setSelectedDayView(targetDayView);
      playTactileSound('pop');
    });
  });

  document.getElementById('inspector-title-input')?.addEventListener('input', (e) => {
    const task = state.tasks.find((t) => t.id === state.inspectedTaskId);
    const val = e.target.value.trim();
    if (task && val) {
      task.title = val;
      if (state.focusRunning && state.focusedTaskId === task.id) {
        scheduleFocusEndNotification();
      }
      saveState();
      renderTasks();
      updateHeaderAndProgress();
    }
  });

  document.getElementById('inspector-desc-input')?.addEventListener('input', (e) => {
    const task = state.tasks.find((t) => t.id === state.inspectedTaskId);
    if (task) {
      task.description = e.target.value.trim();
      saveState();
      renderTasks();
      updateHeaderAndProgress();
    }
  });

  document.getElementById('inspector-urgent-btn')?.addEventListener('click', () => {
    const task = state.tasks.find((t) => t.id === state.inspectedTaskId);
    if (!task) return;
    task.urgent = !task.urgent;
    saveState();
    renderDesktopInspector();
    renderTasks();
    updateHeaderAndProgress();
    playTactileSound('pop');
  });

  document.getElementById('inspector-habit-btn')?.addEventListener('click', () => {
    const task = state.tasks.find((t) => t.id === state.inspectedTaskId);
    if (!task) return;
    task.isHabit = !task.isHabit;
    if (task.isHabit) {
      task.scheduledDate = getTodayKey();
      syncHabitDaySnapshot(task, getTodayKey());
    }
    saveState();
    renderDesktopInspector();
    renderTasks();
    updateHeaderAndProgress();
    playTactileSound('pop');
  });

  const addInspectorSubtask = () => {
    const task = state.tasks.find((t) => t.id === state.inspectedTaskId);
    const input = document.getElementById('inspector-subtask-input');
    if (!task || !input) return;
    const clean = input.value.trim();
    if (!clean) return;
    if (!Array.isArray(task.subtasks)) task.subtasks = [];
    task.subtasks.push({
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      title: clean,
      completed: false,
    });
    input.value = '';
    saveState();
    renderDesktopInspector();
    renderTasks();
    updateHeaderAndProgress();
    playTactileSound('pop');
  };

  document.getElementById('inspector-add-subtask-btn')?.addEventListener('click', addInspectorSubtask);
  document.getElementById('inspector-subtask-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addInspectorSubtask();
    }
  });

  /* ==================== رویدادهای دفترچه یادداشت ==================== */
  document.getElementById('quick-note-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = document.getElementById('quick-note-input');
    if (!inp) return;
    addQuickNote(inp.value);
    inp.value = '';
  });

  document.getElementById('open-notebook-header-btn')?.addEventListener('click', openNotebookModal);
  document.getElementById('open-notebook-btn')?.addEventListener('click', openNotebookModal);
  document.getElementById('view-all-notes-footer-btn')?.addEventListener('click', openNotebookModal);
  document.getElementById('new-notebook-entry-card-btn')?.addEventListener('click', () => {
    openNoteEditorModal(null);
  });

  document.getElementById('close-notebook-modal')?.addEventListener('click', () => closeModal('notebook-modal'));
  document.getElementById('notebook-new-note-btn')?.addEventListener('click', () => {
    openNoteEditorModal(null);
  });

  const nbSearchInput = document.getElementById('notebook-search-input');
  const clearNbSearchBtn = document.getElementById('clear-notebook-search-btn');
  nbSearchInput?.addEventListener('input', () => {
    state.notebookSearchQuery = nbSearchInput.value;
    const hasText = state.notebookSearchQuery.trim().length > 0;
    clearNbSearchBtn?.classList.toggle('hidden', !hasText);
    clearNbSearchBtn?.classList.toggle('flex', hasText);
    renderNotebookModalList();
  });

  clearNbSearchBtn?.addEventListener('click', () => {
    if (nbSearchInput) nbSearchInput.value = '';
    state.notebookSearchQuery = '';
    clearNbSearchBtn.classList.add('hidden');
    clearNbSearchBtn.classList.remove('flex');
    renderNotebookModalList();
  });

  document.querySelectorAll('.notebook-filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const nextFilter = chip.dataset.noteFilter || 'all';
      const filterOrder = ['all', 'pinned', 'idea', 'quote', 'later', 'general'];
      const stepDir = filterOrder.indexOf(nextFilter) - filterOrder.indexOf(state.notebookFilter);
      setNotebookFilter(nextFilter);
      playTactileSound('nav-step', stepDir);
    });
  });

  document.getElementById('close-note-editor-modal')?.addEventListener('click', () => closeModal('note-editor-modal'));
  document.querySelectorAll('.note-tag-choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.draftNoteTag = btn.dataset.editorTag || 'general';
      updateNoteEditorControlsUI();
      playTactileSound('pop');
    });
  });

  document.getElementById('note-editor-pin-btn')?.addEventListener('click', () => {
    state.draftNotePinned = !state.draftNotePinned;
    updateNoteEditorControlsUI();
    playTactileSound('pop');
  });

  document.getElementById('note-editor-title-input')?.addEventListener('input', updateNoteEditorControlsUI);
  document.getElementById('note-editor-body-input')?.addEventListener('input', updateNoteEditorControlsUI);

  document.getElementById('note-editor-copy-btn')?.addEventListener('click', () => {
    if (state.editingNoteId) copyNotebookEntryText(state.editingNoteId);
  });

  document.getElementById('note-editor-promote-btn')?.addEventListener('click', () => {
    const titleVal = document.getElementById('note-editor-title-input')?.value.trim() || '';
    const bodyVal = document.getElementById('note-editor-body-input')?.value.trim() || '';
    if (!titleVal && !bodyVal) return;
    const lines = bodyVal.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const taskTitle = titleVal || lines[0] || bodyVal;
    const taskDesc = titleVal ? bodyVal : lines.slice(1).join(' • ');
    addTask(taskTitle.slice(0, 140), { description: taskDesc.slice(0, 180), dayView: 'today' });
  });

  document.getElementById('note-editor-delete-btn')?.addEventListener('click', () => {
    const idToDel = state.editingNoteId;
    closeModal('note-editor-modal');
    if (idToDel) deleteQuickNote(idToDel);
  });

  document.getElementById('note-editor-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const titleVal = document.getElementById('note-editor-title-input')?.value.trim() || '';
    const bodyVal = document.getElementById('note-editor-body-input')?.value.trim() || '';
    if (!titleVal && !bodyVal) {
      triggerIslandToast('⚠️', 'لطفاً عنوان یا متن یادداشت را بنویس');
      return;
    }

    const now = Date.now();
    if (state.editingNoteId) {
      const existing = state.quickNotes.find((n) => n.id === state.editingNoteId);
      if (existing) {
        existing.title = titleVal;
        existing.text = bodyVal;
        existing.tag = NOTE_TAGS[state.draftNoteTag] ? state.draftNoteTag : 'general';
        existing.pinned = Boolean(state.draftNotePinned);
        existing.updatedAt = now;
      }
      saveState();
      renderQuickNotes();
      renderNotebookModalList();
      closeModal('note-editor-modal');
      playTactileSound('complete');
      triggerIslandToast('✅', 'تغییرات یادداشت ذخیره شد');
    } else {
      state.quickNotes.unshift({
        id: `note_${now}_${Math.random().toString(36).slice(2, 6)}`,
        title: titleVal,
        text: bodyVal,
        tag: NOTE_TAGS[state.draftNoteTag] ? state.draftNoteTag : 'general',
        pinned: Boolean(state.draftNotePinned),
        createdAt: now,
        updatedAt: now,
      });
      saveState();
      renderQuickNotes();
      renderNotebookModalList();
      closeModal('note-editor-modal');
      playTactileSound('complete');
      triggerIslandToast('📓', 'یادداشت جدید در دفترچه ثبت شد');
    }
  });

  document.querySelectorAll('.radar-axis-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const axis = btn.dataset.radarAxis;
      state.selectedRadarAxis = state.selectedRadarAxis === axis ? 'all' : axis;
      renderSmartRadarChart();
      playTactileSound('pop');
    });
  });

  document.getElementById('radar-reset-axis-btn')?.addEventListener('click', () => {
    state.selectedRadarAxis = 'all';
    renderSmartRadarChart();
    playTactileSound('pop');
  });

  document.getElementById('tg-top-sync-btn')?.addEventListener('click', openSyncModal);
  document.getElementById('tg-row-storage')?.addEventListener('click', openSyncModal);
  document.getElementById('tg-top-export-btn')?.addEventListener('click', exportBackupJsonFile);
  document.getElementById('download-json-modal-btn')?.addEventListener('click', exportBackupJsonFile);

  const toggleColorMode = () => {
    state.colorMode = state.colorMode === 'dark' ? 'light' : 'dark';
    applyThemePreferences();
    saveState();
    playTactileSound('pop');
  };
  document.getElementById('tg-top-mode-btn')?.addEventListener('click', toggleColorMode);
  document.getElementById('tg-switch-day-night-btn')?.addEventListener('click', toggleColorMode);

  document.getElementById('tg-row-gpu-mode')?.addEventListener('click', () => {
    const modes = ['auto', 'ultra', 'balanced', 'performance'];
    state.gpuQualityMode = modes[(modes.indexOf(state.gpuQualityMode) + 1) % modes.length];
    applyAdaptiveRenderCalibration();
    saveState();
    playTactileSound('pop');
  });

  document.getElementById('tg-top-cleanup-btn')?.addEventListener('click', () => openModal('cleanup-modal'));
  document.getElementById('tg-row-cleanup')?.addEventListener('click', () => openModal('cleanup-modal'));

  document.getElementById('tg-profile-avatar-btn')?.addEventListener('click', openProfileModal);
  document.getElementById('tg-row-profile')?.addEventListener('click', openProfileModal);

  document.getElementById('tg-row-appearance')?.addEventListener('click', () => {
    document.getElementById('tg-settings-main')?.classList.add('hidden');
    const sub = document.getElementById('tg-appearance-subpage');
    sub?.classList.remove('hidden');
    sub?.classList.add('flex');
    updateGpuSettingsLabels();
    if (typeof syncBackLayerCallback === 'function') {
      syncBackLayerCallback();
    }
    playTactileSound('pop');
  });

  document.getElementById('tg-appearance-back-btn')?.addEventListener('click', () => {
    const sub = document.getElementById('tg-appearance-subpage');
    sub?.classList.add('hidden');
    sub?.classList.remove('flex');
    document.getElementById('tg-settings-main')?.classList.remove('hidden');
    if (typeof syncBackLayerCallback === 'function') {
      syncBackLayerCallback();
    }
    playTactileSound('pop');
  });

  document.querySelectorAll('.accent-card-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (ACCENT_PALETTES[btn.dataset.accent]) {
        state.accentTheme = btn.dataset.accent;
        applyThemePreferences();
        saveState();
        playTactileSound('pop');
      }
    });
  });

  document.getElementById('card-radius-slider')?.addEventListener('input', (e) => {
    state.cardRadius = Number(e.target.value) || 24;
    applyThemePreferences();
    saveState();
  });

  document.getElementById('tg-row-daily-goal')?.addEventListener('click', () => {
    const goals = [3, 5, 8, 10, 12];
    state.dailyGoal = goals[(goals.indexOf(state.dailyGoal) + 1) % goals.length];
    saveState();
    updateHeaderAndProgress();
    renderSecondaryTabViews();
    playTactileSound('pop');
  });

  document.getElementById('tg-row-focus-duration')?.addEventListener('click', () => {
    const durations = [15, 25, 45, 60];
    const nextDur = durations[(durations.indexOf(state.focusDurationMinutes) + 1) % durations.length];
    setFocusDuration(nextDur);
    playTactileSound('pop');
  });

  document.getElementById('tg-row-default-category')?.addEventListener('click', () => {
    const folders = getAllFolders();
    const curIdx = folders.findIndex((f) => f.name === state.selectedCategory);
    state.selectedCategory = folders[(curIdx + 1) % folders.length]?.name || 'شخصی';
    saveState();
    renderSecondaryTabViews();
    playTactileSound('pop');
  });

  document.getElementById('tg-row-manage-folders')?.addEventListener('click', openFoldersModal);

  document.getElementById('tg-row-autosort')?.addEventListener('click', () => {
    state.autoSortCompleted = !state.autoSortCompleted;
    setTgSwitchState(document.getElementById('tg-switch-autosort'), state.autoSortCompleted, true);
    saveState();
    renderTasks();
    renderSecondaryTabViews();
    playTactileSound('pop');
  });

  document.getElementById('tg-row-notif-permission')?.addEventListener('click', async () => {
    const status = getNotificationPermissionStatus();
    playTactileSound('pop');
    if (status === 'needs_apk_update') {
      triggerIslandToast('📲', 'ابتدا نسخه جدید APK ساخته‌شده در گیت‌هاب را نصب کن', { duration: 3600 });
      return;
    }
    if (isNativeAndroidApp()) {
      if (status === 'granted') {
        try {
          window.AndroidNative.openNotificationSettings?.();
        } catch (e) {}
      } else {
        await requestAppNotificationPermission();
        setTimeout(() => {
          if (getNotificationPermissionStatus() !== 'granted') {
            try {
              window.AndroidNative.openNotificationSettings?.();
            } catch (e) {}
          }
        }, 450);
      }
      return;
    }
    const ok = await requestAppNotificationPermission();
    if (ok) {
      triggerIslandToast('🔔', 'مجوز اعلان مرورگر فعال شد');
    }
  });

  document.getElementById('tg-row-daily-reminder-toggle')?.addEventListener('click', async () => {
    const nextEnabled = !state.dailyReminderEnabled;
    if (nextEnabled) {
      const perm = getNotificationPermissionStatus();
      if (perm !== 'granted' && perm !== 'needs_apk_update') {
        await requestAppNotificationPermission();
      }
    }
    state.dailyReminderEnabled = nextEnabled;
    setTgSwitchState(document.getElementById('tg-switch-daily-reminder'), nextEnabled, true);
    saveState();
    syncDailyStreakReminderNotification(false, true);
    updateNotificationSettingsUI();
    playTactileSound('pop');
    if (!nextEnabled) {
      triggerIslandToast('🔕', 'یادآور روزانه خاموش شد');
    }
  });

  const dailyReminderTimeInput = document.getElementById('daily-reminder-time-input');
  document.getElementById('tg-row-daily-reminder-time')?.addEventListener('click', (e) => {
    if (e.target === dailyReminderTimeInput) return;
    if (dailyReminderTimeInput) {
      try {
        if (typeof dailyReminderTimeInput.showPicker === 'function') {
          dailyReminderTimeInput.showPicker();
        } else {
          dailyReminderTimeInput.focus();
          dailyReminderTimeInput.click();
        }
      } catch (err) {
        dailyReminderTimeInput.focus();
      }
    }
  });

  dailyReminderTimeInput?.addEventListener('change', async () => {
    const val = dailyReminderTimeInput.value;
    if (!val || !/^\d{2}:\d{2}$/.test(val)) return;
    state.dailyReminderTime = val;
    if (!state.dailyReminderEnabled) {
      state.dailyReminderEnabled = true;
      const perm = getNotificationPermissionStatus();
      if (perm !== 'granted' && perm !== 'needs_apk_update') {
        await requestAppNotificationPermission();
      }
    }
    saveState();
    syncDailyStreakReminderNotification(false, true);
    updateNotificationSettingsUI();
    playTactileSound('complete');
  });

  document.getElementById('tg-row-exact-alarm')?.addEventListener('click', () => {
    playTactileSound('pop');
    if (isNativeAndroidApp() && typeof window.AndroidNative.openExactAlarmSettings === 'function') {
      try {
        window.AndroidNative.openExactAlarmSettings();
      } catch (e) {}
    }
  });

  document.getElementById('tg-row-test-notification')?.addEventListener('click', async () => {
    const status = getNotificationPermissionStatus();
    if (status === 'needs_apk_update') {
      triggerIslandToast('📲', 'برای ارسال اعلان بومی، APK جدید را نصب کن', { duration: 3600 });
      return;
    }
    if (status !== 'granted') {
      pendingTestNotificationAfterGrant = true;
      const granted = await requestAppNotificationPermission();
      if (granted) {
        pendingTestNotificationAfterGrant = false;
        sendTestAppNotification();
      }
      return;
    }
    sendTestAppNotification();
  });

  document.getElementById('tg-row-privacy')?.addEventListener('click', () => {
    state.privacyBlur = !state.privacyBlur;
    setTgSwitchState(document.getElementById('tg-switch-privacy'), state.privacyBlur, true);
    saveState();
    renderTasks();
    renderQuickNotes();
    renderNotebookModalList();
    updateHeaderAndProgress();
    renderSecondaryTabViews();
    playTactileSound('pop');
  });

  document.getElementById('tg-row-sound')?.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    setTgSwitchState(document.getElementById('tg-switch-sound'), state.soundEnabled, true);
    saveState();
    updateHeaderAndProgress();
    renderSecondaryTabViews();
    if (state.soundEnabled) playTactileSound('pop');
  });

  document.getElementById('close-profile-modal')?.addEventListener('click', () => closeModal('profile-modal'));
  document.querySelectorAll('.avatar-choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.draftAvatar = btn.dataset.avatar || '🧑‍💻';
      state.draftPhotoDataUrl = '';
      updateProfileModalPreview();
      playTactileSound('pop');
    });
  });

  document.getElementById('avatar-photo-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 180;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        state.draftPhotoDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        updateProfileModalPreview();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('remove-avatar-photo-btn')?.addEventListener('click', () => {
    state.draftPhotoDataUrl = '';
    updateProfileModalPreview();
  });

  document.getElementById('profile-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameVal = document.getElementById('profile-name-input')?.value.trim();
    const bioVal = document.getElementById('profile-bio-input')?.value.trim();
    state.profile.name = nameVal || 'دوست من';
    state.profile.bio = bioVal || 'تمرکز عمیق و پیشرفت روزانه';
    state.profile.avatar = state.draftAvatar || '🧑‍💻';
    state.profile.photoDataUrl = state.draftPhotoDataUrl || '';
    saveState();
    updateHeaderAndProgress();
    if (state.activeTab === 'settings') renderSecondaryTabViews();
    closeModal('profile-modal');
    playTactileSound('complete');
    triggerIslandToast('✨', 'پروفایل شما به‌روزرسانی شد');
  });

  document.getElementById('close-sync-modal')?.addEventListener('click', () => closeModal('sync-modal'));
  document.getElementById('copy-sync-code-btn')?.addEventListener('click', () => {
    const box = document.getElementById('sync-code-box');
    if (!box) return;
    const onCopied = () => {
      triggerIslandToast('📋', 'کد انتقال در حافظه کپی شد');
      playTactileSound('complete');
    };
    const legacyCopy = () => {
      box.focus();
      box.select();
      box.setSelectionRange(0, box.value.length);
      try {
        if (document.execCommand('copy')) {
          onCopied();
        } else {
          triggerIslandToast('⚠️', 'کد را به‌صورت دستی انتخاب و کپی کن');
        }
      } catch (e) {
        triggerIslandToast('⚠️', 'کد را به‌صورت دستی انتخاب و کپی کن');
      }
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(box.value).then(onCopied).catch(legacyCopy);
    } else {
      legacyCopy();
    }
  });

  const applyImportedBackupPayload = (imported) => {
    if (!imported || typeof imported !== 'object') {
      throw new Error('INVALID_BACKUP_OBJECT');
    }
    const hasKnownField =
      Array.isArray(imported.tasks) ||
      Array.isArray(imported.customFolders) ||
      Array.isArray(imported.quickNotes) ||
      (imported.profile && typeof imported.profile === 'object');
    if (!hasKnownField) {
      throw new Error('UNRECOGNIZED_BACKUP_SCHEMA');
    }

    const today = getTodayKey();
    if (Array.isArray(imported.tasks)) {
      state.tasks = imported.tasks.map((t) => ({
        ...t,
        scheduledDate: t.scheduledDate || today,
      }));
    }
    if (Array.isArray(imported.customFolders)) state.customFolders = imported.customFolders;
    if (Array.isArray(imported.quickNotes)) {
      state.quickNotes = imported.quickNotes
        .map((n, idx) => normalizeNoteEntry(n, idx))
        .filter(Boolean);
    }
    if (typeof imported.selectedCategory === 'string') state.selectedCategory = imported.selectedCategory;
    if (typeof imported.dailyGoal === 'number') state.dailyGoal = imported.dailyGoal;
    if (typeof imported.dailyReminderEnabled === 'boolean') {
      state.dailyReminderEnabled = imported.dailyReminderEnabled;
    }
    if (typeof imported.dailyReminderTime === 'string' && /^\d{2}:\d{2}$/.test(imported.dailyReminderTime)) {
      state.dailyReminderTime = imported.dailyReminderTime;
    }
    if (ACCENT_PALETTES[imported.accentTheme]) state.accentTheme = imported.accentTheme;
    if (imported.colorMode === 'light' || imported.colorMode === 'dark') state.colorMode = imported.colorMode;
    if (typeof imported.cardRadius === 'number') state.cardRadius = imported.cardRadius;
    if (typeof imported.autoSortCompleted === 'boolean') state.autoSortCompleted = imported.autoSortCompleted;
    if (typeof imported.privacyBlur === 'boolean') state.privacyBlur = imported.privacyBlur;
    if (typeof imported.soundEnabled === 'boolean') state.soundEnabled = imported.soundEnabled;
    if (imported.dailyHistory && typeof imported.dailyHistory === 'object') state.dailyHistory = imported.dailyHistory;
    if (typeof imported.lastHabitResetDay === 'string') state.lastHabitResetDay = imported.lastHabitResetDay;
    if (imported.profile && typeof imported.profile === 'object') {
      state.profile = { ...state.profile, ...imported.profile };
    }
    if (imported.streak && typeof imported.streak === 'object') {
      state.streak = { ...state.streak, ...imported.streak };
    }

    const next = getSmartFocusCandidate();
    state.focusedTaskId = next ? next.id : null;
    if (state.focusRunning) scheduleFocusEndNotification();
    saveState();
    syncDailyStreakReminderNotification(true, true);
    applyThemePreferences();
    renderFolderFilterChips();
    renderTasks();
    renderQuickNotes();
    renderNotebookModalList();
    updateHeaderAndProgress();
    if (state.activeTab === 'stats' || state.activeTab === 'settings') renderSecondaryTabViews();
    closeModal('sync-modal');
    playTactileSound('complete');
    triggerIslandToast('✅', 'داده‌ها با موفقیت بازیابی شدند');
  };

  document.getElementById('import-json-file-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = decodeSyncCode(reader.result);
        applyImportedBackupPayload(parsed);
      } catch (err) {
        triggerIslandToast('⚠️', 'فایل پشتیبان JSON نامعتبر است');
      } finally {
        e.target.value = '';
      }
    };
    reader.onerror = () => {
      e.target.value = '';
      triggerIslandToast('⚠️', 'خطا در خواندن فایل پشتیبان');
    };
    reader.readAsText(file, 'UTF-8');
  });

  document.getElementById('paste-import-code-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('import-code-input');
    if (!input) return;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.trim()) {
          input.value = clipText.trim();
          playTactileSound('pop');
          return;
        }
      }
    } catch (e) {}
    input.focus();
    triggerIslandToast('📋', 'متن را در کادر بالا Paste کن');
  });

  document.getElementById('apply-import-code-btn')?.addEventListener('click', () => {
    const input = document.getElementById('import-code-input');
    if (!input || !input.value.trim()) return;
    try {
      const imported = decodeSyncCode(input.value);
      applyImportedBackupPayload(imported);
    } catch (e) {
      triggerIslandToast('⚠️', 'کد انتقال یا متن JSON نامعتبر است');
    }
  });

  document.getElementById('close-cleanup-modal')?.addEventListener('click', () => closeModal('cleanup-modal'));
  document.getElementById('cleanup-completed-action')?.addEventListener('click', () => {
    handleClearCompleted();
    closeModal('cleanup-modal');
  });
  document.getElementById('cleanup-reset-sample-action')?.addEventListener('click', () => {
    state.tasks = getDefaultSampleTasks();
    state.focusedTaskId = state.tasks[0]?.id || null;
    if (state.focusRunning) scheduleFocusEndNotification();
    saveState();
    renderTasks();
    setSelectedDayView('today');
    updateHeaderAndProgress();
    if (state.activeTab === 'stats' || state.activeTab === 'settings') renderSecondaryTabViews();
    closeModal('cleanup-modal');
    playTactileSound('pop');
    triggerIslandToast('🔄', 'تسک‌های نمونه بازیابی شدند');
  });

  document.getElementById('close-task-edit-modal')?.addEventListener('click', () => closeModal('task-edit-modal'));
  document.querySelectorAll('.edit-day-choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.draftEditDay = btn.dataset.editDay || 'today';
      renderTaskEditModalControls();
      playTactileSound('pop');
    });
  });
  document.getElementById('edit-task-urgent-btn')?.addEventListener('click', () => {
    state.draftEditUrgent = !state.draftEditUrgent;
    renderTaskEditModalControls();
    playTactileSound('pop');
  });
  document.getElementById('edit-task-habit-btn')?.addEventListener('click', () => {
    state.draftEditHabit = !state.draftEditHabit;
    renderTaskEditModalControls();
    playTactileSound('pop');
  });
  document.getElementById('add-subtask-btn')?.addEventListener('click', addSubtaskFromEditModal);
  document.getElementById('new-subtask-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSubtaskFromEditModal();
    }
  });
  document.getElementById('delete-editing-task-btn')?.addEventListener('click', () => {
    const idToDel = state.editingTaskId;
    closeModal('task-edit-modal');
    if (idToDel) deleteTask(idToDel);
  });
  document.getElementById('task-edit-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const task = state.tasks.find((t) => t.id === state.editingTaskId);
    if (!task) return;
    const newTitle = document.getElementById('edit-task-title-input')?.value.trim();
    const newDesc = document.getElementById('edit-task-desc-input')?.value.trim();
    if (newTitle) task.title = newTitle;
    task.description = newDesc || '';
    task.category = state.draftEditCategory || 'شخصی';
    task.urgent = state.draftEditUrgent;
    task.isHabit = state.draftEditHabit;
    let nextView = state.selectedDayView;
    if (task.isHabit) {
      task.scheduledDate = getTodayKey();
      syncHabitDaySnapshot(task, getTodayKey());
    } else {
      task.scheduledDate = getDayKeyForView(state.draftEditDay || 'today');
      nextView = state.draftEditDay || 'today';
    }
    if (state.focusRunning && state.focusedTaskId === task.id) {
      scheduleFocusEndNotification();
    }
    saveState();
    renderTasks();
    if (state.selectedDayView !== nextView) {
      setSelectedDayView(nextView);
    } else {
      updateHeaderAndProgress();
    }
    if (state.activeTab === 'stats') renderSecondaryTabViews();
    closeModal('task-edit-modal');
    playTactileSound('complete');
    triggerIslandToast('✅', 'تغییرات کار ذخیره شد');
  });

  document.getElementById('close-folders-modal')?.addEventListener('click', () => closeModal('folders-modal'));
  document.querySelectorAll('.folder-emoji-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.draftFolderEmoji = chip.dataset.folderEmoji || '🎓';
      renderCustomFoldersManageList();
      playTactileSound('pop');
    });
  });
  document.getElementById('custom-folder-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = document.getElementById('custom-folder-name-input');
    const name = inp?.value.trim();
    if (!name) return;
    const exists = getAllFolders().some((f) => f.name === name);
    if (exists) {
      triggerIslandToast('⚠️', 'پوشه‌ای با این نام وجود دارد');
      return;
    }
    state.customFolders.push({ name, emoji: state.draftFolderEmoji || '📁', builtIn: false });
    if (inp) inp.value = '';
    saveState();
    renderFolderFilterChips();
    renderCustomFoldersManageList();
    if (state.activeTab === 'settings') renderSecondaryTabViews();
    playTactileSound('complete');
    triggerIslandToast('📁', `پوشه «${name}» ساخته شد`);
  });

  document.getElementById('composer-title-input')?.addEventListener('input', updateComposerSmartBadges);
  document.getElementById('composer-desc-input')?.addEventListener('input', updateComposerSmartBadges);

  document.querySelectorAll('.composer-day-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const nextDay = chip.dataset.composerDay || 'today';
      const oldIdx = dayOrderList.indexOf(state.composerDay);
      const newIdx = dayOrderList.indexOf(nextDay);
      state.composerDay = nextDay;
      updateComposerTogglesUI({ animateSwitches: false });
      if (oldIdx !== newIdx) {
        triggerBlobStretch(document.getElementById('composer-day-indicator-blob'), Math.abs(newIdx - oldIdx));
        playTactileSound('nav-step', newIdx - oldIdx);
      } else {
        playTactileSound('pop');
      }
    });
  });

  document.getElementById('composer-add-option-btn')?.addEventListener('click', () => {
    if (state.composerSubtasks.length >= 12) return;
    state.composerSubtasks.push('');
    renderComposerSubtasks();
    playTactileSound('pop');
    setTimeout(() => {
      const inputs = document.querySelectorAll('[data-composer-sub-idx]');
      inputs[inputs.length - 1]?.focus();
    }, 40);
  });

  document.getElementById('composer-row-category')?.addEventListener('click', () => {
    const folders = getAllFolders();
    const idx = folders.findIndex((f) => f.name === state.composerCategory);
    state.composerCategory = folders[(idx + 1) % folders.length]?.name || 'شخصی';
    updateComposerTogglesUI({ animateSwitches: false });
    updateComposerSmartBadges();
    playTactileSound('pop');
  });

  document.getElementById('composer-row-autocomplete')?.addEventListener('click', () => {
    state.composerAutoComplete = !state.composerAutoComplete;
    updateComposerTogglesUI({ animateSwitches: true });
    playTactileSound('pop');
  });

  document.getElementById('composer-row-urgent')?.addEventListener('click', () => {
    state.composerUrgent = !state.composerUrgent;
    updateComposerTogglesUI({ animateSwitches: true });
    updateComposerSmartBadges();
    playTactileSound('pop');
  });

  document.getElementById('composer-row-habit')?.addEventListener('click', () => {
    state.composerHabit = !state.composerHabit;
    updateComposerTogglesUI({ animateSwitches: true });
    updateComposerSmartBadges();
    playTactileSound('pop');
  });

  const submitComposerForm = () => {
    const title = document.getElementById('composer-title-input')?.value.trim();
    if (!title) return;
    const description = document.getElementById('composer-desc-input')?.value.trim() || '';
    const cleanSubs = state.composerSubtasks.map((s) => s.trim()).filter(Boolean);
    const taskOptions = {
      description,
      dayView: state.composerDay,
      category: state.composerCategory,
      urgent: state.composerUrgent,
      isHabit: state.composerHabit,
      autoCompleteSubtasks: state.composerAutoComplete,
      subtasks: cleanSubs,
    };

    closeModal('task-composer-modal');
    requestAnimationFrame(() => {
      addTask(title, taskOptions);
    });
  };

  document.getElementById('task-composer-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitComposerForm();
  });

  const cmdInput = document.getElementById('command-palette-input');
  cmdInput?.addEventListener('input', () => {
    cmdSelectedIndex = 0;
    renderCommandPaletteList(cmdInput.value);
  });

  cmdInput?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentCmdItems.length > 0) {
        cmdSelectedIndex = (cmdSelectedIndex + 1) % currentCmdItems.length;
        renderCommandPaletteList(cmdInput.value);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentCmdItems.length > 0) {
        cmdSelectedIndex = (cmdSelectedIndex - 1 + currentCmdItems.length) % currentCmdItems.length;
        renderCommandPaletteList(cmdInput.value);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = currentCmdItems[cmdSelectedIndex];
      if (item) item.action();
    }
  });

  [
    'profile-modal',
    'sync-modal',
    'cleanup-modal',
    'task-edit-modal',
    'folders-modal',
    'task-composer-modal',
    'command-palette-modal',
    'notebook-modal',
    'note-editor-modal',
  ].forEach((modalId) => {
    const el = document.getElementById(modalId);
    el?.addEventListener('click', (e) => {
      if (e.target === el) closeModal(modalId);
    });
  });

  setupSheetSwipeToClose('task-edit-modal');
  setupSheetSwipeToClose('notebook-modal');
  setupSheetSwipeToClose('note-editor-modal');

  document.addEventListener('keydown', (e) => {
    const tag = (e.target?.tagName || '').toLowerCase();
    const isTyping = tag === 'input' || tag === 'textarea';

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
      return;
    }

    if (e.key === 'Escape') {
      if (state.islandMode === 'expanded') {
        setIslandMode('idle');
      }
      if (!document.getElementById('note-editor-modal')?.classList.contains('hidden')) {
        closeModal('note-editor-modal');
        return;
      }
      [
        'profile-modal',
        'sync-modal',
        'cleanup-modal',
        'task-edit-modal',
        'folders-modal',
        'task-composer-modal',
        'command-palette-modal',
        'notebook-modal',
      ].forEach(closeModal);
      return;
    }

    if (!isTyping && (e.key.toLowerCase() === 'n' || e.key === 'د')) {
      e.preventDefault();
      openTaskComposer();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
