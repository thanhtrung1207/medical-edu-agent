'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useCallback, useEffect } from 'react';
import { CaseForm } from '@/components/case/CaseForm';
import { CaseChatPanel } from '@/components/case/CaseChatPanel';
import { SCENARIO_REGISTRY, Scenario } from '@/lib/case-schemas';
import { saveCase } from '@/lib/case-storage';
import { SavedCase } from '@/lib/types';

const VALID_SCENARIOS: Scenario[] = ['fracture', 'missing'];

export default function CasePage() {
  const params = useParams();
  const router = useRouter();
  const scenario = params?.scenario as string;

  const [caseText, setCaseText] = useState<string | null>(null);
  const [caseSubmitted, setCaseSubmitted] = useState(false);
  const [caseTeeth, setCaseTeeth] = useState<number[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

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
  }, [scenario]);

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

  // Render nothing during redirect for invalid scenario — only guards JSX, not hooks
  if (!isValidScenario || !schema) {
    return null;
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Left panel — Case Form */}
      <div className="h-1/2 w-full overflow-hidden border-b border-borderSoft bg-white md:h-full md:w-[400px] md:flex-shrink-0 md:border-b-0 md:border-r">
        <CaseForm
          key={scenario}
          scenario={scenario as Scenario}
          onCaseSubmit={handleCaseSubmit}
          submitted={caseSubmitted}
          onBack={handleBack}
        />
      </div>

      {/* Right panel — Chat */}
      <div className="relative flex h-1/2 min-w-0 flex-1 flex-col overflow-hidden md:h-full">
        {caseText ? (
          <CaseChatPanel
            key={`chat-${scenario}`}
            initialMessage={caseText}
            scenario={scenario as Scenario}
            onSessionCreated={handleSessionCreated}
            onFinishCase={handleFinishCase}
          />
        ) : (
          /* Placeholder before case is submitted */
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
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
              Điền thông tin bệnh nhân ở panel bên trái và nhấn Gửi case để phân tích
            </p>
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              💡 Mẹo dùng nhanh — Nhấn ⚡ Case mẫu ở góc trên để tự động điền một ca thực tế và thử ngay
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
