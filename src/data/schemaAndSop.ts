export const POSTGRES_DDL_SCHEMA = `-- ============================================================================
-- SKEMA BASIS DATA RELASIONAL LIKO-SIDOARJO (PostgreSQL 16+)
-- Instansi: Dinas Tenaga Kerja Kabupaten Sidoarjo
-- Kepatuhan: Standar SPBE & UU No. 27 Tahun 2022 (UU PDP)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tabel Pengguna ASN & Pimpinan
CREATE TABLE users (
  id              BIGSERIAL PRIMARY KEY,
  nip             VARCHAR(24) NOT NULL UNIQUE,
  full_name       VARCHAR(120) NOT NULL,
  email           VARCHAR(160) NOT NULL UNIQUE,
  role            VARCHAR(32) NOT NULL CHECK (
                    role IN ('ADMIN_UTAMA', 'OPERATOR_PENTA', 'OPERATOR_LATTAS', 'MEDIATOR_HI', 'PIMPINAN')
                  ),
  division        VARCHAR(32) NOT NULL CHECK (
                    division IN ('Sekretariat', 'Penta', 'Lattas', 'HI')
                  ),
  password_hash   TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabel Kategori Layanan Utama (4 Pilar LIKO-Sidoarjo)
CREATE TABLE service_categories (
  id                BIGSERIAL PRIMARY KEY,
  code              VARCHAR(16) NOT NULL UNIQUE CHECK (code IN ('AK1', 'LOKER', 'PELATIHAN', 'HI')),
  name              VARCHAR(120) NOT NULL,
  slug              VARCHAR(80) NOT NULL UNIQUE,
  keyword_trigger   VARCHAR(64) NOT NULL UNIQUE,
  target_division   VARCHAR(32) NOT NULL CHECK (target_division IN ('Sekretariat', 'Penta', 'Lattas', 'HI')),
  automation_mode   VARCHAR(32) NOT NULL CHECK (automation_mode IN ('FULL_AUTO', 'HYBRID_ESCALATION')),
  sla_hours         INTEGER NOT NULL DEFAULT 24,
  description       TEXT NOT NULL,
  sort_order        SMALLINT NOT NULL DEFAULT 1
);

-- 3. Tabel Artikel Pengetahuan FAQ & Templat Auto-Responder
CREATE TABLE knowledge_articles (
  id                    BIGSERIAL PRIMARY KEY,
  category_id           BIGINT NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
  title                 VARCHAR(180) NOT NULL,
  slug                  VARCHAR(140) NOT NULL UNIQUE,
  keywords              TEXT[] NOT NULL DEFAULT '{}',
  summary               TEXT NOT NULL,
  content_markdown      TEXT NOT NULL,
  email_template_body   TEXT NOT NULL,
  sop_reference         VARCHAR(64) NOT NULL,
  is_published          BOOLEAN NOT NULL DEFAULT TRUE,
  view_count            INTEGER NOT NULL DEFAULT 0,
  helpful_count         INTEGER NOT NULL DEFAULT 0,
  updated_by            BIGINT NOT NULL REFERENCES users(id),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_knowledge_category ON knowledge_articles(category_id);
CREATE INDEX idx_knowledge_keywords ON knowledge_articles USING GIN(keywords);

-- 4. Tabel Log Interaksi Email API 24/7 (UU PDP: PII pengirim di-mask & di-hash)
CREATE TABLE email_interaction_logs (
  id                    BIGSERIAL PRIMARY KEY,
  message_id            VARCHAR(120) NOT NULL UNIQUE,
  sender_masked         VARCHAR(160) NOT NULL,
  sender_hash           CHAR(64) NOT NULL,
  subject_received      VARCHAR(240) NOT NULL,
  detected_keyword      VARCHAR(64) NOT NULL,
  matched_category_id   BIGINT REFERENCES service_categories(id) ON DELETE SET NULL,
  matched_article_id    BIGINT REFERENCES knowledge_articles(id) ON DELETE SET NULL,
  response_time_ms      INTEGER NOT NULL CHECK (response_time_ms >= 0),
  delivery_status       VARCHAR(32) NOT NULL CHECK (
                          delivery_status IN ('SENT_AUTO', 'RATE_LIMITED', 'FALLBACK_GUIDE')
                        ),
  auto_reply_preview    TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_logs_created_at ON email_interaction_logs(created_at DESC);
CREATE INDEX idx_email_logs_sender_hash ON email_interaction_logs(sender_hash, created_at DESC);

-- 5. Tabel Tiket Konsultasi & Eskalasi (SLA <= 1x24 Jam)
CREATE TABLE consultation_tickets (
  id                      BIGSERIAL PRIMARY KEY,
  ticket_number           VARCHAR(32) NOT NULL UNIQUE,
  category_id             BIGINT NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
  applicant_name          VARCHAR(120) NOT NULL,
  applicant_email_masked  VARCHAR(160) NOT NULL,
  applicant_phone_masked  VARCHAR(48) NOT NULL,
  nik_masked              VARCHAR(24) NOT NULL,
  applicant_contact_enc   BYTEA, -- Enkripsi AES-256 tingkat aplikasi khusus pejabat berwenang
  subject                 VARCHAR(200) NOT NULL,
  description             TEXT NOT NULL,
  assigned_division       VARCHAR(24) NOT NULL CHECK (assigned_division IN ('Penta', 'Lattas', 'HI')),
  assigned_user_id        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  status                  VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (
                            status IN ('OPEN', 'IN_DISPOSITION', 'IN_PROGRESS', 'RESOLVED')
                          ),
  priority                VARCHAR(16) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'URGENT')),
  resolution_note         TEXT,
  sla_deadline_at         TIMESTAMPTZ NOT NULL,
  resolved_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_status_div ON consultation_tickets(status, assigned_division);
CREATE INDEX idx_tickets_number ON consultation_tickets(ticket_number);

-- 6. Tabel Jejak Audit Keamanan SPBE
CREATE TABLE audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  actor_user_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_name      VARCHAR(120) NOT NULL,
  action          VARCHAR(48) NOT NULL,
  entity_table    VARCHAR(64) NOT NULL,
  entity_id       VARCHAR(64) NOT NULL,
  detail          TEXT NOT NULL,
  ip_masked       VARCHAR(64) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
`;

