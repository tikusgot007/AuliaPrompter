#!/usr/bin/env node
'use strict';

const { stdin, stdout, exit, argv, cwd } = process;
const readline = require('readline');

const isTTY = stdin.isTTY;

const rl = readline.createInterface({
  input: stdin,
  output: stdout,
  terminal: isTTY,
  historySize: 100,
  prompt: '',
});

const lineQueue = [];
const waiters = [];

rl.on('line', (line) => {
  const waiter = waiters.shift();
  if (waiter) waiter(line);
  else lineQueue.push(line);
});

rl.on('close', () => {
  while (waiters.length) {
    const w = waiters.shift();
    w('');
  }
});

const ask = (promptText) =>
  new Promise((resolve) => {
    if (lineQueue.length > 0) return resolve(lineQueue.shift().trim());
    stdout.write(promptText);
    waiters.push((line) => resolve((line || '').trim()));
  });

function defaultQuestions(cat) {
  const g = (label, placeholder) => ({ label, placeholder });
  if (cat === 'image-bg-replace') {
    return [
      g('Apa latar belakang baru yang kamu inginkan?', '"hutan hujan", "kantor modern", "solid biru laut", atau URL foto'),
      g('Jenis latar belakang?', 'solid color / gradient / nature / studio / kota / biru / lainnya'),
      g('Warna solid apa (jika solid color)?', '"biru laut #1E3A8A", putih, hitam, transparan'),
      g('Kualitas pemisahan subjek?', 'sharp edges / preserve rambut halus / soft / natural'),
      g('Serapkan pencahayaan & bayangan agar natural?', 'ya / tidak / otomatis'),
      g('Gaya / kualitas output?', 'photorealistic, 8k, cinematic, natural lighting'),
      g('Format & resolusi hasil?', 'PNG transparan 4K, JPG high quality'),
    ];
  }
  if (cat === 'image-edit') {
    return [
      g('Apa perubahan yang ingin dilakukan?', '"perbaiki kulit", "ubah warna rambut", "tambahkan efek vintage"'),
      g('Gaya / aesthetic hasil?', 'photorealistic, 4k, cinematic, anime, dll'),
      g('Apakah harus mempertahankan elemen tertentu?', 'sebutkan elemen yang harus tetap utuh'),
      g('Format & resolusi?', 'PNG/JPG, 4K, dll'),
    ];
  }
  if (cat === 'writing') {
    return [
      g('Apa topik / isi tulisan?', 'informasi singkat tentang apa yang ditulis'),
      g('Gaya nada (tone)?', 'formal, santai, profesional, persuasif, kreatif'),
      g('Panjang / jumlah kata?', '"300 kata", "5 paragraf", "singkat"'),
      g('Siapa audiens target?', 'umum, pelajar, profesional, anak-anak'),
      g('Bahasa output?', 'Indonesia / English / campuran'),
    ];
  }
  if (cat === 'coding') {
    return [
      g('Apa yang ingin dikerjakan?', '"perbaiki bug pada fungsi X", "buat sistem login", "refactor module ini"'),
      g('Bahasa pemrograman?', 'JavaScript, Python, Rust, Go, TypeScript, dll'),
      g('Tingkat penjelasan?', 'tanpa penjelasan, singkat, rili, langkah demi langkah'),
      g('Format kode hasil?', 'full file, snippet, diff, patch'),
      g('Apakah ada dependency/library penting?', 'sebutkan atau kosongkan'),
    ];
  }
  if (cat === 'research') {
    return [
      g('Apa pertanyaan / topik?', 'topik yang ingin dijelaskan'),
      g('Kedalaman?', 'ringkas (1 paragraf), menengah (5 poin), mendalam (analisis kritis)'),
      g('Format output?', 'paragraf, poin-poin, tabel, bullet list'),
      g('Siapa audiens?', 'umum, pelajar, profesional, ahli'),
      g('Bahasa output?', 'Indonesia / English'),
    ];
  }
  return [g('Tambahan detail penting?', 'sebutkan apa saja yang ingin ditambahkan')];
}

const categoryRules = [
  {
    id: 'image-bg-replace',
    label: 'Penggantian Background Foto',
    detector: (p) => /\b(background|bg|ganti|ganti background|hapus background)\b/i.test(p) && /foto|gambar|image|photo/i.test(p),
    questions: defaultQuestions('image-bg-replace'),
  },
  {
    id: 'image-edit',
    label: 'Edit Foto / Manipulasi Gambar',
    detector: (p) => /edit|foto|gambar|image|retouch|warna|color|filter/i.test(p),
    questions: defaultQuestions('image-edit'),
  },
  {
    id: 'writing',
    label: 'Penulisan / Menulis',
    detector: (p) => /tulis|write|email|surat|artikel|ringkasan|summary|naskah|copy/i.test(p),
    questions: defaultQuestions('writing'),
  },
  {
    id: 'coding',
    label: 'Koding / Pengembangan',
    detector: (p) => /code|kode|function|bug|refactor|fix|implement|debug/i.test(p),
    questions: defaultQuestions('coding'),
  },
  {
    id: 'research',
    label: 'Riset / Penjelasan',
    detector: (p) => /jelaskan|explain|apa|what is|mengapa|why|cara|how/i.test(p),
    questions: defaultQuestions('research'),
  },
];

