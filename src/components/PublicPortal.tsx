import { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  FileSearch,
  Mail,
  Send,
  ShieldCheck,
  Star,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import type {
  ConsultationTicket,
  KnowledgeArticle,
  ServiceCategory,
  ServiceCode,
} from '../types/liko';

interface PublicSummary {
  avgResponseSeconds: number;
  selfServiceRatio: number;
  slaComplianceRate: number;
  outOfHoursRatio: number;
  satisfactionScore: number;
  satisfactionScale4: number;
  totalFeedbackCount: number;
}

interface PublicPortalProps {
  categories: ServiceCategory[];
  articles: KnowledgeArticle[];
  summary: PublicSummary;
  onHelpfulClick: (articleId: number) => Promise<void>;
  onRefreshSummary: () => Promise<void>;
  onOpenSchemaSop: () => void;
}

interface WebhookReplyResult {
  status: string;
  detectedKeyword: string;
  categoryCode: ServiceCode | 'UMUM';
  categoryName: string;
  responseTimeMs: number;
  senderMasked: string;
  replySubject: string;
  replyBody: string;
}

interface TrackedTicketResult {
  ticket: ConsultationTicket;
  category: ServiceCategory | null;
  assignedOfficer: string | null;
}

const STATUS_LABELS: Record<ConsultationTicket['status'], string> = {
  OPEN: 'Menunggu Disposisi',
  IN_DISPOSITION: 'Didisposisikan ke Bidang',
  IN_PROGRESS: 'Sedang Ditangani Petugas',
  RESOLVED: 'Selesai Ditindaklanjuti',
};

const STEP_BY_STEP_GUIDES: Record<
  'AK1' | 'BLK' | 'HI',
  { title: string; subtitle: string; steps: Array<{ label: string; detail: string }> }
> = {
  AK1: {
    title: 'Alur Pendaftaran Kartu Pencari Kerja (AK1)',
    subtitle: 'Gratis (Rp0) · Masa berlaku 2 tahun · Lapor tiap 6 bulan',
    steps: [
      {
        label: 'Siapkan Berkas Dasar',
        detail: 'KTP Kab. Sidoarjo, Ijazah terakhir, transkrip nilai, dan pas foto berwarna 3x4 (2 lembar).',
      },
      {
        label: 'Registrasi Akun SIAPkerja',
        detail: 'Buka siapkerja.kemnaker.go.id, lengkapi profil kompetensi & riwayat pendidikan.',
      },
      {
        label: 'Verifikasi & Cetak Loket',
        detail: 'Tunjukkan bukti registrasi di Loket AK1 Disnaker Sidoarjo (Jl. Raya Jati No. 4) pada jam kerja.',
      },
      {
        label: 'Lapor Status Penempatan',
        detail: 'Laporkan pembaruan status bekerja setiap 6 bulan secara daring atau melalui loket.',
      },
    ],
  },
  BLK: {
    title: 'Alur Pendaftaran Pelatihan Vokasi & Sertifikasi BLK',
    subtitle: 'Dibiayai APBD/APBN (Gratis) · Sertifikat Kompetensi BNSP',
    steps: [
      {
        label: 'Pilih Kejuruan Pelatihan',
        detail: 'Tentukan minat (CNC, Las SMAW, Listrik, Pendingin AC, Pemrograman Web, Tata Boga).',
      },
      {
        label: 'Daftar via SIAPkerja',
        detail: 'Masuk ke menu Pelatihan dan pilih penyelenggara resmi UPTD BLK Kabupaten Sidoarjo.',
      },
      {
        label: 'Seleksi Administrasi & Minat',
        detail: 'Ikuti verifikasi KTP Sidoarjo (usia 18–35 tahun) dan tes wawancara kejuruan.',
      },
      {
        label: 'Pelatihan & Uji Kompetensi',
        detail: 'Selesaikan jam pelatihan praktik bengkel dan ikuti sertifikasi profesi BNSP.',
      },
    ],
  },
  HI: {
    title: 'Alur Pelaporan Perselisihan Hubungan Industrial',
    subtitle: 'Rahasia & Terdokumentasi · SLA Mediator 1×24 Jam Kerja',
    steps: [
      {
        label: 'Perundingan Bipartit',
        detail: 'Lakukan musyawarah tertulis antara pekerja/serikat dengan perusahaan maksimal 30 hari kerja.',
      },
      {
        label: 'Susun Risalah Bipartit',
        detail: 'Dokumentasikan pokok perselisihan dan hasil perundingan yang ditandatangani para pihak.',
      },
      {
        label: 'Ajukan Tiket Konsultasi HI',
        detail: 'Kirim kronologi melalui form Tiket LIKO-Sidoarjo agar dijadwalkan telaah oleh Mediator HI.',
      },
      {
        label: 'Klarifikasi & Mediasi Tripartit',
        detail: 'Mediator Disnaker memfasilitasi mediasi resmi hingga terbit Perjanjian Bersama atau Anjuran.',
      },
    ],
  },
};

const PUBLIC_FORMS = [
  {
    code: 'FORM-AK1',
    title: 'Blangko Permohonan Kartu Pencari Kerja (AK1)',
    division: 'Bidang Penta · Gratis',
    lines: [
      'FORMULIR PENDAFTARAN PENCARI KERJA (AK1)',
      'Dinas Tenaga Kerja Kabupaten Sidoarjo - Jl. Raya Jati No. 4',
      '------------------------------------------------------------',
      '1. Nama Lengkap (Sesuai KTP)   : _____________________________',
      '2. NIK (16 Digit)              : _____________________________',
      '3. Alamat Domisili Sidoarjo    : _____________________________',
      '4. Pendidikan Terakhir / Prodi : _____________________________',
      '5. Keahlian / Sertifikat       : _____________________________',
      '6. Nomor HP / Email Aktif      : _____________________________',
      '',
      'Lampiran Wajib: Fotokopi KTP, Fotokopi Ijazah, Pas Foto 3x4 (2 lbr).',
      'Seluruh proses penerbitan Kartu AK1 TIDAK DIPUNGUT BIAYA (Rp0).',
    ],
  },
  {
    code: 'FORM-BLK',
    title: 'Surat Pernyataan Kesanggupan Peserta UPTD BLK',
    division: 'Bidang Lattas · Gratis',
    lines: [
      'SURAT PERNYATAAN CALON PESERTA PELATIHAN VOKASI',
      'UPTD Balai Latihan Kerja (BLK) Kabupaten Sidoarjo',
      '------------------------------------------------------------',
      'Saya yang bertanda tangan di bawah ini menyatakan bersedia:',
      '1. Mengikuti seluruh jam pelatihan berbasis kompetensi hingga selesai.',
      '2. Mematuhi tata tertib keselamatan kerja (K3) di bengkel praktik.',
      '3. Mengikuti Uji Kompetensi Sertifikasi BNSP pada akhir program.',
      '4. Tidak sedang menempuh pendidikan formal / bekerja aktif.',
      '',
      'Nama Calon Peserta: ___________________   Tanda Tangan: ________',
    ],
  },
  {
    code: 'FORM-HI',
    title: 'Format Risalah Perundingan Bipartit (Syarat Mediasi HI)',
    division: 'Bidang HI · Rahasia',
    lines: [
      'RISALAH PERUNDINGAN BIPARTIT HUBUNGAN INDUSTRIAL',
      'Referensi Pencatatan Perselisihan - Disnaker Kab. Sidoarjo',
      '------------------------------------------------------------',
      'Hari / Tanggal Perundingan     : _____________________________',
      'Nama Perusahaan & Alamat       : _____________________________',
      'Nama Pekerja / Serikat Pekerja : _____________________________',
      'Pokok Perselisihan             : (PHK / Hak Normatif / Upah)',
      'Pendapat Pekerja               : _____________________________',
      'Pendapat Pengusaha             : _____________________________',
      'Kesimpulan (Sepakat / Gagal)   : _____________________________',
      '',
      'Catatan: Lampirkan risalah ini saat konsultasi dengan Mediator HI.',
    ],
  },
];

export default function PublicPortal({
  categories,
  articles,
  summary,
  onHelpfulClick,
  onRefreshSummary,
  onOpenSchemaSop,
}: PublicPortalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ServiceCode | 'ALL'>('ALL');
  const [expandedArticleId, setExpandedArticleId] = useState<number | null>(
    articles[0]?.id ?? null
  );
  const [helpfulDoneIds, setHelpfulDoneIds] = useState<number[]>([]);
  const [missLoggedNotice, setMissLoggedNotice] = useState<string | null>(null);

  // Step-by-step interactive guide state (Page 5 PRD)
  const [activeGuideTab, setActiveGuideTab] = useState<'AK1' | 'BLK' | 'HI'>('AK1');

  // Email API Copy & Live Simulator states
  const [copiedKeyword, setCopiedKeyword] = useState<string | null>(null);
  const [testEmailFrom, setTestEmailFrom] = useState('warga.sidoarjo@gmail.com');
  const [testEmailSubject, setTestEmailSubject] = useState('INFO AK1');
  const [testEmailBody, setTestEmailBody] = useState(
    'Selamat malam admin, mohon informasi syarat pembuatan kartu kuning di Disnaker Sidoarjo.'
  );
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [webhookResult, setWebhookResult] = useState<WebhookReplyResult | null>(null);
  const [webhookFeedbackSent, setWebhookFeedbackSent] = useState<string | null>(null);

  // Ticket Submission states
  const [ticketCategory, setTicketCategory] = useState<ServiceCode>('HI');
  const [applicantName, setApplicantName] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [applicantNik, setApplicantNik] = useState('');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketPriority, setTicketPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketFormError, setTicketFormError] = useState<string | null>(null);
  const [createdTicket, setCreatedTicket] = useState<ConsultationTicket | null>(null);

  // Ticket Tracking states (FR-05: Ticket Number + Email)
  const [trackCode, setTrackCode] = useState('LIKO-2026-0401');
  const [trackEmail, setTrackEmail] = useState('slamet.taman@gmail.com');
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackedResult, setTrackedResult] = useState<TrackedTicketResult | null>(null);
  const [ticketFeedbackSent, setTicketFeedbackSent] = useState<string | null>(null);

  // Micro-feedback states
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackTopic, setFeedbackTopic] = useState<ServiceCode | 'UMUM'>('UMUM');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  // Image fallback flags
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [ak1ImgFailed, setAk1ImgFailed] = useState(false);
  const [blkImgFailed, setBlkImgFailed] = useState(false);

  const filteredArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return articles.filter((art) => {
      const cat = categories.find((c) => c.id === art.category_id);
      if (selectedCategory !== 'ALL' && cat?.code !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      const hay = `${art.title} ${art.summary} ${art.content_markdown} ${art.keywords.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [articles, categories, searchQuery, selectedCategory]);

  const handleCopyKeyword = async (kw: string) => {
    try {
      await navigator.clipboard.writeText(kw);
    } catch {
      // Clipboard fallback ignored cleanly
    }
    setCopiedKeyword(kw);
    setTestEmailSubject(kw);
    setTimeout(() => setCopiedKeyword(null), 1600);
  };

  const handleSelectCategoryCard = (code: ServiceCode) => {
    setSelectedCategory(code);
    const firstInCat = articles.find((a) => {
      const c = categories.find((cat) => cat.id === a.category_id);
      return c?.code === code;
    });
    if (firstInCat) setExpandedArticleId(firstInCat.id);
    document.getElementById('layanan-faq')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleLogMissedSearch = async () => {
    const q = searchQuery.trim();
    if (q.length < 3) return;
    await fetch('/api/public/faq/log-miss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queryText: q }),
    });
    setMissLoggedNotice(
      `Kata kunci "${q}" telah dicatat untuk penambahan artikel FAQ oleh pengelola.`
    );
  };

  const handleDownloadFormPdf = (formItem: (typeof PUBLIC_FORMS)[number]) => {
    const doc = new jsPDF();
    doc.setFontSize(13);
    doc.text(formItem.title, 14, 20);
    doc.setFontSize(9.5);
    doc.text(`${formItem.code} · ${formItem.division}`, 14, 27);
    doc.line(14, 31, 196, 31);
    doc.setFontSize(10);
    let y = 40;
    for (const line of formItem.lines) {
      doc.text(line, 14, y);
      y += 7;
    }
    doc.save(`${formItem.code.toLowerCase()}-disnaker-sidoarjo.pdf`);
  };

  const handleSendTestWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setWebhookLoading(true);
    setWebhookError(null);
    setWebhookFeedbackSent(null);
    try {
      const res = await fetch('/api/webhook/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: testEmailFrom,
          subject: testEmailSubject,
          body: testEmailBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWebhookError(data.error || 'Gagal memproses uji Email API.');
      } else {
        setWebhookResult(data);
        await onRefreshSummary();
      }
    } catch {
      setWebhookError('Terjadi kendala jaringan saat menghubungi webhook Email API.');
    } finally {
      setWebhookLoading(false);
    }
  };

  const handleQuickFeedback = async (
    rating: number,
    categoryCode: ServiceCode | 'UMUM',
    comment: string,
    source: 'webhook' | 'ticket'
  ) => {
    const res = await fetch('/api/public/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, categoryCode, comment }),
    });
    if (res.ok) {
      await onRefreshSummary();
      if (source === 'webhook') {
        setWebhookFeedbackSent(
          rating >= 4
            ? 'Penilaian 1-klik "Membantu" tercatat.'
            : 'Penilaian 1-klik "Perlu Perbaikan" tercatat.'
        );
      } else {
        setTicketFeedbackSent('Terima kasih, penilaian penyelesaian tiket Anda tersimpan.');
      }
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setTicketSubmitting(true);
    setTicketFormError(null);
    try {
      const res = await fetch('/api/public/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryCode: ticketCategory,
          applicantName,
          applicantEmail,
          applicantPhone,
          nik: applicantNik,
          subject: ticketSubject,
          description: ticketDescription,
          priority: ticketPriority,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTicketFormError(data.error || 'Pengajuan tiket gagal diproses.');
      } else {
        const submittedEmail = applicantEmail;
        setCreatedTicket(data.ticket);
        setTrackCode(data.ticket.ticket_number);
        setTrackEmail(submittedEmail);
        setApplicantName('');
        setApplicantEmail('');
        setApplicantPhone('');
        setApplicantNik('');
        setTicketSubject('');
        setTicketDescription('');
        await handleTrackTicket(data.ticket.ticket_number, submittedEmail);
        await onRefreshSummary();
      }
    } catch {
      setTicketFormError('Gagal mengirim formulir tiket. Periksa koneksi Anda.');
    } finally {
      setTicketSubmitting(false);
    }
  };

  const handleTrackTicket = async (customCode?: string, customEmail?: string) => {
    const code = (customCode ?? trackCode).trim();
    const email = (customEmail ?? trackEmail).trim();
    if (!code) return;
    setTrackLoading(true);
    setTrackError(null);
    setTicketFeedbackSent(null);
    try {
      const qs = email ? `?email=${encodeURIComponent(email)}` : '';
      const res = await fetch(`/api/public/tickets/${encodeURIComponent(code)}${qs}`);
      const data = await res.json();
      if (!res.ok) {
        setTrackedResult(null);
        setTrackError(data.error || 'Nomor tiket tidak ditemukan.');
      } else {
        setTrackedResult(data);
      }
    } catch {
      setTrackError('Gagal melacak status tiket.');
    } finally {
      setTrackLoading(false);
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackSubmitting(true);
    setFeedbackSuccess(null);
    try {
      const res = await fetch('/api/public/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: feedbackRating,
          categoryCode: feedbackTopic,
          comment: feedbackComment,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackComment('');
        setFeedbackSuccess(
          `Terima kasih! Skor kepuasan terkini: ${data.satisfactionScale4} / 4.00 (${data.satisfactionScore} / 5.0 dari ${data.totalFeedbackCount} ulasan).`
        );
        await onRefreshSummary();
      }
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const activeStepGuide = STEP_BY_STEP_GUIDES[activeGuideTab];

  return (
    <div>
      {/* 1. HERO SPLIT + 4-COLUMN CATEGORY STRIP */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-stretch">
            <div className="flex flex-col justify-between lg:col-span-6">
              <div>
                <p className="text-xs font-semibold text-[#0284C7]">
                  Dinas Tenaga Kerja Kabupaten Sidoarjo
                </p>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#0F294A] sm:text-4xl lg:text-[2.65rem] lg:leading-[1.15] text-balance">
                  Informasi Kerja Cepat, Tepat, 24 Jam Tanpa Sekat.
                </h1>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
                  Portal resmi layanan informasi ketenagakerjaan terpadu Kabupaten Sidoarjo: pencarian FAQ mandiri, otomatisasi Email API 24/7 di bawah 30 detik, dan tiket eskalasi konsultasi berstandar SLA 1×24 jam.
                </p>

                {/* Instant FAQ Search Bar */}
                <div className="mt-7">
                  <label
                    htmlFor="hero-faq-search"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Cari Informasi Layanan Ketenagakerjaan Instan
                  </label>
                  <div className="mt-2 flex gap-2">
                    <div className="relative flex-1">
                      <FileSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="hero-faq-search"
                        type="search"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setSelectedCategory('ALL');
                          setMissLoggedNotice(null);
                        }}
                        placeholder='Ketik kata kunci: "kartu kuning", "loker", "blk", "pesangon"...'
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0284C7] focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      />
                    </div>
                    <a
                      href="#layanan-faq"
                      className="inline-flex h-11 items-center justify-center rounded-lg bg-[#0284C7] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0369A1] whitespace-nowrap shrink-0"
                    >
                      Cari FAQ
                    </a>
                  </div>

                  {searchQuery.trim().length > 0 && (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-medium text-slate-500 tabular-nums">
                        Ditemukan {filteredArticles.length} panduan untuk "{searchQuery.trim()}"
                      </p>
                      {filteredArticles.length > 0 ? (
                        <ul className="mt-2 divide-y divide-slate-200">
                          {filteredArticles.slice(0, 3).map((art) => (
                            <li key={art.id} className="py-2 first:pt-0 last:pb-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedArticleId(art.id);
                                  document
                                    .getElementById('layanan-faq')
                                    ?.scrollIntoView({ behavior: 'smooth' });
                                }}
                                className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-[#0F294A] hover:text-[#0284C7]"
                              >
                                <span className="truncate">{art.title}</span>
                                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-1.5 space-y-2">
                          <p className="text-xs text-slate-600">
                            Belum ditemukan artikel yang cocok. Anda dapat mencatat kata kunci ini atau mengajukan tiket konsultasi.
                          </p>
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={handleLogMissedSearch}
                              className="text-xs font-semibold text-[#0284C7] hover:underline"
                            >
                              Usulkan sebagai topik FAQ baru
                            </button>
                            <a
                              href="#tiket-konsultasi"
                              className="text-xs font-semibold text-[#0F294A] hover:underline"
                            >
                              Ajukan Tiket Konsultasi
                            </a>
                          </div>
                          {missLoggedNotice && (
                            <p className="text-[11px] font-medium text-emerald-700">
                              {missLoggedNotice}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-4 border-t border-slate-200 pt-5">
                <div>
                  <p className="font-mono text-lg font-bold text-[#0F294A] tabular-nums">
                    {summary.avgResponseSeconds} dtk
                  </p>
                  <p className="text-xs text-slate-500">Respons Email API</p>
                </div>
                <div>
                  <p className="font-mono text-lg font-bold text-[#0F294A] tabular-nums">
                    {summary.selfServiceRatio}%
                  </p>
                  <p className="text-xs text-slate-500">Rasio Self-Service</p>
                </div>
                <div>
                  <p className="font-mono text-lg font-bold text-[#0F294A] tabular-nums">
                    {summary.satisfactionScale4} / 4.00
                  </p>
                  <p className="text-xs text-slate-500">Indeks Kepuasan (IKM)</p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-64 overflow-hidden rounded-xl border border-slate-200 bg-[#0F294A] sm:h-80 lg:h-full lg:min-h-[380px]">
                {!heroImgFailed ? (
                  <img
                    src="/src/assets/images/hero_sidoarjo_atrium_1794897283525.jpg"
                    alt="Ruang Pelayanan Publik Terpadu Dinas Tenaga Kerja Kabupaten Sidoarjo"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0F294A] to-[#0284C7] p-8 text-white">
                    <p className="text-center text-sm font-medium">
                      Pusat Layanan Informasi Ketenagakerjaan Kabupaten Sidoarjo
                    </p>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-transparent p-5 text-white">
                  <p className="text-xs font-medium text-sky-200">
                    Jl. Raya Jati No. 4, Sidoarjo · Layanan Digital 24/7
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    Integrasi Otomatis Email API, Portal FAQ & Disposisi Bidang Teknis
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((cat, idx) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectCategoryCard(cat.code)}
                className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-5 text-left transition-colors hover:border-[#0284C7] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7]"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono font-semibold text-[#0284C7] tabular-nums">
                      0{idx + 1}. {cat.code}
                    </span>
                    <span>
                      {cat.automation_mode === 'FULL_AUTO'
                        ? 'Otomatis 24/7'
                        : 'Otomatis + Mediator'}
                    </span>
                  </div>
                  <h2 className="mt-2.5 text-sm font-bold text-[#0F294A] group-hover:text-[#0284C7]">
                    {cat.name}
                  </h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    {cat.description}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-200/80 pt-3 text-xs font-medium text-slate-700">
                  <span className="font-mono text-[11px] text-slate-500">
                    {cat.keyword_trigger}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[#0284C7]">
                    Buka FAQ
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 2. PORTAL FAQ INTERAKTIF + PANDUAN LANGKAH-DEMI-LANGKAH & BLANGKO */}
      <section id="layanan-faq" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs font-semibold text-[#0284C7]">Basis Pengetahuan Terverifikasi</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#0F294A]">
              Portal FAQ & Panduan Resmi Layanan
            </h2>
          </div>

          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                selectedCategory === 'ALL'
                  ? 'bg-white text-[#0F294A] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua Topik
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.code)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  selectedCategory === cat.code
                    ? 'bg-white text-[#0F294A] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat.code}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-8">
            {filteredArticles.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                <p className="text-sm font-semibold text-slate-900">
                  Tidak ada artikel FAQ yang cocok dengan pencarian Anda.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Coba hapus kata kunci pencarian atau ajukan pertanyaan melalui Tiket Konsultasi di bawah.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('ALL');
                  }}
                  className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Reset Filter
                </button>
              </div>
            ) : (
              filteredArticles.map((article) => {
                const cat = categories.find((c) => c.id === article.category_id);
                const isExpanded = expandedArticleId === article.id;
                const alreadyHelpful = helpfulDoneIds.includes(article.id);
                return (
                  <article
                    key={article.id}
                    className="rounded-xl border border-slate-200 bg-white transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedArticleId(isExpanded ? null : article.id)
                      }
                      className="flex w-full items-start justify-between gap-4 p-5 text-left"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-semibold text-[#0284C7]">
                            {cat?.name || 'Umum'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{article.sop_reference}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{article.view_count} dibaca</span>
                        </div>
                        <h3 className="mt-1.5 text-base font-bold text-[#0F294A]">
                          {article.title}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">{article.summary}</p>
                      </div>
                      <span className="mt-1 rounded-md border border-slate-200 p-1.5 text-slate-500 shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4">
                        <div className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                          {article.content_markdown}
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                          <p className="text-xs text-slate-500">
                            Kata kunci Email API:{' '}
                            <span className="font-mono font-semibold text-slate-700">
                              {cat?.keyword_trigger}
                            </span>
                          </p>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              disabled={alreadyHelpful}
                              onClick={async () => {
                                await onHelpfulClick(article.id);
                                setHelpfulDoneIds((prev) => [...prev, article.id]);
                              }}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                                alreadyHelpful
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <ThumbsUp className="h-3.5 w-3.5" />
                              {alreadyHelpful ? 'Terima kasih' : 'Membantu'} (
                              <span className="tabular-nums">{article.helpful_count}</span>)
                            </button>
                            <a
                              href="#tiket-konsultasi"
                              onClick={() => {
                                if (cat?.code) setTicketCategory(cat.code);
                              }}
                              className="text-xs font-semibold text-[#0284C7] hover:underline whitespace-nowrap shrink-0"
                            >
                              Butuh Eskalasi Tiket?
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            )}

            {/* Panduan Langkah-demi-Langkah Interaktif (PRD Halaman 5) */}
            <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs font-semibold text-[#0284C7]">Alur Visual Interaktif</p>
                  <h3 className="mt-0.5 text-base font-bold text-[#0F294A]">
                    Panduan Langkah-demi-Langkah Layanan
                  </h3>
                </div>
                <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                  {(['AK1', 'BLK', 'HI'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveGuideTab(tab)}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        activeGuideTab === tab
                          ? 'bg-white text-[#0F294A] shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab === 'AK1' ? 'Daftar AK1' : tab === 'BLK' ? 'Pelatihan BLK' : 'Pelaporan HI'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <p className="text-sm font-bold text-[#0F294A]">{activeStepGuide.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{activeStepGuide.subtitle}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {activeStepGuide.steps.map((step, i) => (
                    <div
                      key={step.label}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                    >
                      <p className="font-mono text-xs font-bold text-[#0284C7] tabular-nums">
                        Langkah 0{i + 1}
                      </p>
                      <p className="mt-1 text-xs font-bold text-[#0F294A]">{step.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{step.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Editorial Media & Downloadable Forms Column */}
          <div className="space-y-6 lg:col-span-4">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="aspect-[4/3] w-full bg-slate-100">
                {!ak1ImgFailed ? (
                  <img
                    src="/src/assets/images/service_ak1_card_1794897264783.jpg"
                    alt="Pelayanan Verifikasi Kartu Pencari Kerja AK1 Kabupaten Sidoarjo"
                    referrerPolicy="no-referrer"
                    onError={() => setAk1ImgFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-slate-100 p-4 text-xs text-slate-500">
                    Layanan AK1 / Kartu Kuning Gratis
                  </div>
                )}
              </div>
              <div className="p-4">
                <p className="text-xs font-medium text-slate-500">Bidang Penta · Bebas Biaya (Rp0)</p>
                <h3 className="mt-1 text-sm font-bold text-[#0F294A]">
                  Penerbitan AK1 & Penempatan Kerja
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Daftar akun SIAPkerja terlebih dahulu sebelum verifikasi loket agar pencetakan Kartu Kuning selesai dalam hitungan menit.
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="aspect-[4/3] w-full bg-slate-100">
                {!blkImgFailed ? (
                  <img
                    src="/src/assets/images/service_blk_training_1794897265306.jpg"
                    alt="Pelatihan Vokasi dan Sertifikasi BNSP di UPTD BLK Sidoarjo"
                    referrerPolicy="no-referrer"
                    onError={() => setBlkImgFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-slate-100 p-4 text-xs text-slate-500">
                    UPTD BLK Kabupaten Sidoarjo
                  </div>
                )}
              </div>
              <div className="p-4">
                <p className="text-xs font-medium text-slate-500">Bidang Lattas · Sertifikasi BNSP</p>
                <h3 className="mt-1 text-sm font-bold text-[#0F294A]">
                  Pelatihan Kerja UPTD BLK Sidoarjo
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Pelatihan vokasi CNC, las industri, listrik, tata boga, dan pemasaran digital gratis bagi warga ber-KTP Sidoarjo.
                </p>
              </div>
            </div>

            {/* Dokumen & Formulir Publik (PRD Halaman 6) */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold text-[#0284C7]">Dokumen & Blangko Publik</p>
              <h3 className="mt-1 text-sm font-bold text-[#0F294A]">
                Unduh Formulir Resmi Disnaker
              </h3>
              <div className="mt-3 divide-y divide-slate-100">
                {PUBLIC_FORMS.map((formItem) => (
                  <div
                    key={formItem.code}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800">
                        {formItem.title}
                      </p>
                      <p className="text-[11px] text-slate-500">{formItem.division}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadFormPdf(formItem)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-[#0F294A] hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      <Download className="h-3 w-3" />
                      PDF
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. PANDUAN EMAIL API 24/7 & SIMULATOR UJI WEBHOOK */}
      <section id="email-api" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="text-xs font-semibold text-[#0284C7]">
                Otomatisasi Email API 24 Jam / 7 Hari
              </p>
              <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-[#0F294A] text-balance">
                Cara Menggunakan Layanan Balasan Email Otomatis
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Kirim email kapan saja ke{' '}
                <span className="font-mono font-semibold text-[#0F294A]">
                  info-liko@disnaker.sidoarjokab.go.id
                </span>{' '}
                dengan kata kunci berikut pada <strong>Subjek</strong>. Sistem mengenali variasi penulisan dan membalas otomatis dalam &lt; 30 detik.
              </p>

              <div className="mt-6 space-y-2.5">
                {categories.map((cat) => {
                  const isCopied = copiedKeyword === cat.keyword_trigger;
                  return (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-bold text-[#0F294A]">
                          {cat.keyword_trigger}
                        </p>
                        <p className="truncate text-xs text-slate-600">{cat.name}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyKeyword(cat.keyword_trigger)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-[#0284C7] hover:text-[#0284C7] whitespace-nowrap shrink-0"
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            Tersalin
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Salin
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}

                {/* BANTUAN command row (PRD Page 4) */}
                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-[#0F294A]">BANTUAN</p>
                    <p className="truncate text-xs text-slate-600">
                      Daftar menu kata kunci layanan resmi
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyKeyword('BANTUAN')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-[#0284C7] hover:text-[#0284C7] whitespace-nowrap shrink-0"
                  >
                    {copiedKeyword === 'BANTUAN' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        Tersalin
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Salin
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="mt-6 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-[#0284C7] shrink-0" />
                <div className="text-xs leading-relaxed text-slate-600">
                  <strong className="text-slate-900">Kepatuhan Privasi UU PDP:</strong> Jangan menyertakan NIK lengkap atau dokumen sensitif melalui email terbuka. Alamat pengirim otomatis disamarkan pada log sistem.
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-[#0F294A]">
                      Simulasi Kirim Email ke Webhook LIKO-Sidoarjo
                    </h3>
                    <p className="text-xs text-slate-500">
                      Uji respons otomatis (termasuk salah ketik ringan / fuzzy matcher) pada endpoint{' '}
                      <span className="font-mono">/api/webhook/email</span>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenSchemaSop}
                    className="text-xs font-semibold text-[#0284C7] hover:underline whitespace-nowrap shrink-0"
                  >
                    Lihat Draf Templat & SOP
                  </button>
                </div>

                <form onSubmit={handleSendTestWebhook} className="mt-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Email Pengirim
                      </label>
                      <input
                        type="email"
                        required
                        value={testEmailFrom}
                        onChange={(e) => setTestEmailFrom(e.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Subjek / Kata Kunci
                      </label>
                      <input
                        type="text"
                        required
                        value={testEmailSubject}
                        onChange={(e) => setTestEmailSubject(e.target.value)}
                        placeholder="INFO AK1 / INFO LOKER / BANTUAN"
                        className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Isi Pesan Singkat (Opsional)
                    </label>
                    <textarea
                      rows={2}
                      value={testEmailBody}
                      onChange={(e) => setTestEmailBody(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
                    />
                  </div>

                  {webhookError && (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                      {webhookError}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-xs text-slate-500">
                      Dilindungi rate-limiter anti-spam SPBE (maks. 6 permintaan/menit).
                    </span>
                    <button
                      type="submit"
                      disabled={webhookLoading}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#173b69] disabled:opacity-60 whitespace-nowrap shrink-0"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {webhookLoading ? 'Memproses...' : 'Kirim & Uji Balasan'}
                    </button>
                  </div>
                </form>

                {webhookResult && (
                  <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 text-xs">
                      <span className="font-semibold text-emerald-700">
                        Status: {webhookResult.status} · Terdeteksi: {webhookResult.detectedKeyword}
                      </span>
                      <span className="font-mono text-slate-500 tabular-nums">
                        {webhookResult.responseTimeMs} ms · Log: {webhookResult.senderMasked}
                      </span>
                    </div>
                    <p className="mt-3 text-xs font-bold text-[#0F294A]">
                      Subjek Balasan: {webhookResult.replySubject}
                    </p>
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-sans text-xs leading-relaxed text-slate-700">
                      {webhookResult.replyBody}
                    </pre>

                    {/* FR-08: 1-Click Micro-Feedback inside Auto-Reply */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
                      <span className="text-slate-600">Apakah balasan otomatis ini membantu?</span>
                      {webhookFeedbackSent ? (
                        <span className="font-medium text-emerald-700">{webhookFeedbackSent}</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleQuickFeedback(
                                5,
                                webhookResult.categoryCode,
                                `Auto-reply ${webhookResult.detectedKeyword} membantu`,
                                'webhook'
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <ThumbsUp className="h-3 w-3" />
                            Membantu
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleQuickFeedback(
                                2,
                                webhookResult.categoryCode,
                                `Auto-reply ${webhookResult.detectedKeyword} belum sesuai`,
                                'webhook'
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <ThumbsDown className="h-3 w-3" />
                            Tidak Membantu
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. TIKET KONSULTASI, PELACAKAN NOMOR TIKET + EMAIL & SURVEI KILAT */}
      <section id="tiket-konsultasi" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7">
            <p className="text-xs font-semibold text-[#0284C7]">Eskalasi Ke Petugas / Mediator</p>
            <h2 className="mt-1 text-xl font-bold text-[#0F294A]">
              Ajukan Tiket Konsultasi Spesifik
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Untuk kasus perselisihan Hubungan Industrial, kendala akun SIAPkerja, atau verifikasi pelatihan, tiket otomatis diteruskan ke bidang terkait (SLA respons maksimal 1×24 jam kerja).
            </p>

            <form onSubmit={handleCreateTicket} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Kategori Layanan
                  </label>
                  <select
                    value={ticketCategory}
                    onChange={(e) => setTicketCategory(e.target.value as ServiceCode)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.name} (Bidang {c.target_division})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Tingkat Prioritas
                  </label>
                  <select
                    value={ticketPriority}
                    onChange={(e) => setTicketPriority(e.target.value as 'NORMAL' | 'URGENT')}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
                  >
                    <option value="NORMAL">Normal (SLA 1×24 Jam)</option>
                    <option value="URGENT">Mendesak (Perselisihan PHK / Penipuan)</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Nama Lengkap Pemohon
                  </label>
                  <input
                    type="text"
                    required
                    value={applicantName}
                    onChange={(e) => setApplicantName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    NIK (Otomatis Disamarkan UU PDP)
                  </label>
                  <input
                    type="text"
                    value={applicantNik}
                    onChange={(e) => setApplicantNik(e.target.value)}
                    placeholder="16 digit NIK Kab. Sidoarjo (opsional)"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Email Pemohon
                  </label>
                  <input
                    type="email"
                    required
                    value={applicantEmail}
                    onChange={(e) => setApplicantEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Nomor WhatsApp / Telepon
                  </label>
                  <input
                    type="tel"
                    required
                    value={applicantPhone}
                    onChange={(e) => setApplicantPhone(e.target.value)}
                    placeholder="0812xxxxxxxx"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Subjek Konsultasi
                </label>
                <input
                  type="text"
                  required
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  placeholder="Ringkas permasalahan yang ingin dikonsultasikan"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Uraian Kronologi / Kebutuhan
                </label>
                <textarea
                  rows={3}
                  required
                  value={ticketDescription}
                  onChange={(e) => setTicketDescription(e.target.value)}
                  placeholder="Jelaskan detail kasus atau kendala agar petugas bidang teknis dapat menindaklanjuti lebih cepat..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
                />
              </div>

              {ticketFormError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {ticketFormError}
                </p>
              )}

              {createdTicket && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
                  <p className="font-bold">
                    Tiket berhasil dibuat! Nomor Tiket Unik Anda:{' '}
                    <span className="font-mono text-sm">{createdTicket.ticket_number}</span>
                  </p>
                  <p className="mt-1">
                    Diteruskan ke Bidang <strong>{createdTicket.assigned_division}</strong> · Data identitas diamankan ({createdTicket.nik_masked}).
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={ticketSubmitting}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0284C7] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0369A1] disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                {ticketSubmitting ? 'Mengirim Tiket...' : 'Kirim Tiket Konsultasi'}
              </button>
            </form>
          </div>

          <div className="space-y-6 lg:col-span-5">
            {/* Ticket Tracker (FR-05: Ticket Number + Email) */}
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <p className="text-xs font-semibold text-[#0284C7]">Pelacakan Real-Time (FR-05)</p>
              <h2 className="mt-1 text-xl font-bold text-[#0F294A]">
                Lacak Status Nomor Tiket
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Masukkan nomor tiket unik beserta alamat email pemohon untuk memverifikasi disposisi bidang dan catatan tindak lanjut.
              </p>

              <div className="mt-4 space-y-2.5">
                <input
                  type="text"
                  value={trackCode}
                  onChange={(e) => setTrackCode(e.target.value)}
                  placeholder="Nomor Tiket: LIKO-2026-0401"
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm uppercase text-slate-900 focus:border-[#0284C7] focus:outline-none"
                />
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={trackEmail}
                    onChange={(e) => setTrackEmail(e.target.value)}
                    placeholder="Email pemohon (verifikasi)"
                    className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={trackLoading}
                    onClick={() => handleTrackTicket()}
                    className="h-10 rounded-lg bg-[#0F294A] px-4 text-xs font-semibold text-white hover:bg-[#173b69] disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    {trackLoading ? 'Mencari...' : 'Lacak'}
                  </button>
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Contoh cepat:</span>
                {[
                  { code: 'LIKO-2026-0401', email: 'slamet.taman@gmail.com' },
                  { code: 'LIKO-2026-0402', email: 'nadia.sidoarjo@gmail.com' },
                  { code: 'LIKO-2026-0403', email: 'arifin.blk@yahoo.com' },
                ].map((sample) => (
                  <button
                    key={sample.code}
                    type="button"
                    onClick={() => {
                      setTrackCode(sample.code);
                      setTrackEmail(sample.email);
                      handleTrackTicket(sample.code, sample.email);
                    }}
                    className="font-mono text-xs font-medium text-[#0284C7] hover:underline"
                  >
                    {sample.code}
                  </button>
                ))}
              </div>

              {trackError && (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {trackError}
                </p>
              )}

              {trackedResult && (
                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-bold text-[#0F294A]">
                      {trackedResult.ticket.ticket_number}
                    </span>
                    <span className="font-semibold text-[#0284C7]">
                      {STATUS_LABELS[trackedResult.ticket.status]}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-slate-900">
                    {trackedResult.ticket.subject}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Pemohon: {trackedResult.ticket.applicant_name} ({trackedResult.ticket.nik_masked})
                  </p>

                  <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-3 text-xs text-slate-600">
                    <p>
                      <strong>Disposisi Bidang:</strong> Bidang {trackedResult.ticket.assigned_division}
                      {trackedResult.assignedOfficer
                        ? ` (${trackedResult.assignedOfficer})`
                        : ' (Menunggu penunjukan petugas)'}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span>
                        Batas SLA:{' '}
                        <span className="tabular-nums">
                          {new Date(trackedResult.ticket.sla_deadline_at).toLocaleString('id-ID')}
                        </span>
                      </span>
                    </p>
                    {trackedResult.ticket.resolution_note && (
                      <div className="mt-2 rounded-md border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700">
                        <strong className="block text-[#0F294A]">Catatan Petugas:</strong>
                        {trackedResult.ticket.resolution_note}
                      </div>
                    )}
                    {trackedResult.ticket.status === 'RESOLVED' && (
                      <div className="mt-2 flex items-center justify-between gap-2 pt-2 text-[11px]">
                        <span>Apakah penyelesaian tiket memuaskan?</span>
                        {ticketFeedbackSent ? (
                          <span className="font-semibold text-emerald-700">
                            {ticketFeedbackSent}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              handleQuickFeedback(
                                5,
                                trackedResult.category?.code || 'UMUM',
                                `Penyelesaian tiket ${trackedResult.ticket.ticket_number} memuaskan`,
                                'ticket'
                              )
                            }
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-[#0F294A] hover:bg-slate-100"
                          >
                            <ThumbsUp className="h-3 w-3" />
                            Puas
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Micro-Feedback Survey */}
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <p className="text-xs font-semibold text-[#0284C7]">Survei Kepuasan Kilat</p>
              <h3 className="mt-1 text-base font-bold text-[#0F294A]">
                Seberapa Membantu Layanan LIKO-Sidoarjo?
              </h3>

              <form onSubmit={handleSubmitFeedback} className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-1.5">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => setFeedbackRating(score)}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-lg border py-2 text-xs font-semibold transition-colors tabular-nums ${
                        feedbackRating === score
                          ? 'border-[#0284C7] bg-sky-50 text-[#0F294A]'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${
                          feedbackRating >= score
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-300'
                        }`}
                      />
                      {score}
                    </button>
                  ))}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <select
                    value={feedbackTopic}
                    onChange={(e) =>
                      setFeedbackTopic(e.target.value as ServiceCode | 'UMUM')
                    }
                    className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 focus:border-[#0284C7] focus:outline-none"
                  >
                    <option value="UMUM">Layanan Portal Umum</option>
                    <option value="AK1">Kartu Pencari Kerja (AK1)</option>
                    <option value="LOKER">Lowongan Kerja</option>
                    <option value="PELATIHAN">Pelatihan BLK</option>
                    <option value="HI">Hubungan Industrial</option>
                  </select>
                  <input
                    type="text"
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    placeholder="Saran singkat (opsional)"
                    className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-[#0284C7] focus:outline-none"
                  />
                </div>

                {feedbackSuccess && (
                  <p className="text-xs font-medium text-emerald-700">{feedbackSuccess}</p>
                )}

                <button
                  type="submit"
                  disabled={feedbackSubmitting}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-slate-50 text-xs font-semibold text-[#0F294A] transition-colors hover:bg-slate-100 disabled:opacity-60"
                >
                  {feedbackSubmitting ? 'Menyimpan...' : 'Kirim Penilaian'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