export interface EmailDraftTemplate {
  keyword: string;
  category: string;
  mode: string;
  subjectReply: string;
  body: string;
}

export const EMAIL_DRAFT_TEMPLATES: EmailDraftTemplate[] = [
  {
    keyword: 'INFO AK1',
    category: 'Kartu Pencari Kerja (AK1 / Kartu Kuning)',
    mode: 'Otomatis Penuh 24/7',
    subjectReply: '[LIKO-Sidoarjo] Panduan Resmi Penerbitan Kartu Pencari Kerja (AK1)',
    body: `Yth. Pemohon Layanan Ketenagakerjaan,

Terima kasih telah menghubungi LIKO-Sidoarjo (Dinas Tenaga Kerja Kabupaten Sidoarjo). Berikut informasi resmi pengurusan Kartu Pencari Kerja (AK1 / Kartu Kuning):

1. PERSYARATAN DOKUMEN
   - KTP Kabupaten Sidoarjo (asli & fotokopi) atau Surat Keterangan Domisili.
   - Ijazah pendidikan terakhir (asli/legalisir) + transkrip nilai.
   - Pas foto berwarna terbaru ukuran 3x4 sebanyak 2 lembar.
   - Sertifikat kompetensi/pengalaman kerja (jika ada).

2. ALUR PENDAFTARAN MANDIRI & VERIFIKASI
   - Langkah 1: Daftar akun di portal SIAPkerja (kemnaker.go.id) dan lengkapi profil kompetensi.
   - Langkah 2: Cetak bukti registrasi atau datang ke Loket Pelayanan AK1 Disnaker Kab. Sidoarjo (Jl. Raya Jati No. 4, Sidoarjo) pada jam kerja Senin-Jumat (08.00-15.00 WIB).
   - Langkah 3: Verifikasi berkas & pencetakan fisik kartu AK1 tanpa dipungut biaya (GRATIS / Rp0).

3. MASA BERLAKU & LAPOR STATUS
   - Kartu AK1 berlaku 2 tahun dan wajib lapor setiap 6 bulan sekali apabila belum bekerja.

Catatan Privasi (UU PDP): Email balasan otomatis ini tidak memproses atau mencantumkan NIK maupun data sensitif Anda. Jika kendala masih berlanjut, ajukan tiket konsultasi melalui Portal LIKO-Sidoarjo.

Hormat kami,
Sistem Layanan Otomatis LIKO-Sidoarjo
Dinas Tenaga Kerja Kabupaten Sidoarjo`,
  },
  {
    keyword: 'INFO LOKER',
    category: 'Informasi Lowongan Kerja & Bursa Kerja',
    mode: 'Otomatis Penuh 24/7',
    subjectReply: '[LIKO-Sidoarjo] Direktori Lowongan Kerja Terverifikasi Kabupaten Sidoarjo',
    body: `Yth. Pencari Kerja Kabupaten Sidoarjo,

Berikut panduan akses Lowongan Kerja terverifikasi Bidang Penempatan Tenaga Kerja (Penta) Disnaker Kab. Sidoarjo:

1. KANAL LOWONGAN RESMI TERVERIFIKASI
   - Portal Karirhub SIAPkerja: karirhub.kemnaker.go.id (filter lokasi: Kab. Sidoarjo).
   - Bursa Kerja Khusus (BKK) SMK/Perguruan Tinggi mitra Disnaker Kab. Sidoarjo.
   - Job Fair Berkala Disnaker Kab. Sidoarjo (jadwal diumumkan melalui portal resmi).

2. SEKTOR PERMINTAAN TINGGI DI SIDOARJO
   - Manufaktur & Pengolahan Logam/Pangan (Kawasan Industri Berbek, Rungkut-Sidoarjo, Buduran, Krian).
   - Logistik, Pergudangan & Rantai Pasok (Kec. Taman, Waru, Sedati).
   - Administrasi Perkantoran, Akuntansi & Teknisi Otomasi Industri.

3. WASPADA PENIPUAN LOWONGAN
   - Disnaker Kab. Sidoarjo dan perusahaan mitra resmi TIDAK pernah memungut biaya tes, seragam, atau akomodasi selama proses rekrutmen.

Untuk konsultasi penempatan khusus atau verifikasi legalitas lowongan, ajukan tiket melalui Portal LIKO-Sidoarjo agar diteruskan ke Bidang Penta.

Hormat kami,
Sistem Layanan Otomatis LIKO-Sidoarjo`,
  },
  {
    keyword: 'INFO PELATIHAN',
    category: 'Pelatihan Kerja & Sertifikasi (BLK)',
    mode: 'Otomatis Penuh 24/7',
    subjectReply: '[LIKO-Sidoarjo] Jadwal Pelatihan Vokasi & Sertifikasi Kompetensi BLK',
    body: `Yth. Calon Peserta Pelatihan Kerja,

Berikut informasi program Pelatihan Berbasis Kompetensi (PBK) melalui Bidang Pelatihan Kerja & Produktivitas (Lattas) / UPTD BLK Sidoarjo:

1. KEJURUAN UNGGULAN YANG TERSEDIA
   - Teknik Manufaktur (Bubut, Las SMAW/GMAW, CNC Dasar)
   - Teknik Otomasi Listrik & Pendingin (AC)
   - Desain Grafis, Pemrograman Web & Pemasaran Digital
   - Tata Boga, Tata Busana & Kewirausahaan Mikro

2. PERSYARATAN PESERTA (BIAYA GRATIS / APBD-APBN)
   - Warga ber-KTP Kabupaten Sidoarjo, usia 18-35 tahun, tidak sedang menempuh pendidikan formal.
   - Mengikuti seleksi administrasi dan wawancara minat bakat.
   - Lulus pelatihan berhak mengikuti Uji Kompetensi sertifikasi BNSP.

3. CARA MENDAFTAR
   - Buat akun SIAPkerja dan pilih menu "Pelatihan" -> cari penyelenggara "UPTD BLK Sidoarjo".

Hormat kami,
Sistem Layanan Otomatis LIKO-Sidoarjo`,
  },
  {
    keyword: 'INFO HI',
    category: 'Hubungan Industrial & Perselisihan',
    mode: 'Otomatis Info Umum + Tiket Eskalasi Mediator',
    subjectReply: '[LIKO-Sidoarjo] Panduan Hubungan Industrial, Upah & Mediasi Perselisihan',
    body: `Yth. Pekerja / Pengusaha Kabupaten Sidoarjo,

Berikut informasi awal Bidang Hubungan Industrial & Jaminan Sosial Tenaga Kerja (HI) Disnaker Kab. Sidoarjo:

1. RUANG LINGKUP LAYANAN BIDANG HI
   - Konsultasi PKWT/PKWTT, peraturan perusahaan, dan Perjanjian Kerja Bersama (PKB).
   - Informasi kepatuhan Upah Minimum Kabupaten (UMK) Sidoarjo & THR Keagamaan.
   - Prosedur Bipartit & Pencatatan Perselisihan Hubungan Industrial (PHI / PHK / Pesangon).

2. TAHAPAN WAJIB SEBELUM MEDIASI DISNAKER
   - Langkah 1: Lakukan perundingan Bipartit antara pekerja/serikat pekerja dengan manajemen perusahaan secara tertulis (maksimal 30 hari kerja, buat risalah perundingan).
   - Langkah 2: Jika tidak tercapai kesepakatan, ajukan pencatatan perselisihan ke Bidang HI Disnaker Kab. Sidoarjo dengan melampirkan risalah Bipartit.

3. BUTUH PENDAMPINGAN MEDIATOR?
   - Karena kasus hubungan industrial bersifat spesifik dan rahasia, silakan ajukan Tiket Konsultasi melalui Portal LIKO-Sidoarjo (kategori Hubungan Industrial). Tim Mediator HI akan menindaklanjuti sesuai SLA maksimal 1x24 jam kerja.

Hormat kami,
Sistem Layanan Otomatis LIKO-Sidoarjo`,
  },
];

