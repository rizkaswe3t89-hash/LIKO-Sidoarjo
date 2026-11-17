import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  computeDashboardMetrics,
  getDivisionForCategory,
  hashIdentifier,
  loadDb,
  maskEmail,
  maskNik,
  maskPhone,
  matchKeywordAndArticle,
  nextId,
  recordAudit,
  recordUnansweredQuery,
  sanitizeTicketPriority,
  sanitizeTicketStatus,
  saveDb,
} from './server/store.ts';
import type { ServiceCode } from './src/types/liko.ts';

const PORT = 3000;

// Sliding-window rate limiter per sender/IP (SPBE anti-spam protection)
const rateBucket = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 6;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (rateBucket.get(key) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateBucket.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  rateBucket.set(key, timestamps);
  return false;
}

function getMaskedIp(req: express.Request): string {
  const raw = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const parts = raw.replace('::ffff:', '').split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.${parts[3]}`;
  }
  return '127.0.***.1';
}

const asnSessions = new Map<string, number>();

function getAuthenticatedAsnUser(req: express.Request) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  const userId = asnSessions.get(token);
  if (!userId) return null;
  const db = loadDb();
  const user = db.users.find((u) => u.id === userId && u.is_active);
  if (!user) return null;
  const { password_hash: _omit, ...safeUser } = user;
  return safeUser;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  loadDb();

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'LIKO-Sidoarjo' });
  });

  // Public bootstrap: categories, published FAQs, aggregate metrics
  app.get('/api/public/bootstrap', (_req, res) => {
    const db = loadDb();
    const publishedArticles = db.knowledge_articles
      .filter((a) => a.is_published)
      .sort((a, b) => b.view_count - a.view_count);
    const metrics = computeDashboardMetrics(db);

    res.json({
      categories: db.service_categories.sort((a, b) => a.sort_order - b.sort_order),
      articles: publishedArticles,
      summary: {
        avgResponseSeconds: metrics.avgResponseSeconds,
        selfServiceRatio: metrics.selfServiceRatio,
        slaComplianceRate: metrics.slaComplianceRate,
        outOfHoursRatio: metrics.outOfHoursRatio,
        satisfactionScore: metrics.satisfactionScore,
        satisfactionScale4: metrics.satisfactionScale4,
        totalFeedbackCount: metrics.totalFeedbackCount,
      },
    });
  });

  // Instant keyword FAQ search
  app.get('/api/public/faq', (req, res) => {
    const db = loadDb();
    const q = String(req.query.q || '').trim().toLowerCase();
    const categoryCode = String(req.query.category || 'ALL').toUpperCase();

    let results = db.knowledge_articles.filter((a) => a.is_published);

    if (categoryCode !== 'ALL') {
      const cat = db.service_categories.find((c) => c.code === categoryCode);
      if (cat) {
        results = results.filter((a) => a.category_id === cat.id);
      }
    }

    if (q) {
      results = results.filter((a) => {
        const hay = `${a.title} ${a.summary} ${a.content_markdown} ${a.keywords.join(' ')}`.toLowerCase();
        return hay.includes(q);
      });
    }

    res.json({ articles: results });
  });

  // Record unmatched portal FAQ search query for Section 16 analytics
  app.post('/api/public/faq/log-miss', (req, res) => {
    const queryText = String(req.body?.queryText || '').trim();
    if (queryText.length < 3) {
      return res.json({ recorded: false });
    }
    const db = loadDb();
    recordUnansweredQuery(db, queryText, 'PORTAL_FAQ');
    saveDb(db);
    res.json({ recorded: true });
  });

  // Mark FAQ article as helpful
  app.post('/api/public/faq/:id/helpful', (req, res) => {
    const id = Number(req.params.id);
    const db = loadDb();
    const article = db.knowledge_articles.find((a) => a.id === id);
    if (!article) {
      return res.status(404).json({ error: 'Artikel FAQ tidak ditemukan.' });
    }
    article.helpful_count += 1;
    article.view_count += 1;
    saveDb(db);
    res.json({ helpful_count: article.helpful_count, view_count: article.view_count });
  });

  // Email API 24/7 Webhook Endpoint (FR-01, FR-02, Fuzzy Matcher + BANTUAN)
  app.post('/api/webhook/email', (req, res) => {
    const startedAt = Date.now();
    const from = String(req.body?.from || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const body = String(req.body?.body || '').trim();

    if (!from || !from.includes('@') || !subject) {
      return res.status(400).json({
        error: 'Alamat email pengirim dan subjek kata kunci wajib diisi.',
      });
    }

    const senderHash = hashIdentifier(from);
    const senderMasked = maskEmail(from);
    const db = loadDb();

    if (isRateLimited(`email:${senderHash}`)) {
      const elapsedMs = Math.max(12, Date.now() - startedAt);
      const logEntry = {
        id: nextId(db.email_interaction_logs),
        message_id: `msg-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
        sender_masked: senderMasked,
        sender_hash: senderHash,
        subject_received: subject.slice(0, 240),
        detected_keyword: 'RATE_LIMITED',
        matched_category_id: null,
        matched_article_id: null,
        response_time_ms: elapsedMs,
        delivery_status: 'RATE_LIMITED' as const,
        auto_reply_preview:
          'Permintaan melebihi batas anti-spam (maksimal 6 email/menit). Silakan coba kembali setelah 60 detik.',
        created_at: new Date().toISOString(),
      };
      db.email_interaction_logs.unshift(logEntry);
      recordAudit(db, {
        actorUserId: null,
        actorName: 'Rate Limiter SPBE',
        action: 'RATE_LIMIT_BLOCK',
        entityTable: 'email_interaction_logs',
        entityId: String(logEntry.id),
        detail: `Blokir sementara pengirim ${senderMasked} karena melebihi ambang anti-spam.`,
        ipMasked: getMaskedIp(req),
      });
      saveDb(db);
      return res.status(429).json({
        error:
          'Batas laju anti-spam tercapai (maks. 6 permintaan/menit). Demi keamanan SPBE, silakan tunggu 1 menit.',
        log: logEntry,
      });
    }

    const { detectedKeyword, isHelpMenu, category, article } = matchKeywordAndArticle(
      db,
      subject,
      body
    );

    if (!article && !isHelpMenu) {
      recordUnansweredQuery(db, subject, 'EMAIL_API');
    }

    const replySubject = isHelpMenu
      ? '[LIKO-Sidoarjo] Daftar Kata Kunci Layanan Informasi Otomatis 24 Jam'
      : article
        ? `[LIKO-Sidoarjo] ${article.title}`
        : '[LIKO-Sidoarjo] Panduan Kata Kunci Layanan Informasi Ketenagakerjaan';

    const replyBody = article
      ? article.email_template_body
      : `Yth. Pemohon Layanan Ketenagakerjaan,

${
  isHelpMenu
    ? 'Berikut menu kata kunci resmi layanan otomatis LIKO-Sidoarjo yang aktif 24 jam:'
    : 'Subjek email Anda belum cocok dengan kamus kata kunci kami. Silakan kirim ulang email ke info-liko@disnaker.sidoarjokab.go.id dengan salah satu subjek berikut:'
}

- INFO AK1         -> Syarat & alur Kartu Pencari Kerja (Kartu Kuning)
- INFO LOKER       -> Direktori lowongan kerja & jadwal Bursa Kerja Sidoarjo
- INFO PELATIHAN   -> Jadwal pelatihan vokasi & sertifikasi UPTD BLK Sidoarjo
- INFO HI          -> Panduan Hubungan Industrial, UMK, Bipartit & Mediasi
- BANTUAN          -> Daftar menu kata kunci layanan resmi

Catatan Privasi (UU PDP): Jangan mencantumkan NIK atau lampiran sensitif pada email terbuka. Untuk konsultasi spesifik, ajukan tiket resmi pada Portal LIKO-Sidoarjo.

Hormat kami,
Sistem Layanan Otomatis LIKO-Sidoarjo
Dinas Tenaga Kerja Kabupaten Sidoarjo`;

    if (article) {
      article.view_count += 1;
    }

    const elapsedMs = Math.max(18, Date.now() - startedAt + Math.floor(Math.random() * 24 + 14));
    const logEntry = {
      id: nextId(db.email_interaction_logs),
      message_id: `msg-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      sender_masked: senderMasked,
      sender_hash: senderHash,
      subject_received: subject.slice(0, 240),
      detected_keyword: detectedKeyword,
      matched_category_id: category ? category.id : null,
      matched_article_id: article ? article.id : null,
      response_time_ms: elapsedMs,
      delivery_status:
        article || isHelpMenu ? ('SENT_AUTO' as const) : ('FALLBACK_GUIDE' as const),
      auto_reply_preview: replySubject,
      created_at: new Date().toISOString(),
    };

    db.email_interaction_logs.unshift(logEntry);
    recordAudit(db, {
      actorUserId: null,
      actorName: 'Email API Gateway',
      action: 'WEBHOOK_AUTOREPLY',
      entityTable: 'email_interaction_logs',
      entityId: String(logEntry.id),
      detail: `Balasan otomatis (${detectedKeyword}) terkirim dalam ${elapsedMs} ms ke ${senderMasked}.`,
      ipMasked: getMaskedIp(req),
    });
    saveDb(db);

    res.json({
      status: logEntry.delivery_status,
      detectedKeyword,
      categoryCode: category?.code || 'UMUM',
      categoryName: isHelpMenu ? 'Menu Bantuan Kata Kunci' : category?.name || 'Panduan Umum',
      responseTimeMs: elapsedMs,
      senderMasked,
      replySubject,
      replyBody,
      log: logEntry,
    });
  });

  // Public Ticket Submission (with UU PDP Masking & Auto-Routing)
  app.post('/api/public/tickets', (req, res) => {
    const ipKey = `ticket:${getMaskedIp(req)}`;
    if (isRateLimited(ipKey)) {
      return res.status(429).json({
        error: 'Terlalu banyak pengajuan tiket dalam waktu singkat. Silakan tunggu 1 menit.',
      });
    }

    const categoryCode = String(req.body?.categoryCode || 'HI').toUpperCase() as ServiceCode;
    const applicantName = String(req.body?.applicantName || '').trim();
    const applicantEmail = String(req.body?.applicantEmail || '').trim();
    const applicantPhone = String(req.body?.applicantPhone || '').trim();
    const nik = String(req.body?.nik || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const description = String(req.body?.description || '').trim();
    const priority = sanitizeTicketPriority(req.body?.priority);

    if (!applicantName || !applicantEmail.includes('@') || !applicantPhone || !subject || !description) {
      return res.status(400).json({
        error: 'Nama lengkap, email valid, nomor telepon, subjek, dan uraian konsultasi wajib diisi.',
      });
    }

    const db = loadDb();
    const category =
      db.service_categories.find((c) => c.code === categoryCode) || db.service_categories[3];

    const newId = nextId(db.consultation_tickets);
    const ticketNumber = `LIKO-2026-${String(400 + newId).padStart(4, '0')}`;
    const now = new Date();
    const slaDeadline = new Date(now.getTime() + category.sla_hours * 3600 * 1000).toISOString();
    const assignedDivision = getDivisionForCategory(category.code);

    const ticket = {
      id: newId,
      ticket_number: ticketNumber,
      category_id: category.id,
      applicant_name: applicantName.slice(0, 120),
      applicant_email_masked: maskEmail(applicantEmail),
      applicant_email_hash: hashIdentifier(applicantEmail),
      applicant_phone_masked: maskPhone(applicantPhone),
      nik_masked: nik ? maskNik(nik) : '3515********0000',
      subject: subject.slice(0, 200),
      description: description.slice(0, 2000),
      assigned_division: assignedDivision,
      assigned_user_id: null,
      status: 'OPEN' as const,
      priority,
      resolution_note: null,
      sla_deadline_at: slaDeadline,
      resolved_at: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    db.consultation_tickets.unshift(ticket);
    recordAudit(db, {
      actorUserId: null,
      actorName: 'Portal Publik',
      action: 'CREATE_TICKET',
      entityTable: 'consultation_tickets',
      entityId: ticketNumber,
      detail: `Tiket konsultasi baru (${category.code} -> Bidang ${assignedDivision}) diajukan dengan masking UU PDP.`,
      ipMasked: getMaskedIp(req),
    });
    saveDb(db);

    const { applicant_email_hash: _omitHash, ...publicTicket } = ticket;
    res.status(201).json({ ticket: publicTicket, category });
  });

  // Public Ticket Tracking by unique ticket number + optional email verification (FR-05)
  app.get('/api/public/tickets/:ticketNumber', (req, res) => {
    const ticketNumber = String(req.params.ticketNumber || '').trim().toUpperCase();
    const emailQuery = String(req.query.email || '').trim().toLowerCase();

    const db = loadDb();
    const ticket = db.consultation_tickets.find(
      (t) => t.ticket_number.toUpperCase() === ticketNumber
    );
    if (!ticket) {
      return res.status(404).json({
        error: `Nomor tiket "${ticketNumber}" tidak ditemukan. Periksa kembali format seperti LIKO-2026-0401.`,
      });
    }

    if (
      emailQuery &&
      ticket.applicant_email_hash &&
      hashIdentifier(emailQuery) !== ticket.applicant_email_hash
    ) {
      return res.status(403).json({
        error: 'Alamat email tidak sesuai dengan data pemohon pada nomor tiket tersebut.',
      });
    }

    const category = db.service_categories.find((c) => c.id === ticket.category_id) || null;
    const assignedOfficer = ticket.assigned_user_id
      ? db.users.find((u) => u.id === ticket.assigned_user_id)?.full_name || null
      : null;

    const { applicant_email_hash: _omitHash, ...publicTicket } = ticket;
    res.json({
      ticket: publicTicket,
      category,
      assignedOfficer,
    });
  });

  // Public Micro-Feedback Survey (FR-08)
  app.post('/api/public/feedback', (req, res) => {
    const rating = Number(req.body?.rating || 0);
    const categoryCode = String(req.body?.categoryCode || 'UMUM').toUpperCase() as ServiceCode | 'UMUM';
    const comment = String(req.body?.comment || '').trim().slice(0, 300);

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Skor kepuasan harus antara 1 hingga 5.' });
    }

    const db = loadDb();
    const feedback = {
      id: nextId(db.micro_feedback),
      rating,
      category_code: categoryCode,
      comment,
      created_at: new Date().toISOString(),
    };
    db.micro_feedback.unshift(feedback);
    recordAudit(db, {
      actorUserId: null,
      actorName: 'Warga Sidoarjo',
      action: 'SURVEY_SUBMIT',
      entityTable: 'micro_feedback',
      entityId: String(feedback.id),
      detail: `Survei kepuasan kilat skor ${rating}/5 untuk topik ${categoryCode}.`,
      ipMasked: getMaskedIp(req),
    });
    saveDb(db);

    const metrics = computeDashboardMetrics(db);
    res.status(201).json({
      feedback,
      satisfactionScore: metrics.satisfactionScore,
      satisfactionScale4: metrics.satisfactionScale4,
      totalFeedbackCount: metrics.totalFeedbackCount,
    });
  });

  // ASN Authentication
  app.post('/api/auth/asn-login', (req, res) => {
    const identifier = String(req.body?.identifier || '').trim().toLowerCase();
    const password = String(req.body?.password || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email kedinasan / NIP dan kata sandi wajib diisi.' });
    }

    const db = loadDb();
    const user = db.users.find(
      (u) =>
        u.is_active &&
        (u.email.toLowerCase() === identifier || u.nip === identifier)
    );

    if (!user || user.password_hash !== hashIdentifier(password)) {
      return res.status(401).json({
        error: 'Kredensial ASN tidak sesuai atau akun dinonaktifkan.',
      });
    }

    const token = `liko-asn-${crypto.randomBytes(18).toString('hex')}`;
    asnSessions.set(token, user.id);

    const { password_hash: _omit, ...safeUser } = user;
    res.json({ token, user: safeUser });
  });

  // ASN Dashboard Bundle (requires valid ASN Bearer token)
  app.get('/api/asn/dashboard', (req, res) => {
    const currentUser = getAuthenticatedAsnUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Sesi ASN diperlukan untuk mengakses Dashboard.' });
    }

    const db = loadDb();
    const metrics = computeDashboardMetrics(db);
    const safeUsers = db.users.map(({ password_hash: _omit, ...u }) => u);
    const safeTickets = db.consultation_tickets.map(({ applicant_email_hash: _h, ...t }) => t);

    res.json({
      currentUser,
      metrics,
      categories: db.service_categories.sort((a, b) => a.sort_order - b.sort_order),
      articles: db.knowledge_articles,
      tickets: safeTickets,
      emailLogs: db.email_interaction_logs.slice(0, 60),
      auditLogs: db.audit_logs.slice(0, 80),
      users: safeUsers,
      feedbackList: db.micro_feedback.slice(0, 30),
      unansweredQueries: db.unanswered_queries
        .filter((q) => !q.resolved)
        .sort((a, b) => b.hit_count - a.hit_count),
    });
  });

  // ASN Ticket Disposition & Resolution (RBAC: PIMPINAN is read-only viewer)
  app.patch('/api/asn/tickets/:id', (req, res) => {
    const currentUser = getAuthenticatedAsnUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Sesi ASN tidak valid.' });
    }
    if (currentUser.role === 'PIMPINAN') {
      return res.status(403).json({
        error: 'Role Pimpinan bersifat Viewer Eksekutif dan tidak dapat memodifikasi disposisi tiket.',
      });
    }

    const id = Number(req.params.id);
    const db = loadDb();
    const ticket = db.consultation_tickets.find((t) => t.id === id);
    if (!ticket) {
      return res.status(404).json({ error: 'Tiket tidak ditemukan.' });
    }

    const nextStatus = sanitizeTicketStatus(req.body?.status);
    const assignedDivision = req.body?.assigned_division;
    const assignedUserId = req.body?.assigned_user_id;
    const priority = req.body?.priority;
    const resolutionNote = req.body?.resolution_note;

    if (assignedDivision === 'Penta' || assignedDivision === 'Lattas' || assignedDivision === 'HI') {
      ticket.assigned_division = assignedDivision;
    }
    if (assignedUserId === null || typeof assignedUserId === 'number') {
      ticket.assigned_user_id = assignedUserId;
    }
    if (priority === 'NORMAL' || priority === 'URGENT') {
      ticket.priority = priority;
    }
    if (typeof resolutionNote === 'string') {
      ticket.resolution_note = resolutionNote.trim() || null;
    }
    if (nextStatus) {
      ticket.status = nextStatus;
      if (nextStatus === 'RESOLVED' && !ticket.resolved_at) {
        ticket.resolved_at = new Date().toISOString();
      } else if (nextStatus !== 'RESOLVED') {
        ticket.resolved_at = null;
      }
    }
    ticket.updated_at = new Date().toISOString();

    recordAudit(db, {
      actorUserId: currentUser.id,
      actorName: currentUser.full_name,
      action: ticket.status === 'RESOLVED' ? 'RESOLVE_TICKET' : 'DISPOSE_TICKET',
      entityTable: 'consultation_tickets',
      entityId: ticket.ticket_number,
      detail: `Status ${ticket.status} | Disposisi Bidang ${ticket.assigned_division}.`,
      ipMasked: getMaskedIp(req),
    });
    saveDb(db);

    res.json({ ticket, metrics: computeDashboardMetrics(db) });
  });

  // ASN FAQ & Auto-Responder CRUD (RBAC enforced)
  app.post('/api/asn/articles', (req, res) => {
    const currentUser = getAuthenticatedAsnUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Sesi ASN tidak valid.' });
    }
    if (currentUser.role === 'PIMPINAN') {
      return res.status(403).json({
        error: 'Role Pimpinan bersifat Viewer Eksekutif dan tidak memiliki izin CRUD konten.',
      });
    }

    const categoryId = Number(req.body?.category_id);
    const title = String(req.body?.title || '').trim();
    const keywordsRaw = req.body?.keywords;
    const summary = String(req.body?.summary || '').trim();
    const contentMarkdown = String(req.body?.content_markdown || '').trim();
    const emailTemplateBody = String(req.body?.email_template_body || '').trim();
    const sopReference = String(req.body?.sop_reference || 'SOP-LIKO-01').trim();
    const isPublished = req.body?.is_published !== false;
    const resolveUnansweredId = req.body?.resolveUnansweredId
      ? Number(req.body.resolveUnansweredId)
      : null;

    if (!categoryId || !title || !summary || !contentMarkdown) {
      return res.status(400).json({ error: 'Kategori, judul, ringkasan, dan isi panduan wajib diisi.' });
    }

    const db = loadDb();
    const keywords = Array.isArray(keywordsRaw)
      ? keywordsRaw.map((k) => String(k).trim()).filter(Boolean)
      : String(keywordsRaw || '')
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean);

    const slug = `${title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}-${Date.now().toString().slice(-4)}`;

    const article = {
      id: nextId(db.knowledge_articles),
      category_id: categoryId,
      title,
      slug,
      keywords,
      summary,
      content_markdown: contentMarkdown,
      email_template_body: emailTemplateBody || contentMarkdown,
      sop_reference: sopReference,
      is_published: isPublished,
      view_count: 0,
      helpful_count: 0,
      updated_by: currentUser.id,
      updated_at: new Date().toISOString(),
    };

    db.knowledge_articles.unshift(article);
    if (resolveUnansweredId) {
      const uq = db.unanswered_queries.find((q) => q.id === resolveUnansweredId);
      if (uq) uq.resolved = true;
    }

    recordAudit(db, {
      actorUserId: currentUser.id,
      actorName: currentUser.full_name,
      action: 'CREATE_FAQ',
      entityTable: 'knowledge_articles',
      entityId: String(article.id),
      detail: `Menambahkan artikel FAQ "${article.title}" (${keywords.join(', ')}).`,
      ipMasked: getMaskedIp(req),
    });
    saveDb(db);

    res.status(201).json({ article });
  });

  app.put('/api/asn/articles/:id', (req, res) => {
    const currentUser = getAuthenticatedAsnUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Sesi ASN tidak valid.' });
    }
    if (currentUser.role === 'PIMPINAN') {
      return res.status(403).json({
        error: 'Role Pimpinan bersifat Viewer Eksekutif.',
      });
    }

    const id = Number(req.params.id);
    const db = loadDb();
    const article = db.knowledge_articles.find((a) => a.id === id);
    if (!article) {
      return res.status(404).json({ error: 'Artikel FAQ tidak ditemukan.' });
    }

    if (typeof req.body?.category_id === 'number') article.category_id = req.body.category_id;
    if (typeof req.body?.title === 'string' && req.body.title.trim()) {
      article.title = req.body.title.trim();
    }
    if (req.body?.keywords !== undefined) {
      article.keywords = Array.isArray(req.body.keywords)
        ? req.body.keywords.map((k: unknown) => String(k).trim()).filter(Boolean)
        : String(req.body.keywords)
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean);
    }
    if (typeof req.body?.summary === 'string') article.summary = req.body.summary.trim();
    if (typeof req.body?.content_markdown === 'string') {
      article.content_markdown = req.body.content_markdown.trim();
    }
    if (typeof req.body?.email_template_body === 'string') {
      article.email_template_body = req.body.email_template_body.trim();
    }
    if (typeof req.body?.sop_reference === 'string') {
      article.sop_reference = req.body.sop_reference.trim();
    }
    if (typeof req.body?.is_published === 'boolean') {
      article.is_published = req.body.is_published;
    }
    article.updated_by = currentUser.id;
    article.updated_at = new Date().toISOString();

    recordAudit(db, {
      actorUserId: currentUser.id,
      actorName: currentUser.full_name,
      action: 'UPDATE_FAQ',
      entityTable: 'knowledge_articles',
      entityId: String(article.id),
      detail: `Memperbarui artikel FAQ "${article.title}" (Publikasi: ${article.is_published ? 'Aktif' : 'Draft'}).`,
      ipMasked: getMaskedIp(req),
    });
    saveDb(db);

    res.json({ article });
  });

  app.delete('/api/asn/articles/:id', (req, res) => {
    const currentUser = getAuthenticatedAsnUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Sesi ASN tidak valid.' });
    }
    if (currentUser.role !== 'ADMIN_UTAMA') {
      return res.status(403).json({
        error: 'Hanya Admin Utama yang dapat menghapus artikel FAQ secara permanen.',
      });
    }

    const id = Number(req.params.id);
    const db = loadDb();
    const index = db.knowledge_articles.findIndex((a) => a.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Artikel FAQ tidak ditemukan.' });
    }

    const [removed] = db.knowledge_articles.splice(index, 1);
    recordAudit(db, {
      actorUserId: currentUser.id,
      actorName: currentUser.full_name,
      action: 'DELETE_FAQ',
      entityTable: 'knowledge_articles',
      entityId: String(id),
      detail: `Menghapus artikel FAQ "${removed.title}".`,
      ipMasked: getMaskedIp(req),
    });
    saveDb(db);

    res.json({ deletedId: id });
  });

  // Record export report action to audit trail
  app.post('/api/asn/export-audit', (req, res) => {
    const currentUser = getAuthenticatedAsnUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Sesi ASN tidak valid.' });
    }
    const format = String(req.body?.format || 'PDF').toUpperCase();
    const db = loadDb();
    recordAudit(db, {
      actorUserId: currentUser.id,
      actorName: currentUser.full_name,
      action: 'EXPORT_REPORT',
      entityTable: 'dashboard_reports',
      entityId: `${format}-${Date.now()}`,
      detail: `Ekspor laporan periodik pimpinan dalam format ${format}.`,
      ipMasked: getMaskedIp(req),
    });
    saveDb(db);
    res.json({ ok: true });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LIKO-Sidoarjo server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
