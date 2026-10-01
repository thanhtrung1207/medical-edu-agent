'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useCallback, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import { CaseForm } from '@/components/case/CaseForm';
import { CaseChatPanel } from '@/components/case/CaseChatPanel';
import { SCENARIO_REGISTRY, Scenario } from '@/lib/case-schemas';
import { saveCase } from '@/lib/case-storage';
import { SavedCase } from '@/lib/types';

const VALID_SCENARIOS: Scenario[] = ['fracture', 'missing'];

type CaseTab = 'form' | 'chat';

const TAB_ID: Record<CaseTab, string> = {
  form: 'tab-form',
  chat: 'tab-chat',
};

const PANEL_ID: Record<CaseTab, string> = {
  form: 'panel-form',
  chat: 'panel-chat',
};

export default function CasePage() {
  const params = useParams();
  const router = useRouter();
  const scenario = params?.scenario as string;

  const [caseText, setCaseText] = useState<string | null>(null);
  const [caseSubmitted, setCaseSubmitted] = useState(false);
  const [caseTeeth, setCaseTeeth] = useState<number[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<CaseTab>('form');
  // Mobile tablist mode vs md+ side-by-side split. Starts false so the SSR
  // markup matches the first client render (no hydration mismatch); the
  // matchMedia listener corrects it right after hydration. While the tablist
  // is effective the panels carry tabpanel semantics and the inactive one is
  // hidden; at md+ the tablist is unmounted, so neither panel keeps tab
  // semantics or references the hidden tabs.
  const [isMdPlus, setIsMdPlus] = useState(false);

  const isValidScenario = VALID_SCENARIOS.includes(scenario as Scenario);
  const schema = isValidScenario ? SCENARIO_REGISTRY[scenario] : null;

  // Redirect to home if scenario is invalid
  useEffect(() => {
    if (!isValidScenario) {
      router.replace('/');
    }
  }, [isValidScenario, router]);

  // Reset state when scenario changes (e.g., navigating from /case/fracture to /case/missing)
  useEffect(() => {
    setCaseText(null);
    setCaseSubmitted(false);
    setCaseTeeth([]);
    setSessionId(undefined);
    setActiveTab('form');
  }, [scenario]);

  // Below md the case form and chat live in tabs; once the case is submitted
  // the analysis starts immediately, so jump to the chat tab.
  useEffect(() => {
    if (caseSubmitted) setActiveTab('chat');
  }, [caseSubmitted]);

  // Detect the md breakpoint where the tab bar gives way to the
  // side-by-side split. SSR-safe: the state starts as the mobile view and is
  // corrected after hydration.
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const handleChange = (event: MediaQueryListEvent) =>
      setIsMdPlus(event.matches);
    mql.addEventListener('change', handleChange);
    setIsMdPlus(mql.matches);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  // ALL useCallback hooks — MUST be declared before any early return
  // to satisfy React's Rules of Hooks (hook count must be stable across renders).
  const handleCaseSubmit = useCallback((text: string, teeth: number[]) => {
    setCaseText(text);
    setCaseTeeth(teeth);
    setCaseSubmitted(true);
  }, []);

  const handleSessionCreated = useCallback((sid: string) => {
    setSessionId(sid);
  }, []);

  const handleFinishCase = useCallback(
    (summary: string) => {
      const savedCase: SavedCase = {
        id: Date.now(),
        scenario: scenario as 'fracture' | 'missing',
        teeth: caseTeeth,
        date: new Date().toLocaleString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        summary: summary.substring(0, 300),
        sessionId: sessionId,
      };
      saveCase(savedCase);
      router.push('/history');
    },
    [scenario, caseTeeth, sessionId, router],
  );

  const handleBack = useCallback(() => {
    router.push('/');
  }, [router]);

  const handleTabSelect = useCallback((tab: CaseTab) => {
    setActiveTab(tab);
  }, []);

  // Roving-tabindex keyboard support: ArrowRight/ArrowLeft move activation
  // and focus between the two tabs, clamping at either end.
  const handleTabKeyDown = useCallback(
    (tab: CaseTab) => (event: KeyboardEvent<HTMLButtonElement>) => {
      if (tab === 'form' && event.key === 'ArrowRight') {
        event.preventDefault();
        setActiveTab('chat');
        document.getElementById(TAB_ID.chat)?.focus();
      } else if (tab === 'chat' && event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveTab('form');
        document.getElementById(TAB_ID.form)?.focus();
      }
    },
    [],
  );

  const tabButtonClass = (tab: CaseTab) =>
    `h-11 flex-1 border-b-2 text-sm font-medium transition ${
      activeTab === tab
        ? 'border-primary text-primary font-semibold'
        : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
    }`;

  // Render nothing during redirect for invalid scenario — only guards JSX, not hooks
  if (!isValidScenario || !schema) {
    return null;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Mobile tab bar — rendered only while the tablist is effective
          (below md); at md+ the panels split side-by-side instead. The
          md:hidden class also keeps the SSR/pre-hydration paint clean on
          desktop until the media query state settles. */}
      {!isMdPlus && (
        <div
          role="tablist"
          aria-label="Điều hướng ca lâm sàng"
          className="flex shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 md:hidden"
        >
          <button
            type="button"
            role="tab"
            id={TAB_ID.form}
            aria-selected={activeTab === 'form'}
            aria-controls={PANEL_ID.form}
            tabIndex={activeTab === 'form' ? 0 : -1}
            onClick={() => handleTabSelect('form')}
            onKeyDown={handleTabKeyDown('form')}
            className={tabButtonClass('form')}
          >
            Thông tin ca
          </button>
          <button
            type="button"
            role="tab"
            id={TAB_ID.chat}
            aria-selected={activeTab === 'chat'}
            aria-controls={PANEL_ID.chat}
            tabIndex={activeTab === 'chat' ? 0 : -1}
            onClick={() => handleTabSelect('chat')}
            onKeyDown={handleTabKeyDown('chat')}
            className={tabButtonClass('chat')}
          >
            Trợ lý AI
          </button>
        </div>
      )}

      {/* Panels — both stay mounted so form values, selected teeth and the
          running chat survive tab switches. While the mobile tablist is
          effective the inactive panel is hidden via the hidden attribute
          (state persists, and it leaves the accessibility tree); at md+ the
          tablist is gone, so the panels drop tabpanel semantics and never
          reference the unmounted tabs — md:block also bridges the
          pre-hydration desktop paint where both panes must show. */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Form panel */}
        <div
          id={PANEL_ID.form}
          role={isMdPlus ? undefined : 'tabpanel'}
          aria-labelledby={isMdPlus ? undefined : TAB_ID.form}
          hidden={!isMdPlus && activeTab !== 'form'}
          className="h-full overflow-hidden bg-white md:block md:w-80 md:flex-shrink-0 md:border-r md:border-borderSoft lg:w-[400px]"
        >
          <CaseForm
            key={scenario}
            scenario={scenario as Scenario}
            onCaseSubmit={handleCaseSubmit}
            submitted={caseSubmitted}
            onBack={handleBack}
          />
        </div>

        {/* Chat panel */}
        <div
          id={PANEL_ID.chat}
          role={isMdPlus ? undefined : 'tabpanel'}
          aria-labelledby={isMdPlus ? undefined : TAB_ID.chat}
          hidden={!isMdPlus && activeTab !== 'chat'}
          className="relative min-h-0 min-w-0 flex-1 overflow-hidden md:block"
        >
          {caseText ? (
            <CaseChatPanel
              key={`chat-${scenario}`}
              initialMessage={caseText}
              onSessionCreated={handleSessionCreated}
              onFinishCase={handleFinishCase}
            />
          ) : (
            /* Placeholder before case is submitted */
            <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-cream/50 via-white to-white px-6 text-center dark:from-slate-900 dark:to-slate-900">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-3xl">
                👨‍⚕️
              </div>
              <h2 className="text-xl font-bold text-slate-800">Giảng viên AI</h2>
              <p className="mt-1 text-xs font-medium text-slate-400">
                Hướng dẫn theo phương pháp Socratic
              </p>
              <p className="mt-4 text-sm font-medium text-slate-600">
                Sẵn sàng phân tích case
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Điền thông tin bệnh nhân và nhấn Gửi case để phân tích
              </p>
              <p className="mt-3 rounded-lg bg-secondary-50/60 px-3 py-2 text-xs text-secondary-800 dark:bg-slate-800 dark:text-slate-300">
                💡 Mẹo dùng nhanh — Nhấn ⚡ Case mẫu ở góc trên để tự động điền một ca thực tế và thử ngay
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