function detectCategory(prompt) {
  for (const rule of categoryRules) {
    if (rule.detector(prompt)) return rule;
  }
  return {
    id: 'generic',
    label: 'Umum',
    questions: [defaultQuestions('generic')[0]],
  };
}

const categoryProcessors = {
  'image-bg-replace': assembleImageBg,
  'image-edit': assembleImageEdit,
  'writing': assembleWriting,
  'coding': assembleCoding,
  'research': assembleResearch,
  'generic': assembleGeneric,
};

function normalizeLighting(ans) {
  const a = (ans || '').toLowerCase().trim();
  if (a === 'ya' || a === 'yes' || a === 'y' || a === 'ok' || a === 'otomatis' || a === 'auto' || a === 'ya, otomatis') {
    return 'natural shadows matching the new background, realistic';
  }
  if (a === 'tidak' || a === 'no' || a === 'n') {
    return 'no lighting/shadow adjustments';
  }
  return a || 'natural shadows matching the new background, realistic';
}

function assembleImageBg(a) {
  const target = a[0] || '';
  const type = a[1] || 'nature';
  const color = a[2] || '';
  const quality = a[3] || 'sharp edges, preserve fine details especially around hair';
  const lighting = normalizeLighting(a[4]);
  const style = a[5] || 'photorealistic, 8k, high detail, cinematic lighting';
  const output = a[6] || 'PNG with transparent background 4K';
  let bgSpec;
  if (/solid/i.test(type)) {
    bgSpec = `solid background ${color || 'white'}`;
  } else if (/gradient/i.test(type)) {
    bgSpec = `gradient background ${color}`.trim();
  } else if (/^https?:\/\//i.test(target) || /^https?:\/\//i.test(type)) {
    const ref = target || type;
    bgSpec = `background from reference image: ${ref}`;
  } else {
    const bg = target || type;
    bgSpec = `background: ${bg}`;
  }
  const finalPrompt = [
    `Ganti background pada foto ini dengan ${bgSpec}.`,
    `Pemisahan subjek akurat (sharp edges, preserve fine details especially around hair), ${lighting}.`,
    `${style.toLowerCase()}.`,
    `Output ${output}.`,
  ].join(' ');
  return [
    'Tugas: Ganti latar belakang (background) pada foto ini secara realistis.',
    '',
    'Instruksi:',
    `- Ganti background dengan ${bgSpec}.`,
    `- Pemisahan subjek yang sangat akurat: ${quality}.`,
    `- ${lighting}.`,
    `- Hasilkan gambar ${style}.`,
    `- Simpan sebagai ${output}.`,
    '',
    'Prompt akhir siap tempel:',
    finalPrompt,
  ].join('\n');
}

function assembleImageEdit(a) {
  const change = a[0] || '';
  const style = a[1] || 'photorealistic, 4k';
  const keep = a[2] || '';
  const output = a[3] || 'high quality';
  const keepClause = keep ? `Jaga agar elemen berikut tetap utuh: ${keep}.` : '';
  const finalPrompt = `${change}. ${keepClause} ${style}, ${output}.`.trim();
  return [
    'Tugas: Edit foto ini sesuai permintaan.',
    '',
    'Instruksi:',
    `- Perubahan: ${change}.`,
    keepClause,
    `- Gaya hasil: ${style}.`,
    `- Output: ${output}.`,
    '',
    'Prompt akhir siap tempel:',
    finalPrompt,
  ].join('\n');
}

function assembleWriting(a) {
  const topic = a[0] || '';
  const tone = a[1] || 'profesional';
  const length = a[2] || 'singkat';
  const audience = a[3] || 'umum';
  const lang = a[4] || 'Indonesia';
  const finalPrompt = `Tuliskan ${length} dalam bahasa ${lang} dengan nada ${tone} untuk audiens ${audience} tentang ${topic}.`;
  return [
    'Tugas: Tulis teks sesuai permintaan.',
    '',
    'Instruksi:',
    `- Topik: ${topic}.`,
    `- Nada: ${tone}.`,
    `- Panjang: ${length}.`,
    `- Audiens: ${audience}.`,
    `- Bahasa: ${lang}.`,
    '',
    'Prompt akhir siap tempel:',
    finalPrompt,
  ].join('\n');
}

