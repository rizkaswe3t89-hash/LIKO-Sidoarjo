import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  AuditLog,
  ConsultationTicket,
  DashboardMetrics,
  EmailInteractionLog,
  KnowledgeArticle,
  MicroFeedback,
  ServiceCategory,
  ServiceCode,
  TechnicalDivision,
  TicketPriority,
  TicketStatus,
  UnansweredQuery,
  User,
} from '../src/types/liko.ts';
import { EMAIL_DRAFT_TEMPLATES } from '../src/data/schemaAndSop.ts';

export interface LikoDatabase {
  users: Array<User & { password_hash: string }>;
  service_categories: ServiceCategory[];
  knowledge_articles: KnowledgeArticle[];
  email_interaction_logs: EmailInteractionLog[];
  consultation_tickets: ConsultationTicket[];
  audit_logs: AuditLog[];
  micro_feedback: MicroFeedback[];
  unanswered_queries: UnansweredQuery[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'liko-db.json');

export function maskEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const [local, domain] = trimmed.split('@');
  if (!local || !domain) return '***@masked.id';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '08**-****-****';
  return `${digits.slice(0, 4)}-****-${digits.slice(-4)}`;
}

export function maskNik(nik: string): string {
  const digits = nik.replace(/\D/g, '');
  if (digits.length < 4) return '3515********0000';
  return `${digits.slice(0, 4)}********${digits.slice(-4)}`;
}

