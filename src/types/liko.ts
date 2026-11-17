export type UserRole =
  | 'ADMIN_UTAMA'
  | 'OPERATOR_PENTA'
  | 'OPERATOR_LATTAS'
  | 'MEDIATOR_HI'
  | 'PIMPINAN';

export type TechnicalDivision = 'Sekretariat' | 'Penta' | 'Lattas' | 'HI';

export type ServiceCode = 'AK1' | 'LOKER' | 'PELATIHAN' | 'HI';

export type TicketStatus = 'OPEN' | 'IN_DISPOSITION' | 'IN_PROGRESS' | 'RESOLVED';

export type TicketPriority = 'NORMAL' | 'URGENT';

export interface User {
  id: number;
  nip: string;
  full_name: string;
  email: string;
  role: UserRole;
  division: TechnicalDivision;
  is_active: boolean;
  created_at: string;
}

export interface ServiceCategory {
  id: number;
  code: ServiceCode;
  name: string;
  slug: string;
  keyword_trigger: string;
  target_division: TechnicalDivision;
  automation_mode: 'FULL_AUTO' | 'HYBRID_ESCALATION';
  sla_hours: number;
  description: string;
  sort_order: number;
}

export interface KnowledgeArticle {
  id: number;
  category_id: number;
  title: string;
  slug: string;
  keywords: string[];
  summary: string;
  content_markdown: string;
  email_template_body: string;
  sop_reference: string;
  is_published: boolean;
  view_count: number;
  helpful_count: number;
  updated_by: number;
  updated_at: string;
}

export interface EmailInteractionLog {
  id: number;
  message_id: string;
  sender_masked: string;
  sender_hash: string;
  subject_received: string;
  detected_keyword: string;
  matched_category_id: number | null;
  matched_article_id: number | null;
  response_time_ms: number;
  delivery_status: 'SENT_AUTO' | 'RATE_LIMITED' | 'FALLBACK_GUIDE';
  auto_reply_preview: string;
  created_at: string;
}

export interface ConsultationTicket {
  id: number;
  ticket_number: string;
  category_id: number;
  applicant_name: string;
  applicant_email_masked: string;
  applicant_email_hash?: string;
  applicant_phone_masked: string;
  nik_masked: string;
  subject: string;
  description: string;
  assigned_division: Exclude<TechnicalDivision, 'Sekretariat'>;
  assigned_user_id: number | null;
  status: TicketStatus;
  priority: TicketPriority;
  resolution_note: string | null;
  sla_deadline_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: number;
  actor_user_id: number | null;
  actor_name: string;
  action:
    | 'CREATE_FAQ'
    | 'UPDATE_FAQ'
    | 'DELETE_FAQ'
    | 'DISPOSE_TICKET'
    | 'RESOLVE_TICKET'
    | 'WEBHOOK_AUTOREPLY'
    | 'RATE_LIMIT_BLOCK'
    | 'EXPORT_REPORT'
    | 'SURVEY_SUBMIT'
    | 'CREATE_TICKET';
  entity_table: string;
  entity_id: string;
  detail: string;
  ip_masked: string;
  created_at: string;
}

export interface MicroFeedback {
  id: number;
  rating: number;
  category_code: ServiceCode | 'UMUM';
  comment: string;
  created_at: string;
}

export interface UnansweredQuery {
  id: number;
  query_text: string;
  source: 'EMAIL_API' | 'PORTAL_FAQ';
  hit_count: number;
  resolved: boolean;
  last_seen_at: string;
}

export interface DashboardMetrics {
  avgResponseSeconds: number;
  selfServiceRatio: number;
  slaComplianceRate: number;
  outOfHoursRatio: number;
  totalEmailInteractions: number;
  totalTickets: number;
  openTickets: number;
  resolvedTickets: number;
  satisfactionScore: number;
  satisfactionScale4: number;
  totalFeedbackCount: number;
  topicDistribution: Array<{
    code: ServiceCode;
    name: string;
    emailCount: number;
    ticketCount: number;
    total: number;
  }>;
  hourlyTraffic: Array<{
    hour: string;
    count: number;
  }>;
  recommendations: string[];
}
