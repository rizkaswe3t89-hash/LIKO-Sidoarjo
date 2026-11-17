import { useCallback, useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  BarChart3,
  BookOpen,
  Download,
  FileSpreadsheet,
  Inbox,
  LogOut,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type {
  AuditLog,
  ConsultationTicket,
  DashboardMetrics,
  EmailInteractionLog,
  KnowledgeArticle,
  MicroFeedback,
  ServiceCategory,
  TechnicalDivision,
  TicketPriority,
  TicketStatus,
  UnansweredQuery,
  User,
} from '../types/liko';

interface AsnDashboardProps {
  onPublicDataChanged: () => Promise<void>;
}

interface DashboardBundle {
  currentUser: User;
  metrics: DashboardMetrics;
  categories: ServiceCategory[];
  articles: KnowledgeArticle[];
  tickets: ConsultationTicket[];
  emailLogs: EmailInteractionLog[];
  auditLogs: AuditLog[];
  users: User[];
  feedbackList: MicroFeedback[];
  unansweredQueries: UnansweredQuery[];
}

const DEMO_ASN_ACCOUNTS = [
  { label: 'Admin Utama', email: 'ratna.kusuma@disnaker.sidoarjokab.go.id' },
  { label: 'Bidang Penta', email: 'bagus.penta@disnaker.sidoarjokab.go.id' },
  { label: 'Bidang Lattas', email: 'siti.lattas@disnaker.sidoarjokab.go.id' },
  { label: 'Mediator HI', email: 'hendra.hi@disnaker.sidoarjokab.go.id' },
  { label: 'Pimpinan (Kadisnaker)', email: 'kadisnaker@disnaker.sidoarjokab.go.id' },
];

const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Terbuka',
  IN_DISPOSITION: 'Disposisi',
  IN_PROGRESS: 'Diproses',
  RESOLVED: 'Selesai',
};

const ASN_STANDARD_TEMPLATES = [
  {
    label: 'Pilih templat jawaban baku ASN...',
    text: '',
  },
  {
    label: 'Penta — Verifikasi Akun SIAPkerja & Cetak AK1',
    text: 'Verifikasi akun SIAPkerja telah dibantu oleh Bidang Penta. Pemohon dapat mencetak Kartu AK1 secara gratis di Loket Disnaker Sidoarjo dengan membawa KTP asli dan pas foto 3x4.',
  },
  {
    label: 'Penta — Klarifikasi Lowongan Kerja Resmi vs Penipuan',
    text: 'Setelah pengecekan database Wajib Lapor Ketenagakerjaan (WLKP) Bidang Penta, perusahaan mitra resmi Disnaker tidak pernah memungut biaya tes/seragam. Harap abaikan permintaan transfer.',
  },
  {
    label: 'Lattas — Konfirmasi Seleksi & Daftar Ulang UPTD BLK',
    text: 'Hasil seleksi administrasi dan wawancara peserta UPTD BLK Sidoarjo telah terverifikasi. Pemohon dijadwalkan mengikuti daftar ulang sesuai jadwal gelombang berjalan.',
  },
  {
    label: 'HI — Penjadwalan Klarifikasi & Mediasi Tripartit',
    text: 'Risalah perundingan Bipartit telah diterima dan dicatat oleh Mediator Bidang HI Disnaker Kab. Sidoarjo. Undangan mediasi Tripartit diterbitkan sesuai jadwal layanan.',
  },
];

