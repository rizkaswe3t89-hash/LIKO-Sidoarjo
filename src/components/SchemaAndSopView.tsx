import { useState } from 'react';
import { Check, Copy, Database, Download, FileText, Mail, ShieldCheck } from 'lucide-react';
import {
  EMAIL_DRAFT_TEMPLATES,
  POSTGRES_DDL_SCHEMA,
  SERVICE_SOP_DOCUMENTS,
} from '../data/schemaAndSop';

interface TableSummary {
  name: string;
  purpose: string;
  keyColumns: string[];
  relations: string;
  pdpNote: string;
}

const RELATIONAL_TABLES: TableSummary[] = [
  {
    name: 'users',
    purpose: 'Akun ASN pengelola, operator bidang teknis (Penta, Lattas, HI), dan pimpinan.',
    keyColumns: ['id (PK)', 'nip (UNIQUE)', 'full_name', 'email (UNIQUE)', 'role', 'division', 'password_hash'],
    relations: 'Direferensikan oleh knowledge_articles.updated_by, consultation_tickets.assigned_user_id, audit_logs.actor_user_id',
    pdpNote: 'Password di-hash satu arah; akses berbasis peran (RBAC).',
  },
  {
    name: 'service_categories',
    purpose: 'Master 4 kategori layanan utama dan kata kunci pemicu Email API.',
    keyColumns: ['id (PK)', 'code (AK1/LOKER/PELATIHAN/HI)', 'keyword_trigger', 'target_division', 'automation_mode', 'sla_hours'],
    relations: '1-to-Many ke knowledge_articles, email_interaction_logs, dan consultation_tickets',
    pdpNote: 'Data referensi publik tanpa PII.',
  },
  {
    name: 'knowledge_articles',
    purpose: 'Basis pengetahuan FAQ portal dan templat balasan otomatis Email API.',
    keyColumns: ['id (PK)', 'category_id (FK)', 'title', 'keywords (TEXT[])', 'content_markdown', 'email_template_body', 'is_published'],
    relations: 'FK category_id -> service_categories.id; FK updated_by -> users.id',
    pdpNote: 'Indeks GIN pada kolom keywords untuk pencarian < 30ms.',
  },
  {
    name: 'email_interaction_logs',
    purpose: 'Rekam jejak otomatisasi Email API 24/7 beserta waktu respons (ms).',
    keyColumns: ['id (PK)', 'message_id (UNIQUE)', 'sender_masked', 'sender_hash', 'detected_keyword', 'response_time_ms', 'delivery_status'],
    relations: 'FK matched_category_id -> service_categories.id; FK matched_article_id -> knowledge_articles.id',
    pdpNote: 'Email pengirim disamarkan (sender_masked) dan di-hash SHA-256 sesuai UU PDP.',
  },
  {
    name: 'consultation_tickets',
    purpose: 'Tiket eskalasi konsultasi spesifik dan antrean disposisi bidang teknis.',
    keyColumns: ['id (PK)', 'ticket_number (UNIQUE)', 'category_id (FK)', 'nik_masked', 'assigned_division', 'assigned_user_id (FK)', 'status', 'sla_deadline_at'],
    relations: 'FK category_id -> service_categories.id; FK assigned_user_id -> users.id',
    pdpNote: 'NIK dan kontak tersamar di tampilan publik; target SLA <= 1x24 jam.',
  },
  {
    name: 'audit_logs',
    purpose: 'Jejak audit keamanan SPBE atas seluruh aksi perubahan data & ekspor laporan.',
    keyColumns: ['id (PK)', 'actor_user_id (FK)', 'action', 'entity_table', 'entity_id', 'ip_masked', 'created_at'],
    relations: 'FK actor_user_id -> users.id (ON DELETE SET NULL)',
    pdpNote: 'Append-only untuk kebutuhan pemeriksaan kepatuhan SPBE.',
  },
];