function assembleCoding(a) {
  const task = a[0] || '';
  const lang = a[1] || 'Python';
  const explain = a[2] || 'singkat';
  const fmt = a[3] || 'full file';
  const deps = a[4] || '';
  const depsClause = deps ? `Gunakan library: ${deps}.` : '';
  const finalPrompt = `Buatkan ${fmt} kode ${lang} untuk ${task}. ${depsClause} Sertakan penjelasan ${explain}.`.trim();
  return [
    'Tugas: Kode sesuai permintaan.',
    '',
    'Instruksi:',
    `- Tugas: ${task}.`,
    `- Bahasa: ${lang}.`,
    depsClause,
    `- Tingkat penjelasan: ${explain}.`,
    `- Format kode: ${fmt}.`,
    '',
    'Prompt akhir siap tempel:',
    finalPrompt,
  ].join('\n');
}

function assembleResearch(a) {
  const topic = a[0] || '';
  const depth = a[1] || 'ringkas';
  const format = a[2] || 'paragraf';
  const audience = a[3] || 'umum';
  const lang = a[4] || 'Indonesia';
  const finalPrompt = `Jelaskan "${topic}" dalam bahasa ${lang} dengan kedalaman ${depth}, format ${format}, untuk audiens ${audience}.`;
  return [
    'Tugas: Jelaskan / riset topik.',
    '',
    'Instruksi:',
    `- Topik: ${topic}.`,
    `- Kedalaman: ${depth}.`,
    `- Format: ${format}.`,
    `- Audiens: ${audience}.`,
    `- Bahasa: ${lang}.`,
    '',
    'Prompt akhir siap tempel:',
    finalPrompt,
  ].join('\n');
}

function assembleGeneric(a) {
  const ctx = a[0] || 'tidak ada';
  const finalPrompt = `Pertimbangkan konteks tambahan: ${ctx}.`;
  return [
    'Tugas: Selesaikan permintaan.',
    '',
    'Instruksi:',
    `- Konteks tambahan: ${ctx}.`,
    '',
    'Prompt akhir siap tempel:',
    finalPrompt,
  ].join('\n');
}

function section(text) {
  const line = '='.repeat(Math.min(text.length + 4, 56));
  return `\n${line}\n${text}\n${line}\n`;
}

async function run() {
  const help = argv.includes('-h') || argv.includes('--help');
  if (help) {
    stdout.write('Penggunaan: prompt-refiner [prompt-mentah]\n\n');
    stdout.write('Alat penyempurna prompt otomatis.\n');
    stdout.write('Jika prompt diberikan sebagai argumen, langsung masuk ke pertanyaan.\n');
    stdout.write('Jika tidak, alat akan meminta prompt mentah terlebih dahulu.\n');
    stdout.write('\nContoh:\n  node prompt-refiner.js "ganti background di foto ini"\n');
    rl.close();
    exit(0);
  }

  stdout.write('\n' + section('Prompt Refiner — Alat Penyempurna Prompt'));
  if (isTTY) {
    stdout.write('Masukkan gagapan prompt kamu (prompt mentah yang ingin disempurnakan).\n');
  }

  let raw = argv.slice(2).filter((a) => !a.startsWith('-')).join(' ');
  if (!raw) {
    raw = await ask('> ');
  }
  raw = (raw || '').trim();

  if (!raw) {
    stdout.write('\nTidak ada input. Keluar.\n');
    rl.close();
    exit(0);
  }

  const rule = detectCategory(raw);
  stdout.write(`\nKategori terdeteksi: ${rule.label} (${rule.id})\n\n`);

  const answers = [];
  const total = rule.questions.length;
  for (let i = 0; i < total; i++) {
    const q = rule.questions[i];
    const prompt = `[${i + 1}/${total}] ${q.label}`;
    const hint = isTTY ? ` (${q.placeholder})` : '';
    const ans = await ask(`${prompt}${hint}\n> `);
    if (ans === '' && isTTY) {
      stdout.write('(kosong — pakai nilai default)\n');
    }
    answers.push(ans);
  }

  const assembled = (categoryProcessors[rule.id] || assembleGeneric)(answers);

  stdout.write(section('HASIL — Prompt Siap Tempel'));
  stdout.write(assembled + '\n');

  if (isTTY) {
    await ask('\nTekan Enter untuk menyalin ke clipboard (jika tersedia) atau keluar... ');
  }
  tryCopy(assembled);

  rl.close();
  exit(0);
}

function tryCopy(text) {
  const cp = require('child_process');
  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push('clip');
  } else if (process.platform === 'darwin') {
    candidates.push('pbcopy');
  } else {
    candidates.push('xclip -selection clipboard', 'wl-copy', 'pbcopy');
  }
  for (const cmd of candidates) {
    try {
      cp.execSync(cmd, { input: text, stdio: ['pipe', 'pipe', 'pipe'] });
      stdout.write('\n[Clipboard] Prompt berhasil disalin ke clipboard.\n');
      return;
    } catch (e) {
    }
  }
  stdout.write('\n[Clipboard] Tidak tersedia di environment ini — salin teks di atas secara manual.\n');
}

run();
