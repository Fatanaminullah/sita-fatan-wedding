import type { Copy } from './types'

/**
 * Warm and pronoun-light, the owner's call on 2026-09-16: the English voice
 * carried over, the guest addressed as little as possible, "Anda" only where
 * a sentence has nowhere else to go, never "Bapak/Ibu", never "kamu".
 *
 * Drafted by the agent; the couple read it before any wave.
 */
export const id: Copy = {
  lang: 'id',
  dateLong: 'Sabtu, 10 Oktober 2026',
  deadlineLong: '26 September',
  events: {
    akad: {
      name: 'Akad Nikah',
      timeLine: '08.00 WIB',
      // Semua yang menerima undangan ini adalah tamu undangan, jadi
      // "tamu undangan" tidak membatasi apa pun. Yang membedakan akad
      // adalah jumlahnya.
      note: 'Khusus keluarga dan undangan terbatas.',
    },
    resepsi: {
      name: 'Resepsi',
      timeLine: '18.30 WIB sampai selesai',
      directions: [
        'Parkir: langsung menuju P7, P8, atau P9.',
        'Drop-off: langsung ke P9. Mohon tidak turun di lobi MGK.',
      ],
    },
  },
  places: (pax) => (pax === 1 ? 'Satu tempat telah kami siapkan untuk Anda.' : `${pax} tempat telah kami siapkan untuk Anda.`),
  openMaps: 'Buka di Maps',

  letter: {
    dear: 'KEPADA',
    invitedTo: 'dengan penuh sukacita kami mengundang ke pernikahan',
    and: 'dan',
    replyBy: (d) => `Mohon konfirmasi sebelum ${d}`,
    aria: (name) => `Surat untuk ${name}`,
    open: 'Buka undangan',
  },
  cover: {
    title: 'Pernikahan Sita & Fatan',
    tap: 'atau ketuk suratnya',
    scrollCue: 'Gulir ke bawah untuk melanjutkan',
  },
  verse: {
    // Terjemahan Kemenag 2019, kata demi kata. Versi sebelumnya memakai
    // "agar dia merasa senang kepadanya", yang bukan bunyi terjemahan resmi
    // dan terbaca lebih ringan dari maksudnya.
    text: 'Dialah yang menciptakan kamu dari jiwa yang satu (Adam) dan darinya Dia menjadikan pasangannya agar dia cenderung dan merasa tenteram kepadanya.',
    source: 'Al-A’raf : 189',
  },
  vow: [
    ['Kami temukan', 'pada satu'],
    ['sama lain', 'sebuah rumah'],
    ['yang tak pernah', 'kami sadari'],
    ['kami cari,', 'tempat teduh'],
    ['di mana hari', 'berakhir'],
    ['dan', 'bermula.'],
  ],
  couple: {
    // Worded as the approved WhatsApp template has it: Bapak/Ibu in Indonesian.
    brideParents: 'Putri dari Bapak Siswoko & Ibu Icha Siti Hapsah',
    groomParents: 'Putra dari Bapak Sabrul Jamil & Ibu Yudhanti Dwi Lestari',
    and: 'dan',
    captions: { bride: ['sang', 'Mempelai Wanita'], both: ['kami', 'Berdua'], groom: ['sang', 'Mempelai Pria'] },
    aria: 'Mempelai wanita dan pria',
  },
  countdown: {
    units: ['hari', 'jam', 'menit', 'detik'],
    over: ['Terima kasih telah ', 'hadir.'],
    addToCalendar: 'Simpan ke kalender',
    dateAria: '10 Oktober 2026',
  },
  dress: {
    title: 'Formal, dalam warna gelap.',
    lines: ['Hitam, cokelat, atau abu-abu.', 'Kami akan sangat menghargai bila busana yang dikenakan mengikuti nuansa ini.'],
    example: 'Sekadar contoh. Apa pun dalam nuansa ini sudah tepat.',
    drag: 'Seret untuk memutar',
    tones: ['Hitam', 'Cokelat', 'Abu-abu'],
    toneAria: 'Warna',
    aria: 'Busana',
  },
  gallery: { hint: 'Gulir untuk menjelajah' },
  gift: {
    // "Hadiah" menamai barangnya; "tanda kasih" menamai maksudnya, dan itu
    // yang ingin disampaikan di bagian ini.
    label: 'Tanda Kasih',
    title: ['Bila ', 'berkenan.'],
    // Dua hal, bukan satu: kehadiran sudah cukup, dan bila tetap ingin
    // memberi, pemberian itu diterima. "Dititipkan" menjadikannya sesuatu
    // yang dipercayakan, bukan dibayarkan.
    presence: 'Hadir dan mendoakan kami sudah lebih dari cukup. Bila ada tanda kasih yang ingin dititipkan, kami menerimanya dengan hati terbuka.',
    intro: 'Bila berkenan menitipkan tanda kasih:',
    withLove: 'dengan penuh kasih,',
    turnOver: 'BALIK KARTU',
    turn: 'Balik kartunya',
    turnBack: 'Balik kembali',
    copy: 'Salin nomor rekening',
    copied: 'Tersalin',
    drag: 'Seret kartu untuk membaliknya',
    aria: (bank, account, holder) => `Kartu hadiah: ${bank} ${account}, ${holder}`,
  },
  rsvp: {
    crumb: 'RSVP',
    of: (i, n) => `${i} dari ${n}`,
    askBefore: 'Bersediakah hadir di ',
    askAfter: '?',
    yes: 'Ya, saya akan hadir',
    no: 'Maaf, saya belum bisa hadir',
    later: 'Saya jawab nanti, lanjut membaca dulu',
    howMany: ['Berapa orang ', 'yang hadir?'],
    kept: (n) => `${n} tempat telah kami siapkan.`,
    fewer: 'Kurangi',
    more: 'Tambah',
    count: 'Jumlah tamu',
    ok: 'OK',
    enter: 'tekan Enter ↵',
    reviewEyebrow: 'Periksa sekali lagi',
    reviewQ: ['Sudah ', 'benar?'],
    coming: 'Hadir',
    ofYou: (n) => `${n} orang`,
    notAble: 'Belum bisa hadir',
    sending: 'Mengirim…',
    send: 'Kirim jawaban',
    doneEyebrow: 'Jawaban diterima',
    seeYou: ['Sampai jumpa ', '10 Oktober.'],
    miss: ['Semoga lain waktu ', 'bisa berjumpa.'],
    lastPage: 'Terima kasih. Satu halaman lagi di bawah.',
    keep: 'Lanjut menjelajah ↓',
    change: 'Ubah jawaban',
    answerToContinue: 'Jawab dulu untuk melanjutkan',
    prev: 'Pertanyaan sebelumnya',
    next: 'Pertanyaan berikutnya',
    nav: 'Pindah antar pertanyaan',
    aria: 'RSVP',
  },
  closing: {
    thanks: 'terima kasih telah menjadi bagian dari hari kami.',
    signOff: 'Dengan penuh cinta,',
    reply: 'Balas undangan',
    aria: 'Penutup',
  },
  chrome: {
    mute: 'Matikan musik',
    unmute: 'Nyalakan musik',
    pill: 'RSVP',
    loading: 'Memuat undangan',
    switchTo: 'English',
  },
}