export default function SchemaAndSopView() {
  const [activeTab, setActiveTab] = useState<'schema' | 'templates' | 'sop'>('schema');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setCopiedId(null);
    }
  };

  const handleDownloadSql = () => {
    const blob = new Blob([POSTGRES_DDL_SCHEMA], { type: 'application/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'liko_sidoarjo_schema.sql';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="border-b border-slate-200 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-sky-700">
              Arsitektur Sistem · Dinas Tenaga Kerja Kabupaten Sidoarjo
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#0F294A] sm:text-3xl text-balance">
              Skema Basis Data Relasional, Templat Email API & SOP Layanan
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              Dokumentasi teknis lengkap rancangan 6 tabel relasional PostgreSQL, draf balasan otomatis 24/7, dan standar operasional prosedur sesuai ketentuan SPBE dan UU PDP.
            </p>
          </div>
          <a
            href="/assets/aistudio/PRD_LIKO-Sidoarjo_da45b5cb.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0F294A] transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5 text-[#0284C7]" />
            Dokumen PRD Resmi (PDF)
          </a>
        </div>

        <div className="mt-6 inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('schema')}
            className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'schema'
                ? 'bg-white text-[#0F294A] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            Skema Basis Data (6 Tabel)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'templates'
                ? 'bg-white text-[#0F294A] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Mail className="h-3.5 w-3.5" />
            Draf Templat Email API
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sop')}
            className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'sop'
                ? 'bg-white text-[#0F294A] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            SOP Layanan & UU PDP
          </button>
        </div>
      </div>

      {activeTab === 'schema' && (
        <div className="mt-8 space-y-8">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {RELATIONAL_TABLES.map((tbl, idx) => (
              <div
                key={tbl.name}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono font-medium text-sky-700">
                      0{idx + 1}. {tbl.name}
                    </span>
                    <ShieldCheck className="h-4 w-4 text-slate-400" />
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-900">{tbl.purpose}</p>
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-xs font-semibold text-slate-700">Kolom Utama:</p>
                    <p className="mt-1 font-mono text-[11px] leading-relaxed text-slate-600">
                      {tbl.keyColumns.join(' · ')}
                    </p>
                  </div>
                </div>
                <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <p className="font-medium text-slate-700">Relasi:</p>
                  <p className="mt-0.5 leading-relaxed">{tbl.relations}</p>
                  <p className="mt-2 text-[11px] text-sky-800">{tbl.pdpNote}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-[#0F294A]">
                  Skrip SQL DDL Lengkap (PostgreSQL 16+)
                </h2>
                <p className="text-xs text-slate-500">
                  Mencakup Primary Key, Foreign Key, CHECK constraints, indeks GIN, dan kolom keamanan UU PDP.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy('sql-ddl', POSTGRES_DDL_SCHEMA)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  {copiedId === 'sql-ddl' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Salin SQL
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSql}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F294A] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#163a66] whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  Unduh schema.sql
                </button>
              </div>
            </div>
            <pre className="max-h-[460px] overflow-auto bg-slate-950 p-5 font-mono text-xs leading-relaxed text-slate-200">
              <code>{POSTGRES_DDL_SCHEMA}</code>
            </pre>
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {EMAIL_DRAFT_TEMPLATES.map((tpl) => (
            <div
              key={tpl.keyword}
              className="flex flex-col rounded-xl border border-slate-200 bg-white"
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-semibold text-[#0284C7]">{tpl.keyword}</span>
                    <span aria-hidden="true">·</span>
                    <span>{tpl.mode}</span>
                  </div>
                  <h3 className="mt-1 text-base font-semibold text-[#0F294A]">{tpl.category}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Subjek Balasan: {tpl.subjectReply}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(tpl.keyword, tpl.body)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  {copiedId === tpl.keyword ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Salin Draf
                    </>
                  )}
                </button>
              </div>
              <pre className="flex-1 whitespace-pre-wrap bg-slate-50 p-5 font-sans text-xs leading-relaxed text-slate-700">
                {tpl.body}
              </pre>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'sop' && (
        <div className="mt-8 space-y-6">
          {SERVICE_SOP_DOCUMENTS.map((sop) => (
            <div
              key={sop.code}
              className="rounded-xl border border-slate-200 bg-white p-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <p className="font-mono text-xs font-semibold text-[#0284C7]">{sop.code}</p>
                  <h3 className="mt-1 text-lg font-bold text-[#0F294A]">{sop.title}</h3>
                </div>
                <p className="text-xs font-medium text-slate-600">Target SLA: {sop.sla}</p>
              </div>
              <p className="mt-3 text-xs text-slate-500">Ruang Lingkup: {sop.scope}</p>
              <ol className="mt-4 space-y-2.5 text-sm leading-relaxed text-slate-700">
                {sop.steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="font-mono text-xs font-semibold text-[#0F294A] pt-1 tabular-nums">
                      0{i + 1}.
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
