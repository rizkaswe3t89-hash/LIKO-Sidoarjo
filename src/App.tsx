import { useCallback, useEffect, useState } from 'react';
import AsnDashboard from './components/AsnDashboard';
import PublicPortal from './components/PublicPortal';
import SchemaAndSopView from './components/SchemaAndSopView';
import type { KnowledgeArticle, ServiceCategory } from './types/liko';

type ActiveView = 'public' | 'asn' | 'schema';

interface BootstrapResponse {
  categories: ServiceCategory[];
  articles: KnowledgeArticle[];
  summary: {
    avgResponseSeconds: number;
    selfServiceRatio: number;
    slaComplianceRate: number;
    outOfHoursRatio: number;
    satisfactionScore: number;
    satisfactionScale4: number;
    totalFeedbackCount: number;
  };
}

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('public');
  const [data, setData] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPublicBootstrap = useCallback(async () => {
    try {
      const res = await fetch('/api/public/bootstrap');
      if (!res.ok) throw new Error('Gagal memuat data layanan');
      const json = (await res.json()) as BootstrapResponse;
      setData(json);
      setError(null);
    } catch {
      setError('Gagal terhubung ke server layanan LIKO-Sidoarjo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPublicBootstrap();
  }, [loadPublicBootstrap]);

  const handleHelpfulClick = async (articleId: number) => {
    const res = await fetch(`/api/public/faq/${articleId}/helpful`, {
      method: 'POST',
    });
    if (res.ok) {
      await loadPublicBootstrap();
    }
  };

  const navigateToSection = (sectionId: string) => {
    if (activeView !== 'public') {
      setActiveView('public');
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }, 80);
    } else {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Three-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          {/* Zone 1: Single-line Wordmark */}
          <button
            type="button"
            onClick={() => {
              setActiveView('public');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-lg font-bold tracking-tight text-[#0F294A] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] rounded"
          >
            LIKO-Sidoarjo
          </button>

          {/* Zone 2: 4 Single-line Text Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => navigateToSection('layanan-faq')}
              className="hover:text-[#0F294A] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Layanan
            </button>
            <button
              type="button"
              onClick={() => navigateToSection('email-api')}
              className="hover:text-[#0F294A] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Email 24/7
            </button>
            <button
              type="button"
              onClick={() => navigateToSection('tiket-konsultasi')}
              className="hover:text-[#0F294A] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Lacak Tiket
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('schema');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`hover:text-[#0F294A] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'schema' ? 'font-semibold text-[#0284C7] underline' : ''
              }`}
            >
              Skema & SOP
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action Button */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveView(activeView === 'asn' ? 'public' : 'asn');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#173b69] whitespace-nowrap shrink-0"
            >
              {activeView === 'asn' ? 'Portal Publik' : 'Portal ASN'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1">
        {loading ? (
          <div className="mx-auto max-w-6xl px-4 py-20 text-center text-sm text-slate-500">
            Memuat Portal LIKO-Sidoarjo...
          </div>
        ) : error || !data ? (
          <div className="mx-auto max-w-xl px-4 py-20 text-center">
            <p className="text-sm font-semibold text-red-700">
              {error || 'Data layanan tidak tersedia.'}
            </p>
            <button
              type="button"
              onClick={loadPublicBootstrap}
              className="mt-4 rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white"
            >
              Muat Ulang
            </button>
          </div>
        ) : activeView === 'public' ? (
          <PublicPortal
            categories={data.categories}
            articles={data.articles}
            summary={data.summary}
            onHelpfulClick={handleHelpfulClick}
            onRefreshSummary={loadPublicBootstrap}
            onOpenSchemaSop={() => {
              setActiveView('schema');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ) : activeView === 'asn' ? (
          <AsnDashboard onPublicDataChanged={loadPublicBootstrap} />
        ) : (
          <SchemaAndSopView />
        )}
      </div>

      {/* Quiet Civic Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-4 py-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div>
            <p className="font-bold text-[#0F294A]">
              LIKO-Sidoarjo · Dinas Tenaga Kerja Kabupaten Sidoarjo
            </p>
            <p className="mt-1">
              Jl. Raya Jati No. 4, Kabupaten Sidoarjo, Jawa Timur · Email API:{' '}
              <span className="font-mono text-slate-700">
                info-liko@disnaker.sidoarjokab.go.id
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={() => {
                setActiveView('public');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-[#0F294A]"
            >
              Portal Publik
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('schema');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-[#0F294A]"
            >
              Skema SQL & SOP
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('asn');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-[#0F294A]"
            >
              Dashboard ASN
            </button>
            <span className="text-slate-400">Standar SPBE & UU PDP</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