export default function AsnDashboard({ onPublicDataChanged }: AsnDashboardProps) {
  const [token, setToken] = useState<string | null>(null);
  const [loginIdentifier, setLoginIdentifier] = useState('ratna.kusuma@disnaker.sidoarjokab.go.id');
  const [loginPassword, setLoginPassword] = useState('asn-sidoarjo-2026');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [bundle, setBundle] = useState<DashboardBundle | null>(null);
  const [loadingBundle, setLoadingBundle] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'analytics' | 'tickets' | 'faq' | 'logs'>('analytics');
  const [avatarFailed, setAvatarFailed] = useState(false);

  // Ticket filter & disposition editor
  const [ticketDivisionFilter, setTicketDivisionFilter] = useState<'ALL' | 'Penta' | 'Lattas' | 'HI'>('ALL');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<'ALL' | TicketStatus>('ALL');
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [editDivision, setEditDivision] = useState<'Penta' | 'Lattas' | 'HI'>('HI');
  const [editUserId, setEditUserId] = useState<string>('');
  const [editStatus, setEditStatus] = useState<TicketStatus>('IN_PROGRESS');
  const [editPriority, setEditPriority] = useState<TicketPriority>('NORMAL');
  const [editResolutionNote, setEditResolutionNote] = useState('');
  const [savingTicket, setSavingTicket] = useState(false);

  // FAQ CRUD form states
  const [editingArticleId, setEditingArticleId] = useState<number | null>(null);
  const [resolveUnansweredId, setResolveUnansweredId] = useState<number | null>(null);
  const [showArticleForm, setShowArticleForm] = useState(false);
  const [artCategoryId, setArtCategoryId] = useState<number>(1);
  const [artTitle, setArtTitle] = useState('');
  const [artKeywords, setArtKeywords] = useState('');
  const [artSummary, setArtSummary] = useState('');
  const [artContent, setArtContent] = useState('');
  const [artEmailTemplate, setArtEmailTemplate] = useState('');
  const [artSopRef, setArtSopRef] = useState('SOP-LIKO-01');
  const [artPublished, setArtPublished] = useState(true);
  const [savingArticle, setSavingArticle] = useState(false);

  const fetchDashboard = useCallback(async (authToken: string) => {
    setLoadingBundle(true);
    try {
      const res = await fetch('/api/asn/dashboard', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.status === 401) {
        setToken(null);
        setBundle(null);
        return;
      }
      const data = (await res.json()) as DashboardBundle;
      setBundle(data);
    } finally {
      setLoadingBundle(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchDashboard(token);
    }
  }, [token, fetchDashboard]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/auth/asn-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: loginIdentifier,
          password: loginPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Gagal masuk ke Dashboard ASN.');
      } else {
        setToken(data.token);
        setActionError(null);
      }
    } catch {
      setLoginError('Terjadi kendala jaringan saat autentikasi ASN.');
    } finally {
      setLoginLoading(false);
    }
  };

  const filteredTickets = useMemo(() => {
    if (!bundle) return [];
    return bundle.tickets.filter((t) => {
      if (ticketDivisionFilter !== 'ALL' && t.assigned_division !== ticketDivisionFilter) {
        return false;
      }
      if (ticketStatusFilter !== 'ALL' && t.status !== ticketStatusFilter) {
        return false;
      }
      return true;
    });
  }, [bundle, ticketDivisionFilter, ticketStatusFilter]);

  const isViewerOnly = bundle?.currentUser.role === 'PIMPINAN';
  const isAdminUtama = bundle?.currentUser.role === 'ADMIN_UTAMA';

  const openTicketEditor = (ticket: ConsultationTicket) => {
    setActionError(null);
    setSelectedTicketId(ticket.id);
    setEditDivision(ticket.assigned_division);
    setEditUserId(ticket.assigned_user_id ? String(ticket.assigned_user_id) : '');
    setEditStatus(ticket.status);
    setEditPriority(ticket.priority);
    setEditResolutionNote(ticket.resolution_note || '');
  };

  const handleSaveTicketDisposition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedTicketId) return;
    setSavingTicket(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/asn/tickets/${selectedTicketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          assigned_division: editDivision,
          assigned_user_id: editUserId ? Number(editUserId) : null,
          status: editStatus,
          priority: editPriority,
          resolution_note: editResolutionNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Gagal memperbarui disposisi tiket.');
      } else {
        setSelectedTicketId(null);
        await fetchDashboard(token);
        await onPublicDataChanged();
      }
    } finally {
      setSavingTicket(false);
    }
  };

  const openCreateArticleForm = (prefillUnanswered?: UnansweredQuery) => {
    setActionError(null);
    setEditingArticleId(null);
    setResolveUnansweredId(prefillUnanswered?.id ?? null);
    setArtCategoryId(bundle?.categories[0]?.id ?? 1);
    setArtTitle(prefillUnanswered ? `Panduan: ${prefillUnanswered.query_text}` : '');
    setArtKeywords(prefillUnanswered ? prefillUnanswered.query_text : '');
    setArtSummary('');
    setArtContent('');
    setArtEmailTemplate('');
    setArtSopRef('SOP-LIKO-01');
    setArtPublished(true);
    setShowArticleForm(true);
    setActiveTab('faq');
  };

  const openEditArticleForm = (article: KnowledgeArticle) => {
    setActionError(null);
    setEditingArticleId(article.id);
    setResolveUnansweredId(null);
    setArtCategoryId(article.category_id);
    setArtTitle(article.title);
    setArtKeywords(article.keywords.join(', '));
    setArtSummary(article.summary);
    setArtContent(article.content_markdown);
    setArtEmailTemplate(article.email_template_body);
    setArtSopRef(article.sop_reference);
    setArtPublished(article.is_published);
    setShowArticleForm(true);
  };

  const handleSaveArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSavingArticle(true);
    setActionError(null);
    try {
      const payload = {
        category_id: artCategoryId,
        title: artTitle,
        keywords: artKeywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        summary: artSummary,
        content_markdown: artContent,
        email_template_body: artEmailTemplate || artContent,
        sop_reference: artSopRef,
        is_published: artPublished,
        resolveUnansweredId,
      };
      const url = editingArticleId
        ? `/api/asn/articles/${editingArticleId}`
        : '/api/asn/articles';
      const method = editingArticleId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Gagal menyimpan artikel FAQ.');
      } else {
        setShowArticleForm(false);
        setResolveUnansweredId(null);
        await fetchDashboard(token);
        await onPublicDataChanged();
      }
    } finally {
      setSavingArticle(false);
    }
  };

  const handleDeleteArticle = async (id: number) => {
    if (!token) return;
    setActionError(null);
    const res = await fetch(`/api/asn/articles/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      setActionError(data.error || 'Gagal menghapus artikel FAQ.');
      return;
    }
    await fetchDashboard(token);
    await onPublicDataChanged();
  };

  const logExportAudit = async (format: 'PDF' | 'EXCEL_CSV') => {
    if (!token) return;
    await fetch('/api/asn/export-audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ format }),
    });
    await fetchDashboard(token);
  };

  const handleExportCsv = async () => {
    if (!bundle) return;
    const header = [
      'Nomor Tiket',
      'Subjek',
      'Bidang Disposisi',
      'Status',
      'Prioritas',
      'Batas SLA',
      'Dibuat Pada',
    ];
    const rows = bundle.tickets.map((t) => [
      t.ticket_number,
      `"${t.subject.replace(/"/g, '""')}"`,
      t.assigned_division,
      t.status,
      t.priority,
      t.sla_deadline_at,
      t.created_at,
    ]);
    const csvContent =
      '\uFEFF' + [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-liko-sidoarjo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    await logExportAudit('EXCEL_CSV');
  };

  const handleExportPdf = async () => {
    if (!bundle) return;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('LAPORAN EKSEKUTIF PIMPINAN LIKO-SIDOARJO', 14, 18);
    doc.setFontSize(9.5);
    doc.text('Dinas Tenaga Kerja Kabupaten Sidoarjo (Lampiran D PRD)', 14, 24);
    doc.text(
      `Tanggal Cetak: ${new Date().toLocaleString('id-ID')} | Pejabat: ${bundle.currentUser.full_name}`,
      14,
      30
    );
    doc.line(14, 34, 196, 34);

    // 1. Ringkasan Kinerja Bulan Berjalan
    doc.setFontSize(11);
    doc.text('1. Ringkasan Kinerja Bulan Berjalan', 14, 42);
    doc.setFontSize(9.5);
    doc.text(
      `- Total Interaksi Email API 24/7: ${bundle.metrics.totalEmailInteractions} | Total Tiket Eskalasi: ${bundle.metrics.totalTickets}`,
      14,
      49
    );
    doc.text(
      `- Rata-rata Respons Auto-Responder: ${bundle.metrics.avgResponseSeconds} detik (Target < 30 detik)`,
      14,
      55
    );
    doc.text(
      `- Rasio Penyelesaian Mandiri (Self-Service): ${bundle.metrics.selfServiceRatio}% (Target >= 80%)`,
      14,
      61
    );

    // 2. Statistik Akses di Luar Jam Kerja
    doc.setFontSize(11);
    doc.text('2. Statistik Akses di Luar Jam Kerja (16.00-07.30 WIB & Akhir Pekan)', 14, 71);
    doc.setFontSize(9.5);
    doc.text(
      `- Proporsi Akses Luar Jam Kerja: ${bundle.metrics.outOfHoursRatio}% dari total trafik (Target 35% - 45%)`,
      14,
      78
    );

    // 3. Peringkat Topik Paling Dicari
    doc.setFontSize(11);
    doc.text('3. Peringkat Topik Layanan Paling Dicari', 14, 88);
    doc.setFontSize(9.5);
    let y = 95;
    for (const item of [...bundle.metrics.topicDistribution].sort((a, b) => b.total - a.total)) {
      doc.text(
        `- ${item.code} (${item.name}): ${item.emailCount} Email API | ${item.ticketCount} Tiket`,
        14,
        y
      );
      y += 6;
    }

    // 4. Kepatuhan SLA & Indeks Kepuasan
    y += 4;
    doc.setFontSize(11);
    doc.text('4. Kepatuhan SLA Petugas & Indeks Kepuasan Masyarakat', 14, y);
    y += 7;
    doc.setFontSize(9.5);
    doc.text(
      `- Kepatuhan SLA Tiket (<= 1x24 Jam Kerja): ${bundle.metrics.slaComplianceRate}% (${bundle.metrics.resolvedTickets} selesai / ${bundle.metrics.openTickets} aktif)`,
      14,
      y
    );
    y += 6;
    doc.text(
      `- Indeks Kepuasan Pengguna: ${bundle.metrics.satisfactionScale4} / 4.00 (${bundle.metrics.satisfactionScore} / 5.0 dari ${bundle.metrics.totalFeedbackCount} ulasan)`,
      14,
      y
    );

    // 5. Rekomendasi Tindak Lanjut
    y += 10;
    doc.setFontSize(11);
    doc.text('5. Rekomendasi Tindak Lanjut Kebijakan & Konten', 14, y);
    y += 7;
    doc.setFontSize(9.5);
    for (const rec of bundle.metrics.recommendations) {
      const wrapped = doc.splitTextToSize(`- ${rec}`, 180);
      doc.text(wrapped, 14, y);
      y += wrapped.length * 5.5;
    }

    doc.save(`laporan-eksekutif-liko-${new Date().toISOString().slice(0, 10)}.pdf`);
    await logExportAudit('PDF');
  };

  if (!token || !bundle) {
    return (
      <div className="mx-auto max-w-md px-4 py-14 sm:px-6">
        <div className="rounded-xl border border-slate-200 bg-white p-7">
          <p className="text-xs font-semibold text-[#0284C7]">
            Akses Terbatas ASN · SPBE Kab. Sidoarjo
          </p>
          <h1 className="mt-1.5 text-2xl font-bold text-[#0F294A]">
            Masuk Dashboard Pengelola & Pimpinan
          </h1>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            Gunakan email kedinasan atau NIP untuk mengakses analitik pimpinan, disposisi tiket bidang teknis, dan manajemen konten FAQ.
          </p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Email Kedinasan / NIP
              </label>
              <input
                type="text"
                required
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Kata Sandi
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#0284C7] focus:outline-none"
              />
            </div>

            {loginError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="h-10 w-full rounded-lg bg-[#0F294A] text-sm font-semibold text-white transition-colors hover:bg-[#173b69] disabled:opacity-60"
            >
              {loginLoading ? 'Memverifikasi...' : 'Masuk Dashboard ASN'}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="text-xs font-semibold text-slate-700">
              Pilih Peran Uji Cepat (Kata sandi: <span className="font-mono">asn-sidoarjo-2026</span>):
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {DEMO_ASN_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => {
                    setLoginIdentifier(acc.email);
                    setLoginPassword('asn-sidoarjo-2026');
                  }}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    loginIdentifier === acc.email
                      ? 'border-[#0284C7] bg-sky-50 text-[#0F294A]'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const maxTopicVal = Math.max(
    ...bundle.metrics.topicDistribution.map((t) => t.total),
    1
  );
  const maxHourVal = Math.max(
    ...bundle.metrics.hourlyTraffic.map((h) => h.count),
    1
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="border-b border-slate-200 bg-white p-5 lg:min-h-[calc(100vh-4rem)] lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="h-10 w-10 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shrink-0">
            {!avatarFailed ? (
              <img
                src="/src/assets/images/avatar_asn_admin_1794897265611.jpg"
                alt={bundle.currentUser.full_name}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#0F294A] text-xs font-bold text-white">
                ASN
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-[#0F294A]">
              {bundle.currentUser.full_name}
            </p>
            <p className="truncate text-[11px] text-slate-500">
              {bundle.currentUser.role} · {bundle.currentUser.division}
            </p>
          </div>
        </div>

        <nav className="mt-4 flex gap-1 overflow-x-auto lg:flex-col">
          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'analytics'
                ? 'bg-[#0F294A] text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Ringkasan KPI & Analitik
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tickets')}
            className={`flex items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'tickets'
                ? 'bg-[#0F294A] text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span className="inline-flex items-center gap-2.5">
              <Inbox className="h-4 w-4" />
              Antrean Disposisi Tiket
            </span>
            <span className="font-mono text-[11px] tabular-nums opacity-80">
              {bundle.metrics.openTickets}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('faq')}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'faq'
                ? 'bg-[#0F294A] text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            Manajemen FAQ & Auto-Reply
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'logs'
                ? 'bg-[#0F294A] text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ShieldAlert className="h-4 w-4" />
            Log Email API & Audit SPBE
          </button>
        </nav>

        <div className="mt-6 hidden border-t border-slate-100 pt-4 lg:block">
          <button
            type="button"
            onClick={() => {
              setToken(null);
              setBundle(null);
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            Keluar Sesi ASN
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="min-w-0 flex-1 p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs text-slate-500">
              Dashboard ASN /{' '}
              <span className="font-semibold text-[#0F294A]">
                {activeTab === 'analytics' && 'Analitik Pimpinan'}
                {activeTab === 'tickets' && 'Antrean Disposisi Bidang Teknis'}
                {activeTab === 'faq' && 'Manajemen Konten FAQ'}
                {activeTab === 'logs' && 'Log Email API & Audit SPBE'}
              </span>
            </p>
            <h1 className="mt-1 text-xl font-bold text-[#0F294A]">
              Pengendalian Layanan Ketenagakerjaan Kabupaten Sidoarjo
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
              Ekspor Excel (CSV)
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0284C7] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0369A1] whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Ekspor Laporan Eksekutif PDF
            </button>
          </div>
        </div>

        {isViewerOnly && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-700">
            <strong>Mode Viewer Pimpinan (RBAC):</strong> Anda memiliki akses penuh ke analitik kinerja, grafik topik, dan ekspor laporan eksekutif. Perubahan data operasional dibatasi khusus untuk Pengelola & Verifikator Bidang.
          </div>
        )}

        {actionError && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">
            {actionError}
          </p>
        )}

        {loadingBundle && (
          <p className="mt-4 text-xs text-slate-500">Memuat pembaruan data...</p>
        )}

        {/* TAB 1: ANALYTICS & KPI */}
        {activeTab === 'analytics' && (
          <div className="mt-6 space-y-6">
            {/* 5 PRD KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">Respons Auto-Responder</p>
                <p className="mt-2 font-mono text-2xl font-bold text-[#0F294A] tabular-nums">
                  {bundle.metrics.avgResponseSeconds} dtk
                </p>
                <p className="mt-1 text-[11px] text-emerald-700">Target &lt; 30 detik</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">Rasio Self-Service</p>
                <p className="mt-2 font-mono text-2xl font-bold text-[#0F294A] tabular-nums">
                  {bundle.metrics.selfServiceRatio}%
                </p>
                <p className="mt-1 text-[11px] text-emerald-700">Target &ge; 80%</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">Kepatuhan SLA Tiket</p>
                <p className="mt-2 font-mono text-2xl font-bold text-[#0F294A] tabular-nums">
                  {bundle.metrics.slaComplianceRate}%
                </p>
                <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                  {bundle.metrics.resolvedTickets} selesai · {bundle.metrics.openTickets} aktif
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">Akses Luar Jam Kerja</p>
                <p className="mt-2 font-mono text-2xl font-bold text-[#0F294A] tabular-nums">
                  {bundle.metrics.outOfHoursRatio}%
                </p>
                <p className="mt-1 text-[11px] text-slate-500">Target 35%–45% trafik</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">Indeks Kepuasan (IKM)</p>
                <p className="mt-2 font-mono text-2xl font-bold text-[#0F294A] tabular-nums">
                  {bundle.metrics.satisfactionScale4} / 4.00
                </p>
                <p className="mt-1 text-[11px] text-emerald-700 tabular-nums">
                  Target &ge; 3.60 ({bundle.metrics.totalFeedbackCount} ulasan)
                </p>
              </div>
            </div>

            {/* Charts Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="text-sm font-bold text-[#0F294A]">
                  Distribusi Topik Layanan (Email API vs Tiket Eskalasi)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Perbandingan volume pertanyaan otomatis dan eskalasi bidang teknis.
                </p>

                <div className="mt-5 space-y-4">
                  {bundle.metrics.topicDistribution.map((item) => {
                    const emailWidth = Math.round((item.emailCount / maxTopicVal) * 100);
                    const ticketWidth = Math.round((item.ticketCount / maxTopicVal) * 100);
                    return (
                      <div key={item.code}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-800">
                            {item.code} · {item.name}
                          </span>
                          <span className="font-mono text-slate-600 tabular-nums">
                            {item.emailCount} email / {item.ticketCount} tiket
                          </span>
                        </div>
                        <div className="mt-1.5 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            style={{ width: `${emailWidth}%` }}
                            className="bg-[#0284C7]"
                            title={`Email API: ${item.emailCount}`}
                          />
                          <div
                            style={{ width: `${ticketWidth}%` }}
                            className="bg-[#0F294A]"
                            title={`Tiket Konsultasi: ${item.ticketCount}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 flex items-center gap-5 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[#0284C7]" />
                    Otomatisasi Email API
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[#0F294A]" />
                    Tiket Eskalasi Petugas
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="text-sm font-bold text-[#0F294A]">
                  Pola Jam Akses Sibuk Layanan 24 Jam (WIB)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Menunjukkan kebutuhan layanan mandiri di luar jam kerja kantor (16.00–07.30 WIB).
                </p>

                <div className="mt-6 flex h-44 items-end gap-2 border-b border-slate-200 pb-2">
                  {bundle.metrics.hourlyTraffic.map((bucket) => {
                    const heightPct = Math.max(8, Math.round((bucket.count / maxHourVal) * 100));
                    return (
                      <div key={bucket.hour} className="flex flex-1 flex-col items-center gap-1.5">
                        <span className="font-mono text-[11px] font-semibold text-slate-700 tabular-nums">
                          {bucket.count}
                        </span>
                        <div className="flex h-32 w-full items-end justify-center">
                          <div
                            style={{ height: `${heightPct}%` }}
                            className="w-full max-w-[34px] rounded-t-md bg-[#0284C7] transition-all"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2 text-center font-mono text-[11px] text-slate-500">
                  {bundle.metrics.hourlyTraffic.map((bucket) => (
                    <span key={bucket.hour} className="flex-1 tabular-nums">
                      {bucket.hour}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Unanswered Keywords + Lampiran D Recommendations */}
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="text-sm font-bold text-[#0F294A]">
                  Kata Kunci Tak Terjawab (Analisis Pembaruan Konten)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Daftar pencarian portal dan subjek email yang belum memiliki jawaban baku di basis pengetahuan.
                </p>
                {bundle.unansweredQueries.length === 0 ? (
                  <p className="mt-4 text-xs text-slate-500">
                    Seluruh kata kunci pencarian terbaru telah memiliki artikel FAQ terpadu.
                  </p>
                ) : (
                  <div className="mt-4 divide-y divide-slate-100">
                    {bundle.unansweredQueries.map((uq) => (
                      <div
                        key={uq.id}
                        className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{uq.query_text}</p>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            {uq.source} · {uq.hit_count} permintaan
                          </p>
                        </div>
                        {!isViewerOnly && (
                          <button
                            type="button"
                            onClick={() => openCreateArticleForm(uq)}
                            className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-[#0284C7] hover:bg-slate-50 whitespace-nowrap shrink-0"
                          >
                            Buat FAQ
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="text-sm font-bold text-[#0F294A]">
                  Rekomendasi Tindak Lanjut Pimpinan (Lampiran D)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Ringkasan otomatis untuk bahan rapat evaluasi Kepala Dinas & Sekretaris.
                </p>
                <ul className="mt-4 space-y-2.5 text-xs leading-relaxed text-slate-700">
                  {bundle.metrics.recommendations.map((rec, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="font-mono font-bold text-[#0284C7] tabular-nums">
                        0{i + 1}.
                      </span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Recent Micro-Feedback */}
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-sm font-bold text-[#0F294A]">Ulasan Kepuasan Warga Terkini</h2>
              <div className="mt-4 divide-y divide-slate-100">
                {bundle.feedbackList.slice(0, 5).map((fb) => (
                  <div key={fb.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                    <div>
                      <span className="font-mono font-bold text-[#0F294A] tabular-nums">
                        {fb.rating}/5
                      </span>{' '}
                      <span className="text-slate-400">·</span>{' '}
                      <span className="font-semibold text-[#0284C7]">{fb.category_code}</span>{' '}
                      <span className="text-slate-400">·</span>{' '}
                      <span className="text-slate-700">
                        {fb.comment || '(Penilaian cepat 1-klik)'}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {new Date(fb.created_at).toLocaleString('id-ID')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TICKET DISPOSITION QUEUE */}
        {activeTab === 'tickets' && (
          <div className="mt-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
                {(['ALL', 'Penta', 'Lattas', 'HI'] as const).map((div) => (
                  <button
                    key={div}
                    type="button"
                    onClick={() => setTicketDivisionFilter(div)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      ticketDivisionFilter === div
                        ? 'bg-white text-[#0F294A] shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {div === 'ALL' ? 'Semua Bidang' : `Bidang ${div}`}
                  </button>
                ))}
              </div>

              <select
                value={ticketStatusFilter}
                onChange={(e) => setTicketStatusFilter(e.target.value as 'ALL' | TicketStatus)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800"
              >
                <option value="ALL">Semua Status</option>
                <option value="OPEN">Terbuka (OPEN)</option>
                <option value="IN_DISPOSITION">Disposisi</option>
                <option value="IN_PROGRESS">Diproses</option>
                <option value="RESOLVED">Selesai</option>
              </select>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="px-4 py-3 font-semibold">Nomor Tiket</th>
                    <th className="px-4 py-3 font-semibold">Subjek & Pemohon</th>
                    <th className="px-4 py-3 font-semibold">Bidang</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Batas SLA</th>
                    <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTickets.map((t) => {
                    const officer = bundle.users.find((u) => u.id === t.assigned_user_id);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-mono font-semibold text-[#0F294A] whitespace-nowrap">
                          {t.ticket_number}
                          {t.priority === 'URGENT' && (
                            <span className="ml-2 text-[11px] font-bold text-red-600">
                              URGENT
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{t.subject}</p>
                          <p className="text-[11px] text-slate-500">
                            {t.applicant_name} · {t.nik_masked} · {t.applicant_phone_masked}
                          </p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-semibold text-slate-800">Bidang {t.assigned_division}</p>
                          <p className="text-[11px] text-slate-500">
                            {officer ? officer.full_name : 'Belum ditunjuk'}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#0284C7] whitespace-nowrap">
                          {TICKET_STATUS_LABELS[t.status]}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-600 tabular-nums whitespace-nowrap">
                          {new Date(t.sla_deadline_at).toLocaleString('id-ID')}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {!isViewerOnly ? (
                            <button
                              type="button"
                              onClick={() => openTicketEditor(t)}
                              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#0F294A] hover:bg-slate-100"
                            >
                              Disposisi / Tindak Lanjut
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">Hanya Lihat</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedTicketId && !isViewerOnly && (
              <form
                onSubmit={handleSaveTicketDisposition}
                className="rounded-xl border border-slate-200 bg-white p-6"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-[#0F294A]">
                    Panel Disposisi & Penyelesaian Tiket
                  </h3>
                  <button
                    type="button"
                    onClick={() => setSelectedTicketId(null)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-900"
                  >
                    Tutup
                  </button>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Bidang Teknis Tujuan
                    </label>
                    <select
                      value={editDivision}
                      onChange={(e) =>
                        setEditDivision(
                          e.target.value as Exclude<TechnicalDivision, 'Sekretariat'>
                        )
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                    >
                      <option value="Penta">Bidang Penta (AK1 & Loker)</option>
                      <option value="Lattas">Bidang Lattas (Pelatihan BLK)</option>
                      <option value="HI">Bidang HI (Hubungan Industrial)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Petugas Penanggung Jawab
                    </label>
                    <select
                      value={editUserId}
                      onChange={(e) => setEditUserId(e.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                    >
                      <option value="">-- Belum Ditunjuk --</option>
                      {bundle.users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.division})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Status Penanganan
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as TicketStatus)}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                    >
                      <option value="OPEN">OPEN (Terbuka)</option>
                      <option value="IN_DISPOSITION">IN_DISPOSITION (Disposisi)</option>
                      <option value="IN_PROGRESS">IN_PROGRESS (Ditangani)</option>
                      <option value="RESOLVED">RESOLVED (Selesai)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Prioritas
                    </label>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value as TicketPriority)}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                    >
                      <option value="NORMAL">NORMAL</option>
                      <option value="URGENT">URGENT</option>
                    </select>
                  </div>
                </div>

                {/* Disposisi & Template Jawaban Baku ASN (PRD Page 5) */}
                <div className="mt-4">
                  <label className="block text-xs font-semibold text-slate-700">
                    Templat Jawaban Baku ASN (Opsional)
                  </label>
                  <select
                    onChange={(e) => {
                      if (e.target.value) setEditResolutionNote(e.target.value);
                    }}
                    defaultValue=""
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 text-xs text-slate-800"
                  >
                    {ASN_STANDARD_TEMPLATES.map((tpl, idx) => (
                      <option key={idx} value={tpl.text}>
                        {tpl.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4">
                  <label className="block text-xs font-semibold text-slate-700">
                    Catatan Resmi Tindak Lanjut (Tampil di Pelacakan Tiket Publik)
                  </label>
                  <textarea
                    rows={3}
                    value={editResolutionNote}
                    onChange={(e) => setEditResolutionNote(e.target.value)}
                    placeholder="Tuliskan hasil verifikasi, jadwal mediasi, atau solusi teknis..."
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-900"
                  />
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTicketId(null)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={savingTicket}
                    className="rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#173b69] disabled:opacity-60"
                  >
                    {savingTicket ? 'Menyimpan...' : 'Simpan Disposisi'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* TAB 3: FAQ & AUTO-RESPONDER CRUD */}
        {activeTab === 'faq' && (
          <div className="mt-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#0F294A]">
                  Manajemen Konten FAQ & Kata Kunci Email API
                </h2>
                <p className="text-xs text-slate-500">
                  Perubahan artikel langsung sinkron ke pencarian Portal Publik dan mesin balasan otomatis Email API.
                </p>
              </div>
              {!isViewerOnly && (
                <button
                  type="button"
                  onClick={() => openCreateArticleForm()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0284C7] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0369A1] whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tambah Artikel FAQ
                </button>
              )}
            </div>

            {showArticleForm && !isViewerOnly && (
              <form
                onSubmit={handleSaveArticle}
                className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-[#0F294A]">
                    {editingArticleId ? 'Edit Artikel FAQ & Auto-Responder' : 'Artikel FAQ Baru'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowArticleForm(false)}
                    className="text-xs text-slate-500 hover:text-slate-900"
                  >
                    Tutup
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Kategori Layanan
                    </label>
                    <select
                      value={artCategoryId}
                      onChange={(e) => setArtCategoryId(Number(e.target.value))}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                    >
                      {bundle.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} - {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Referensi SOP
                    </label>
                    <input
                      type="text"
                      value={artSopRef}
                      onChange={(e) => setArtSopRef(e.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs"
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={artPublished}
                        onChange={(e) => setArtPublished(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-[#0284C7]"
                      />
                      Terbitkan di Portal Publik & Email API
                    </label>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Judul Artikel FAQ
                    </label>
                    <input
                      type="text"
                      required
                      value={artTitle}
                      onChange={(e) => setArtTitle(e.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Kata Kunci Pemicu (pisahkan dengan koma)
                    </label>
                    <input
                      type="text"
                      required
                      value={artKeywords}
                      onChange={(e) => setArtKeywords(e.target.value)}
                      placeholder="INFO AK1, kartu kuning, legalisir"
                      className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Ringkasan Singkat
                  </label>
                  <input
                    type="text"
                    required
                    value={artSummary}
                    onChange={(e) => setArtSummary(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs"
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Isi Panduan Portal FAQ
                    </label>
                    <textarea
                      rows={5}
                      required
                      value={artContent}
                      onChange={(e) => setArtContent(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Templat Balasan Otomatis Email API
                    </label>
                    <textarea
                      rows={5}
                      value={artEmailTemplate}
                      onChange={(e) => setArtEmailTemplate(e.target.value)}
                      placeholder="Kosongkan untuk menyamakan dengan isi panduan portal..."
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-xs"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowArticleForm(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={savingArticle}
                    className="rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#173b69] disabled:opacity-60"
                  >
                    {savingArticle ? 'Menyimpan...' : 'Simpan Artikel'}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-3">
              {bundle.articles.map((art) => {
                const cat = bundle.categories.find((c) => c.id === art.category_id);
                return (
                  <div
                    key={art.id}
                    className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-[#0284C7]">
                          {cat?.code || 'UMUM'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{art.is_published ? 'Terbit' : 'Draft'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{art.sop_reference}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{art.view_count} dibaca</span>
                      </div>
                      <h3 className="mt-1 text-sm font-bold text-[#0F294A]">{art.title}</h3>
                      <p className="mt-1 text-xs text-slate-600">{art.summary}</p>
                      <p className="mt-2 font-mono text-[11px] text-slate-500">
                        Kata Kunci: {art.keywords.join(' · ')}
                      </p>
                    </div>
                    {!isViewerOnly && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditArticleForm(art)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        {isAdminUtama && (
                          <button
                            type="button"
                            onClick={() => handleDeleteArticle(art.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Hapus
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: EMAIL API LOGS & SPBE AUDIT TRAIL */}
        {activeTab === 'logs' && (
          <div className="mt-6 space-y-6">
            <div>
              <h2 className="text-sm font-bold text-[#0F294A]">
                Log Interaksi Email API 24/7 (Kepatuhan UU PDP)
              </h2>
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="px-4 py-2.5 font-semibold">Waktu</th>
                      <th className="px-4 py-2.5 font-semibold">Pengirim (Tersamar)</th>
                      <th className="px-4 py-2.5 font-semibold">Subjek Diterima</th>
                      <th className="px-4 py-2.5 font-semibold">Kata Kunci</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Latensi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bundle.emailLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('id-ID')}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                          {log.sender_masked}
                        </td>
                        <td className="px-4 py-2.5 text-slate-900">{log.subject_received}</td>
                        <td className="px-4 py-2.5 font-mono font-semibold text-[#0284C7] whitespace-nowrap">
                          {log.detected_keyword}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                          {log.delivery_status}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-700 tabular-nums whitespace-nowrap">
                          {log.response_time_ms} ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-bold text-[#0F294A]">
                Jejak Audit Keamanan SPBE (audit_logs)
              </h2>
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="px-4 py-2.5 font-semibold">Waktu</th>
                      <th className="px-4 py-2.5 font-semibold">Aktor</th>
                      <th className="px-4 py-2.5 font-semibold">Aksi</th>
                      <th className="px-4 py-2.5 font-semibold">Entitas</th>
                      <th className="px-4 py-2.5 font-semibold">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bundle.auditLogs.map((audit) => (
                      <tr key={audit.id}>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                          {new Date(audit.created_at).toLocaleString('id-ID')}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                          {audit.actor_name}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-semibold text-[#0F294A] whitespace-nowrap">
                          {audit.action}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                          {audit.entity_table} #{audit.entity_id}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{audit.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