export function hashIdentifier(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

function hoursAheadIso(hours: number): string {
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function buildSeedDatabase(): LikoDatabase {
  const users: Array<User & { password_hash: string }> = [
    {
      id: 1,
      nip: '198405122010011014',
      full_name: 'Dra. Ratna Kusuma, M.M.',
      email: 'ratna.kusuma@disnaker.sidoarjokab.go.id',
      role: 'ADMIN_UTAMA',
      division: 'Sekretariat',
      password_hash: hashIdentifier('asn-sidoarjo-2026'),
      is_active: true,
      created_at: hoursAgoIso(720),
    },
    {
      id: 2,
      nip: '198811032014021008',
      full_name: 'Bagus Prasetyo, S.Sos.',
      email: 'bagus.penta@disnaker.sidoarjokab.go.id',
      role: 'OPERATOR_PENTA',
      division: 'Penta',
      password_hash: hashIdentifier('asn-sidoarjo-2026'),
      is_active: true,
      created_at: hoursAgoIso(700),
    },
    {
      id: 3,
      nip: '199002192015032005',
      full_name: 'Siti Aminah, S.T.',
      email: 'siti.lattas@disnaker.sidoarjokab.go.id',
      role: 'OPERATOR_LATTAS',
      division: 'Lattas',
      password_hash: hashIdentifier('asn-sidoarjo-2026'),
      is_active: true,
      created_at: hoursAgoIso(680),
    },
    {
      id: 4,
      nip: '198207242009021003',
      full_name: 'Hendra Wijaya, S.H., M.H.',
      email: 'hendra.hi@disnaker.sidoarjokab.go.id',
      role: 'MEDIATOR_HI',
      division: 'HI',
      password_hash: hashIdentifier('asn-sidoarjo-2026'),
      is_active: true,
      created_at: hoursAgoIso(660),
    },
    {
      id: 5,
      nip: '197509152001121002',
      full_name: 'Ir. Ahmad Fauzi, M.T.',
      email: 'kadisnaker@disnaker.sidoarjokab.go.id',
      role: 'PIMPINAN',
      division: 'Sekretariat',
      password_hash: hashIdentifier('asn-sidoarjo-2026'),
      is_active: true,
      created_at: hoursAgoIso(720),
    },
  ];

  const service_categories: ServiceCategory[] = [
    {
      id: 1,
      code: 'AK1',
      name: 'Kartu Pencari Kerja (AK1 / Kartu Kuning)',
      slug: 'kartu-ak1',
      keyword_trigger: 'INFO AK1',
      target_division: 'Penta',
      automation_mode: 'FULL_AUTO',
      sla_hours: 24,
      description:
        'Penerbitan baru, perpanjangan masa berlaku, legalisasi, dan lapor penempatan Kartu Pencari Kerja AK1 secara gratis.',
      sort_order: 1,
    },
    {
      id: 2,
      code: 'LOKER',
      name: 'Informasi Lowongan Kerja & Bursa Kerja',
      slug: 'lowongan-kerja',
      keyword_trigger: 'INFO LOKER',
      target_division: 'Penta',
      automation_mode: 'FULL_AUTO',
      sla_hours: 24,
      description:
        'Akses direktori lowongan kerja terverifikasi kawasan industri Sidoarjo, Karirhub SIAPkerja, dan jadwal Job Fair.',
      sort_order: 2,
    },
    {
      id: 3,
      code: 'PELATIHAN',
      name: 'Pelatihan Kerja & Sertifikasi (BLK)',
      slug: 'pelatihan-blk',
      keyword_trigger: 'INFO PELATIHAN',
      target_division: 'Lattas',
      automation_mode: 'FULL_AUTO',
      sla_hours: 24,
      description:
        'Program Pelatihan Berbasis Kompetensi (PBK) UPTD BLK Sidoarjo dan fasilitasi uji sertifikasi BNSP.',
      sort_order: 3,
    },
    {
      id: 4,
      code: 'HI',
      name: 'Hubungan Industrial & Perselisihan',
      slug: 'hubungan-industrial',
      keyword_trigger: 'INFO HI',
      target_division: 'HI',
      automation_mode: 'HYBRID_ESCALATION',
      sla_hours: 24,
      description:
        'Panduan normatif UMK Sidoarjo, PKWT/PKWTT, tata cara Bipartit, serta tiket eskalasi langsung ke Mediator HI.',
      sort_order: 4,
    },
  ];

  const knowledge_articles: KnowledgeArticle[] = [
    {
      id: 1,
      category_id: 1,
      title: 'Syarat & Alur Pembuatan Kartu Pencari Kerja (AK1 / Kartu Kuning)',
      slug: 'syarat-alur-kartu-ak1',
      keywords: ['INFO AK1', 'kartu kuning', 'ak1', 'pencari kerja', 'siapkerja', 'syarat ak1'],
      summary:
        'Panduan lengkap dokumen KTP Sidoarjo, ijazah, pas foto, pendaftaran akun SIAPkerja, dan verifikasi cetak gratis di loket Disnaker.',
      content_markdown:
        '1. Siapkan KTP Kab. Sidoarjo (asli & fotokopi), Ijazah terakhir + transkrip nilai, serta pas foto 3x4 berwarna (2 lembar).\n2. Buat akun pencari kerja di portal siapkerja.kemnaker.go.id dan lengkapi data riwayat pendidikan.\n3. Datang ke Loket Pelayanan AK1 Disnaker Kab. Sidoarjo (Jl. Raya Jati No. 4) Senin-Jumat pukul 08.00-15.00 WIB.\n4. Seluruh layanan penerbitan dan legalisir AK1 bebas biaya (Rp0 / Gratis).',
      email_template_body: EMAIL_DRAFT_TEMPLATES[0].body,
      sop_reference: 'SOP-LIKO-01',
      is_published: true,
      view_count: 1420,
      helpful_count: 318,
      updated_by: 2,
      updated_at: hoursAgoIso(48),
    },
    {
      id: 2,
      category_id: 1,
      title: 'Perpanjangan Masa Berlaku & Kewajiban Lapor Status AK1 Tiap 6 Bulan',
      slug: 'perpanjangan-lapor-ak1',
      keywords: ['perpanjang ak1', 'lapor ak1', 'masa berlaku kartu kuning', 'legalisir ak1'],
      summary:
        'Kartu AK1 berlaku selama 2 tahun dengan kewajiban lapor setiap 6 bulan sekali apabila pencari kerja belum memperoleh penempatan.',
      content_markdown:
        '1. Pencari kerja yang belum mendapatkan pekerjaan wajib melapor setiap 6 bulan sekali (bisa via portal SIAPkerja maupun loket).\n2. Apabila sudah diterima bekerja, pemegang AK1 wajib melaporkan status penempatan untuk pemutakhiran data ketenagakerjaan daerah.\n3. Perpanjangan masa berlaku setelah 2 tahun cukup membawa kartu AK1 lama dan KTP.',
      email_template_body: EMAIL_DRAFT_TEMPLATES[0].body,
      sop_reference: 'SOP-LIKO-01',
      is_published: true,
      view_count: 645,
      helpful_count: 142,
      updated_by: 2,
      updated_at: hoursAgoIso(72),
    },
    {
      id: 3,
      category_id: 2,
      title: 'Direktori Lowongan Kerja Terverifikasi & Jadwal Bursa Kerja Sidoarjo',
      slug: 'direktori-lowongan-kerja-sidoarjo',
      keywords: ['INFO LOKER', 'loker', 'lowongan kerja', 'bursa kerja', 'job fair', 'karirhub'],
      summary:
        'Daftar kanal lowongan resmi di kawasan industri Berbek, Buduran, Krian, Taman, dan Waru yang telah terverifikasi Bidang Penta.',
      content_markdown:
        '1. Gunakan portal Karirhub SIAPkerja dengan filter wilayah Kabupaten Sidoarjo untuk melamar ke perusahaan manufaktur, logistik, dan jasa resmi.\n2. Pantau informasi Bursa Kerja Khusus (BKK) di SMK mitra Disnaker dan jadwal Job Fair Kabupaten Sidoarjo.\n3. Waspada pungutan biaya rekrutmen: seluruh perusahaan mitra wajib melarang biaya administrasi tes kerja.',
      email_template_body: EMAIL_DRAFT_TEMPLATES[1].body,
      sop_reference: 'SOP-LIKO-01',
      is_published: true,
      view_count: 1890,
      helpful_count: 405,
      updated_by: 2,
      updated_at: hoursAgoIso(20),
    },
    {
      id: 4,
      category_id: 2,
      title: 'Verifikasi Legalitas Lowongan & Pelaporan Indikasi Rekrutmen Fiktif',
      slug: 'verifikasi-legalitas-loker',
      keywords: ['loker penipuan', 'cek perusahaan', 'legalitas lowongan', 'wajib lapor', 'wlkp'],
      summary:
        'Langkah pengecekan keabsahan pengumuman lowongan kerja dan saluran pelaporan indikasi penipuan berkedok rekrutmen.',
      content_markdown:
        '1. Pastikan alamat email undangan tes menggunakan domain resmi perusahaan, bukan pesan berantai yang meminta transfer biaya travel atau seragam.\n2. Cocokkan status Wajib Lapor Ketenagakerjaan Perusahaan (WLKP) melalui Bidang Penta.\n3. Laporkan indikasi lowongan fiktif melalui form Tiket Konsultasi LIKO-Sidoarjo.',
      email_template_body: EMAIL_DRAFT_TEMPLATES[1].body,
      sop_reference: 'SOP-LIKO-02',
      is_published: true,
      view_count: 512,
      helpful_count: 119,
      updated_by: 2,
      updated_at: hoursAgoIso(96),
    },
    {
      id: 5,
      category_id: 3,
      title: 'Jadwal & Syarat Pelatihan Berbasis Kompetensi UPTD BLK Sidoarjo',
      slug: 'pelatihan-vokasi-blk-sidoarjo',
      keywords: ['INFO PELATIHAN', 'blk', 'pelatihan kerja', 'sertifikasi bnsp', 'cnc', 'las', 'digital marketing'],
      summary:
        'Informasi kejuruan unggulan (CNC, Las, Otomasi Listrik, Tata Boga, Pemasaran Digital) gratis bersertifikat BNSP di UPTD BLK Sidoarjo.',
      content_markdown:
        '1. Kejuruan tersedia: Teknik Manufaktur CNC/Bubut, Pengelasan SMAW/GMAW, Teknik Pendingin AC, Pemrograman Web, Desain Grafis, dan Tata Boga.\n2. Syarat: KTP Kabupaten Sidoarjo, usia 18-35 tahun, tidak sedang sekolah/kuliah aktif.\n3. Pendaftaran dilakukan melalui menu Pelatihan pada akun SIAPkerja dengan memilih penyelenggara UPTD BLK Sidoarjo.\n4. Biaya pelatihan dan uji kompetensi BNSP ditanggung APBD/APBN (Gratis).',
      email_template_body: EMAIL_DRAFT_TEMPLATES[2].body,
      sop_reference: 'SOP-LIKO-01',
      is_published: true,
      view_count: 1105,
      helpful_count: 274,
      updated_by: 3,
      updated_at: hoursAgoIso(32),
    },
    {
      id: 6,
      category_id: 4,
      title: 'Panduan Perundingan Bipartit & Pencatatan Perselisihan Hubungan Industrial',
      slug: 'panduan-bipartit-perselisihan-hi',
      keywords: ['INFO HI', 'phk', 'pesangon', 'bipartit', 'perselisihan', 'mediator', 'umk sidoarjo', 'pkwt', 'pkb'],
      summary:
        'Tahapan penyelesaian perselisihan hak, kepentingan, atau PHK melalui perundingan Bipartit hingga pencatatan mediasi di Bidang HI.',
      content_markdown:
        '1. Tahap awal wajib ditempuh melalui perundingan Bipartit secara musyawarah antara pekerja/serikat pekerja dengan pengusaha maksimal 30 hari kerja dan dituangkan dalam Risalah Bipartit.\n2. Apabila gagal sepakat, salah satu pihak mengajukan permohonan pencatatan perselisihan ke Bidang HI Disnaker Kab. Sidoarjo melampirkan risalah Bipartit dan bukti hubungan kerja.\n3. Untuk konsultasi spesifik (perhitungan pesangon, pelanggaran UMK, atau kontrak PKWT), ajukan Tiket Eskalasi ke Mediator HI.',
      email_template_body: EMAIL_DRAFT_TEMPLATES[3].body,
      sop_reference: 'SOP-LIKO-02',
      is_published: true,
      view_count: 980,
      helpful_count: 230,
      updated_by: 4,
      updated_at: hoursAgoIso(12),
    },
  ];

  const email_interaction_logs: EmailInteractionLog[] = [
    {
      id: 1,
      message_id: 'msg-20261116-0812-a1',
      sender_masked: 'an***@gmail.com',
      sender_hash: hashIdentifier('andi.sidoarjo@gmail.com'),
      subject_received: 'INFO AK1 - Syarat pembuatan kartu kuning baru',
      detected_keyword: 'INFO AK1',
      matched_category_id: 1,
      matched_article_id: 1,
      response_time_ms: 42,
      delivery_status: 'SENT_AUTO',
      auto_reply_preview: EMAIL_DRAFT_TEMPLATES[0].subjectReply,
      created_at: hoursAgoIso(14),
    },
    {
      id: 2,
      message_id: 'msg-20261116-0925-b2',
      sender_masked: 'de***@yahoo.co.id',
      sender_hash: hashIdentifier('dewi.krian@yahoo.co.id'),
      subject_received: 'INFO LOKER wilayah Krian dan Buduran',
      detected_keyword: 'INFO LOKER',
      matched_category_id: 2,
      matched_article_id: 3,
      response_time_ms: 38,
      delivery_status: 'SENT_AUTO',
      auto_reply_preview: EMAIL_DRAFT_TEMPLATES[1].subjectReply,
      created_at: hoursAgoIso(12),
    },
    {
      id: 3,
      message_id: 'msg-20261116-1018-c3',
      sender_masked: 'fa***@gmail.com',
      sender_hash: hashIdentifier('farhan.waru@gmail.com'),
      subject_received: 'INFO PELATIHAN BLK gelombang November',
      detected_keyword: 'INFO PELATIHAN',
      matched_category_id: 3,
      matched_article_id: 5,
      response_time_ms: 51,
      delivery_status: 'SENT_AUTO',
      auto_reply_preview: EMAIL_DRAFT_TEMPLATES[2].subjectReply,
      created_at: hoursAgoIso(10),
    },
    {
      id: 4,
      message_id: 'msg-20261116-1140-d4',
      sender_masked: 'nu***@outlook.com',
      sender_hash: hashIdentifier('nurul.taman@outlook.com'),
      subject_received: 'INFO HI mengenai prosedur bipartit dan pesangon',
      detected_keyword: 'INFO HI',
      matched_category_id: 4,
      matched_article_id: 6,
      response_time_ms: 63,
      delivery_status: 'SENT_AUTO',
      auto_reply_preview: EMAIL_DRAFT_TEMPLATES[3].subjectReply,
      created_at: hoursAgoIso(8),
    },
    {
      id: 5,
      message_id: 'msg-20261116-1305-e5',
      sender_masked: 'ri***@gmail.com',
      sender_hash: hashIdentifier('rizal.buduran@gmail.com'),
      subject_received: 'INFO AK1 perpanjang kartu kuning',
      detected_keyword: 'INFO AK1',
      matched_category_id: 1,
      matched_article_id: 1,
      response_time_ms: 35,
      delivery_status: 'SENT_AUTO',
      auto_reply_preview: EMAIL_DRAFT_TEMPLATES[0].subjectReply,
      created_at: hoursAgoIso(6),
    },
    {
      id: 6,
      message_id: 'msg-20261116-1430-f6',
      sender_masked: 'pu***@gmail.com',
      sender_hash: hashIdentifier('putri.gedangan@gmail.com'),
      subject_received: 'INFO LOKER administrasi pabrik',
      detected_keyword: 'INFO LOKER',
      matched_category_id: 2,
      matched_article_id: 3,
      response_time_ms: 47,
      delivery_status: 'SENT_AUTO',
      auto_reply_preview: EMAIL_DRAFT_TEMPLATES[1].subjectReply,
      created_at: hoursAgoIso(4),
    },
    {
      id: 7,
      message_id: 'msg-20261116-1940-g7',
      sender_masked: 'ag***@gmail.com',
      sender_hash: hashIdentifier('agus.porong@gmail.com'),
      subject_received: 'INFO PELATIHAN las listrik dan cnc',
      detected_keyword: 'INFO PELATIHAN',
      matched_category_id: 3,
      matched_article_id: 5,
      response_time_ms: 44,
      delivery_status: 'SENT_AUTO',
      auto_reply_preview: EMAIL_DRAFT_TEMPLATES[2].subjectReply,
      created_at: hoursAgoIso(2),
    },
    {
      id: 8,
      message_id: 'msg-20261116-2105-h8',
      sender_masked: 'wa***@gmail.com',
      sender_hash: hashIdentifier('wahyu.candi@gmail.com'),
      subject_received: 'INFO AK1 cetak online malam hari',
      detected_keyword: 'INFO AK1',
      matched_category_id: 1,
      matched_article_id: 1,
      response_time_ms: 31,
      delivery_status: 'SENT_AUTO',
      auto_reply_preview: EMAIL_DRAFT_TEMPLATES[0].subjectReply,
      created_at: hoursAgoIso(1),
    },
  ];

  const consultation_tickets: ConsultationTicket[] = [
    {
      id: 1,
      ticket_number: 'LIKO-2026-0401',
      category_id: 4,
      applicant_name: 'Slamet Hariyanto',
      applicant_email_masked: 'sl***@gmail.com',
      applicant_email_hash: hashIdentifier('slamet.taman@gmail.com'),
      applicant_phone_masked: '0812-****-4419',
      nik_masked: '3515********0012',
      subject: 'Permohonan Jadwal Mediasi PHK Sepihak & Keterlambatan Pesangon',
      description:
        'Perundingan Bipartit kedua tanggal 10 November belum menghasilkan kesepakatan tertulis terkait kompensasi masa kerja 6 tahun di PT Maju Logam Kec. Taman.',
      assigned_division: 'HI',
      assigned_user_id: 4,
      status: 'IN_PROGRESS',
      priority: 'URGENT',
      resolution_note:
        'Risalah Bipartit terverifikasi oleh Mediator HI. Undangan klarifikasi Tripartit dijadwalkan Kamis pukul 09.30 WIB di Ruang Mediasi Disnaker.',
      sla_deadline_at: hoursAheadIso(14),
      resolved_at: null,
      created_at: hoursAgoIso(10),
      updated_at: hoursAgoIso(3),
    },
    {
      id: 2,
      ticket_number: 'LIKO-2026-0402',
      category_id: 1,
      applicant_name: 'Nadia Kartika Sari',
      applicant_email_masked: 'na***@gmail.com',
      applicant_email_hash: hashIdentifier('nadia.sidoarjo@gmail.com'),
      applicant_phone_masked: '0857-****-9102',
      nik_masked: '3515********0087',
      subject: 'Sinkronisasi NIK Akun SIAPkerja untuk Cetak AK1 Terkendala',
      description:
        'Saat daftar akun SIAPkerja muncul keterangan NIK sudah terdaftar di nomor ponsel lama yang tidak aktif sehingga gagal verifikasi AK1.',
      assigned_division: 'Penta',
      assigned_user_id: 2,
      status: 'RESOLVED',
      priority: 'NORMAL',
      resolution_note:
        'Reset verifikasi nomor ponsel SIAPkerja telah dibantu oleh Operator Penta setelah pencocokan KTP. Pemohon telah menerima kartu AK1.',
      sla_deadline_at: hoursAgoIso(6),
      resolved_at: hoursAgoIso(9),
      created_at: hoursAgoIso(30),
      updated_at: hoursAgoIso(9),
    },
    {
      id: 3,
      ticket_number: 'LIKO-2026-0403',
      category_id: 3,
      applicant_name: 'Muhammad Arifin',
      applicant_email_masked: 'mu***@yahoo.com',
      applicant_email_hash: hashIdentifier('arifin.blk@yahoo.com'),
      applicant_phone_masked: '0813-****-7731',
      nik_masked: '3515********0144',
      subject: 'Konfirmasi Kelulusan Seleksi Pelatihan Operator CNC Batch 4',
      description:
        'Sudah mengikuti tes wawancara UPTD BLK Sidoarjo pekan lalu, mohon informasi pengumuman daftar peserta definitif dan jadwal daftar ulang.',
      assigned_division: 'Lattas',
      assigned_user_id: 3,
      status: 'IN_DISPOSITION',
      priority: 'NORMAL',
      resolution_note: 'Diteruskan ke koordinator instruktur UPTD BLK Sidoarjo untuk pencocokan daftar nilai.',
      sla_deadline_at: hoursAheadIso(18),
      resolved_at: null,
      created_at: hoursAgoIso(6),
      updated_at: hoursAgoIso(4),
    },
    {
      id: 4,
      ticket_number: 'LIKO-2026-0404',
      category_id: 4,
      applicant_name: 'Rina Kusumawati',
      applicant_email_masked: 'ri***@gmail.com',
      applicant_email_hash: hashIdentifier('rina.gedangan@gmail.com'),
      applicant_phone_masked: '0821-****-5520',
      nik_masked: '3515********0291',
      subject: 'Konsultasi Status PKWT Berulang Lebih dari 5 Tahun',
      description:
        'Mohon penjelasan hukum ketenagakerjaan terkait perpanjangan PKWT berturut-turut di pabrik pengemasan kawasan Gedangan tanpa jeda.',
      assigned_division: 'HI',
      assigned_user_id: null,
      status: 'OPEN',
      priority: 'NORMAL',
      resolution_note: null,
      sla_deadline_at: hoursAheadIso(21),
      resolved_at: null,
      created_at: hoursAgoIso(3),
      updated_at: hoursAgoIso(3),
    },
    {
      id: 5,
      ticket_number: 'LIKO-2026-0405',
      category_id: 2,
      applicant_name: 'Dimas Setiawan',
      applicant_email_masked: 'di***@gmail.com',
      applicant_email_hash: hashIdentifier('dimas.berbek@gmail.com'),
      applicant_phone_masked: '0896-****-1128',
      nik_masked: '3515********0315',
      subject: 'Verifikasi Lowongan Gudang Ekspedisi Mengatasnamakan Kawasan Berbek',
      description:
        'Menerima pesan undangan interview yang meminta transfer Rp350.000 untuk seragam. Mohon verifikasi apakah perusahaan tersebut terdaftar di Disnaker.',
      assigned_division: 'Penta',
      assigned_user_id: 2,
      status: 'RESOLVED',
      priority: 'URGENT',
      resolution_note:
        'Dikonfirmasi sebagai modus penipuan. Nama perusahaan dicatut dan tidak pernah melakukan pungutan. Edukasi pencegahan telah dikirim ke pemohon.',
      sla_deadline_at: hoursAgoIso(2),
      resolved_at: hoursAgoIso(18),
      created_at: hoursAgoIso(26),
      updated_at: hoursAgoIso(18),
    },
  ];

  const audit_logs: AuditLog[] = [
    {
      id: 1,
      actor_user_id: null,
      actor_name: 'Email API Gateway',
      action: 'WEBHOOK_AUTOREPLY',
      entity_table: 'email_interaction_logs',
      entity_id: '8',
      detail: 'Balasan otomatis INFO AK1 terkirim dalam 31 ms (pengirim disamarkan sesuai UU PDP).',
      ip_masked: '103.144.***.12',
      created_at: hoursAgoIso(1),
    },
    {
      id: 2,
      actor_user_id: 4,
      actor_name: 'Hendra Wijaya, S.H., M.H.',
      action: 'DISPOSE_TICKET',
      entity_table: 'consultation_tickets',
      entity_id: 'LIKO-2026-0401',
      detail: 'Tiket didisposisikan ke Mediator HI dan jadwal mediasi Tripartit ditetapkan.',
      ip_masked: '10.20.***.44',
      created_at: hoursAgoIso(3),
    },
    {
      id: 3,
      actor_user_id: 2,
      actor_name: 'Bagus Prasetyo, S.Sos.',
      action: 'RESOLVE_TICKET',
      entity_table: 'consultation_tickets',
      entity_id: 'LIKO-2026-0402',
      detail: 'Tiket LIKO-2026-0402 diselesaikan dalam SLA (21 jam).',
      ip_masked: '10.20.***.18',
      created_at: hoursAgoIso(9),
    },
    {
      id: 4,
      actor_user_id: 3,
      actor_name: 'Siti Aminah, S.T.',
      action: 'UPDATE_FAQ',
      entity_table: 'knowledge_articles',
      entity_id: '5',
      detail: 'Pembaruan jadwal kejuruan CNC dan pengelasan UPTD BLK Sidoarjo.',
      ip_masked: '10.20.***.29',
      created_at: hoursAgoIso(32),
    },
  ];

  const micro_feedback: MicroFeedback[] = [
    { id: 1, rating: 5, category_code: 'AK1', comment: 'Balasan email sangat cepat, syaratnya jelas.', created_at: hoursAgoIso(18) },
    { id: 2, rating: 5, category_code: 'LOKER', comment: 'Informasi bursa kerja Sidoarjo mudah dicari.', created_at: hoursAgoIso(11) },
    { id: 3, rating: 4, category_code: 'PELATIHAN', comment: 'Panduan daftar BLK lengkap dan gratis.', created_at: hoursAgoIso(7) },
    { id: 4, rating: 5, category_code: 'HI', comment: 'Nomor tiket langsung bisa dipantau.', created_at: hoursAgoIso(2) },
  ];

  const unanswered_queries: UnansweredQuery[] = [
    {
      id: 1,
      query_text: 'Syarat pencairan JHT BPJS Ketenagakerjaan pasca resign',
      source: 'PORTAL_FAQ',
      hit_count: 14,
      resolved: false,
      last_seen_at: hoursAgoIso(5),
    },
    {
      id: 2,
      query_text: 'Prosedur pengajuan izin magang luar negeri / IMK',
      source: 'EMAIL_API',
      hit_count: 7,
      resolved: false,
      last_seen_at: hoursAgoIso(11),
    },
  ];

  return {
    users,
    service_categories,
    knowledge_articles,
    email_interaction_logs,
    consultation_tickets,
    audit_logs,
    micro_feedback,
    unanswered_queries,
  };
}

export function loadDb(): LikoDatabase {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seed = buildSeedDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as LikoDatabase;
    if (!parsed.unanswered_queries) {
      parsed.unanswered_queries = buildSeedDatabase().unanswered_queries;
    }
    return parsed;
  } catch {
    const seed = buildSeedDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
}

export function saveDb(db: LikoDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

export function nextId(items: Array<{ id: number }>): number {
  if (items.length === 0) return 1;
  return Math.max(...items.map((item) => item.id)) + 1;
}

export function recordAudit(
  db: LikoDatabase,
  params: {
    actorUserId: number | null;
    actorName: string;
    action: AuditLog['action'];
    entityTable: string;
    entityId: string;
    detail: string;
    ipMasked?: string;
  }
): void {
  db.audit_logs.unshift({
    id: nextId(db.audit_logs),
    actor_user_id: params.actorUserId,
    actor_name: params.actorName,
    action: params.action,
    entity_table: params.entityTable,
    entity_id: params.entityId,
    detail: params.detail,
    ip_masked: params.ipMasked || '127.0.***.1',
    created_at: new Date().toISOString(),
  });
  if (db.audit_logs.length > 200) {
    db.audit_logs = db.audit_logs.slice(0, 200);
  }
}

export function recordUnansweredQuery(
  db: LikoDatabase,
  queryText: string,
  source: UnansweredQuery['source']
): void {
  const normalized = queryText.trim();
  if (normalized.length < 3) return;
  const existing = db.unanswered_queries.find(
    (q) => q.query_text.toLowerCase() === normalized.toLowerCase() && !q.resolved
  );
  if (existing) {
    existing.hit_count += 1;
    existing.last_seen_at = new Date().toISOString();
  } else {
    db.unanswered_queries.unshift({
      id: nextId(db.unanswered_queries),
      query_text: normalized.slice(0, 140),
      source,
      hit_count: 1,
      resolved: false,
      last_seen_at: new Date().toISOString(),
    });
  }
}

export function computeDashboardMetrics(db: LikoDatabase): DashboardMetrics {
  const sentEmails = db.email_interaction_logs.filter((l) => l.delivery_status === 'SENT_AUTO');
  const avgMs =
    sentEmails.length > 0
      ? sentEmails.reduce((acc, item) => acc + item.response_time_ms, 0) / sentEmails.length
      : 45;

  const totalEmailInteractions = db.email_interaction_logs.length;
  const totalTickets = db.consultation_tickets.length;
  const totalArticleViews = db.knowledge_articles.reduce((acc, a) => acc + a.view_count, 0);

  const selfServiceNumerator = totalEmailInteractions + Math.round(totalArticleViews / 100);
  const selfServiceDenominator = selfServiceNumerator + totalTickets;
  const selfServiceRatio =
    selfServiceDenominator > 0
      ? Math.round((selfServiceNumerator / selfServiceDenominator) * 1000) / 10
      : 84.0;

  const resolvedTickets = db.consultation_tickets.filter((t) => t.status === 'RESOLVED').length;
  const openTickets = totalTickets - resolvedTickets;

  const compliantCount = db.consultation_tickets.filter((t) => {
    if (t.status === 'RESOLVED' && t.resolved_at) {
      return new Date(t.resolved_at).getTime() <= new Date(t.sla_deadline_at).getTime();
    }
    return Date.now() <= new Date(t.sla_deadline_at).getTime();
  }).length;

  const slaComplianceRate =
    totalTickets > 0 ? Math.round((compliantCount / totalTickets) * 1000) / 10 : 100;

  const satisfactionScore =
    db.micro_feedback.length > 0
      ? Math.round(
          (db.micro_feedback.reduce((sum, f) => sum + f.rating, 0) / db.micro_feedback.length) * 10
        ) / 10
      : 4.8;
  const satisfactionScale4 = Math.round(((satisfactionScore / 5) * 4) * 100) / 100;

  const topicDistribution = db.service_categories.map((cat) => {
    const emailCount = db.email_interaction_logs.filter(
      (l) => l.matched_category_id === cat.id
    ).length;
    const ticketCount = db.consultation_tickets.filter((t) => t.category_id === cat.id).length;
    return {
      code: cat.code,
      name: cat.name,
      emailCount,
      ticketCount,
      total: emailCount + ticketCount,
    };
  });

  const bucketLabels = ['00-03', '03-06', '06-09', '09-12', '12-15', '15-18', '18-21', '21-24'];
  const baseDistribution = [2, 1, 6, 11, 9, 5, 7, 4];
  const hourlyTraffic = bucketLabels.map((label, idx) => {
    const realCount = db.email_interaction_logs.filter((log) => {
      const hour = new Date(log.created_at).getHours();
      return Math.floor(hour / 3) === idx;
    }).length;
    return {
      hour: label,
      count: baseDistribution[idx] + realCount,
    };
  });

  // Out-of-office-hours ratio (15:00-09:00 buckets ~ 16:00-07:30 + weekends)
  const totalBucketTraffic = hourlyTraffic.reduce((s, b) => s + b.count, 0);
  const outOfHoursTraffic =
    hourlyTraffic[0].count +
    hourlyTraffic[1].count +
    hourlyTraffic[5].count +
    hourlyTraffic[6].count +
    hourlyTraffic[7].count;
  const outOfHoursRatio =
    totalBucketTraffic > 0
      ? Math.round((outOfHoursTraffic / totalBucketTraffic) * 1000) / 10
      : 40.0;

  // Dynamic recommendations for Lampiran D Executive Report
  const topTopic = [...topicDistribution].sort((a, b) => b.total - a.total)[0];
  const topUnanswered = db.unanswered_queries.filter((q) => !q.resolved)[0];
  const recommendations: string[] = [
    `Topik dengan permintaan tertinggi saat ini adalah ${topTopic?.name || 'AK1'} (${topTopic?.total || 0} interaksi). Prioritaskan pembaruan informasi kanal SIAPkerja dan sosialisasi BKK.`,
    `Proporsi akses di luar jam kerja mencapai ${outOfHoursRatio}% (target PRD 35%–45%), menunjukkan efektivitas layanan mandiri 24/7 bagi pekerja shift dan pencari kerja.`,
  ];
  if (topUnanswered) {
    recommendations.push(
      `Terdeteksi ${db.unanswered_queries.filter((q) => !q.resolved).length} kata kunci tak terjawab (teratas: "${topUnanswered.query_text}" sebanyak ${topUnanswered.hit_count}x). Disarankan menambah artikel FAQ baru.`
    );
  }

  return {
    avgResponseSeconds: Math.max(0.1, Math.round((avgMs / 1000) * 100) / 100),
    selfServiceRatio,
    slaComplianceRate,
    outOfHoursRatio,
    totalEmailInteractions,
    totalTickets,
    openTickets,
    resolvedTickets,
    satisfactionScore,
    satisfactionScale4,
    totalFeedbackCount: db.micro_feedback.length,
    topicDistribution,
    hourlyTraffic,
    recommendations,
  };
}

export function matchKeywordAndArticle(
  db: LikoDatabase,
  subject: string,
  body = ''
): {
  detectedKeyword: string;
  isHelpMenu?: boolean;
  category: ServiceCategory | null;
  article: KnowledgeArticle | null;
} {
  const rawCombined = `${subject} ${body}`.toLowerCase();
  const normalizedCompact = rawCombined.replace(/\s+/g, ' ').trim();
  const strippedSpaces = rawCombined.replace(/\s+/g, '');

  // Check BANTUAN command from PRD Page 4
  if (/\bbantuan\b/.test(normalizedCompact) || strippedSpaces === 'bantuan') {
    return {
      detectedKeyword: 'BANTUAN',
      isHelpMenu: true,
      category: null,
      article: null,
    };
  }

  // Exact + spacing-tolerant PRD trigger tokens (e.g. "info ak1", "info ak 1", "infoak1")
  const exactTriggers: Array<{ compact: string; display: string; code: ServiceCode }> = [
    { compact: 'infoak1', display: 'INFO AK1', code: 'AK1' },
    { compact: 'infoloker', display: 'INFO LOKER', code: 'LOKER' },
    { compact: 'infopelatihan', display: 'INFO PELATIHAN', code: 'PELATIHAN' },
    { compact: 'infohi', display: 'INFO HI', code: 'HI' },
  ];

  for (const trigger of exactTriggers) {
    if (strippedSpaces.includes(trigger.compact)) {
      const category = db.service_categories.find((c) => c.code === trigger.code) || null;
      const article =
        db.knowledge_articles.find(
          (a) => a.category_id === category?.id && a.is_published
        ) || null;
      return {
        detectedKeyword: trigger.display,
        category,
        article,
      };
    }
  }

  // Exact & fuzzy keyword matching across published knowledge_articles
  const tokens = normalizedCompact.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  let bestArticle: KnowledgeArticle | null = null;
  let bestScore = 0;
  let matchedToken = '';

  for (const article of db.knowledge_articles.filter((a) => a.is_published)) {
    let score = 0;
    let firstToken = '';
    for (const kw of article.keywords) {
      const kwLower = kw.toLowerCase();
      if (normalizedCompact.includes(kwLower)) {
        score += kwLower.length * 2;
        if (!firstToken) firstToken = kw.toUpperCase();
        continue;
      }
      // Fuzzy check per word for minor typos (e.g., "kartu kunng", "pelatihn", "lokr")
      const kwWords = kwLower.split(/\s+/).filter((w) => w.length >= 4);
      for (const kwWord of kwWords) {
        for (const token of tokens) {
          if (Math.abs(token.length - kwWord.length) <= 2) {
            const dist = levenshtein(token, kwWord);
            if (dist <= 1 || (kwWord.length >= 7 && dist <= 2)) {
              score += kwWord.length;
              if (!firstToken) firstToken = `${kw.toUpperCase()} (Fuzzy)`;
            }
          }
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestArticle = article;
      matchedToken = firstToken;
    }
  }

  if (bestArticle && bestScore >= 4) {
    const category =
      db.service_categories.find((c) => c.id === bestArticle?.category_id) || null;
    return {
      detectedKeyword: matchedToken || category?.keyword_trigger || 'UMUM',
      category,
      article: bestArticle,
    };
  }

  return {
    detectedKeyword: 'TIDAK_DIKENALI',
    category: null,
    article: null,
  };
}

export function getDivisionForCategory(code: ServiceCode): Exclude<TechnicalDivision, 'Sekretariat'> {
  if (code === 'PELATIHAN') return 'Lattas';
  if (code === 'HI') return 'HI';
  return 'Penta';
}

export function sanitizeTicketPriority(val: string | undefined): TicketPriority {
  return val === 'URGENT' ? 'URGENT' : 'NORMAL';
}

export function sanitizeTicketStatus(val: string | undefined): TicketStatus | null {
  if (val === 'OPEN' || val === 'IN_DISPOSITION' || val === 'IN_PROGRESS' || val === 'RESOLVED') {
    return val;
  }
  return null;
}
