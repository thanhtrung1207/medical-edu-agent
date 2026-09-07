"use client";

import { ChatInterface } from "@/components/chat/ChatInterface";

interface CaseChatPanelProps {
  initialMessage: string;
  onSessionCreated?: (sessionId: string) => void;
  onFinishCase?: (summary: string) => void;
}

export function CaseChatPanel({
  initialMessage,
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
      />
    </div>
  );
}
