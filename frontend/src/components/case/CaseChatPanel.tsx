"use client";

import type { Scenario } from "@/lib/case-schemas";
import { ChatInterface } from "@/components/chat/ChatInterface";

interface CaseChatPanelProps {
  initialMessage: string;
  scenario: Scenario;
  onSessionCreated?: (sessionId: string) => void;
  onFinishCase?: (summary: string) => void;
}

export function CaseChatPanel({
  initialMessage,
  scenario,
  onSessionCreated,
  onFinishCase,
}: CaseChatPanelProps) {
  return (
    <div className="h-full flex-1">
      <ChatInterface
        initialMessage={initialMessage}
        freshSession
        showSuggestions={false}
        headerTitle="Giảng viên AI"
        headerSubtitle="Hướng dẫn theo phương pháp Socratic"
        onSessionCreated={onSessionCreated}
        onFinishCase={onFinishCase}
        scenario={scenario}
      />
    </div>
  );
}