export interface SopDocument {
  code: string;
  title: string;
  scope: string;
  sla: string;
  steps: string[];
}

export const SERVICE_SOP_DOCUMENTS: SopDocument[] = [
  {
    code: 'SOP-LIKO-01',
    title: 'SOP Layanan Informasi Otomatis Email API 24/7',
    scope: 'Permintaan informasi standar (AK1, Lowongan Kerja, Pelatihan BLK, Panduan Umum HI)',
    sla: 'Waktu respons sistem < 30 detik (24 jam / 7 hari)',
    steps: [
      'Pemohon mengirim email ke alamat resmi liko@disnaker.sidoarjokab.go.id dengan mencantumkan kata kunci pemicu pada subjek (INFO AK1, INFO LOKER, INFO PELATIHAN, INFO HI).',
      'Webhook Gateway memvalidasi batas laju permintaan (rate-limiter maksimal 5 permintaan/menit/pengirim) untuk mencegah spam dan penyalahgunaan.',
      'Mesin pencocokan kata kunci memetakan subjek ke tabel service_categories dan knowledge_articles yang berstatus terpublikasi.',
      'Sistem mengirim balasan email otomatis dalam < 30 detik dan mencatat log ter-masking ke tabel email_interaction_logs sesuai prinsip minimisasi data UU PDP.',
    ],
  },
  {
    code: 'SOP-LIKO-02',
    title: 'SOP Eskalasi & Disposisi Tiket Konsultasi Teknis',
    scope: 'Konsultasi spesifik, verifikasi kasus perselisihan HI, dan kendala penempatan/pelatihan',
    sla: 'Disposisi & respons awal petugas <= 1x24 jam kerja',
    steps: [
      'Pemohon mengisi formulir konsultasi pada Portal Publik LIKO-Sidoarjo dan menerima nomor tiket unik (format LIKO-YYYY-XXXX) beserta estimasi batas waktu SLA.',
      'Sistem melakukan perutean otomatis awal berdasarkan kategori layanan: Penta (AK1 & Loker), Lattas (Pelatihan BLK), dan HI (Hubungan Industrial).',
      'Admin Utama / Kepala Bidang memeriksa antrean tiket pada Dashboard ASN, memvalidasi prioritas (Normal/Urgent), dan mendisposisikan tiket ke ASN atau Mediator terkait.',
      'Pejabat teknis mencatat hasil tindak lanjut pada kolom resolution_note, mengubah status menjadi RESOLVED, sehingga pemohon dapat memantau perkembangan lewat fitur Lacak Tiket.',
    ],
  },
  {
    code: 'SOP-LIKO-03',
    title: 'SOP Kepatuhan Keamanan SPBE & Perlindungan Data Pribadi (UU PDP)',
    scope: 'Seluruh alur pemrosesan email terbuka, pencatatan log, dan penyimpanan tiket konsultasi',
    sla: 'Audit trail aktif 100% pada setiap aksi perubahan data',
    steps: [
      'Email balasan otomatis dilarang keras menampilkan NIK lengkap, alamat rumah detail, nomor telepon pribadi, atau lampiran berkas pemohon pada badan email terbuka.',
      'Alamat email pengirim pada tabel email_interaction_logs disimpan dalam format samaran (masked) disertai hash SHA-256 untuk keperluan deteksi anti-spam tanpa mengekspos identitas.',
      'NIK dan kontak pemohon pada pelacakan tiket publik hanya menampilkan 4 digit/karakter terakhir; akses penuh dibatasi hanya bagi ASN berwenang sesuai peran (RBAC).',
      'Setiap operasi CRUD artikel FAQ, disposisi tiket, penolakan rate-limiter, dan ekspor laporan pimpinan dicatat otomatis ke tabel audit_logs.',
    ],
  },
];
