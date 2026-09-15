'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChatInterface } from '@/components/chat/ChatInterface';

function ChatView() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');
  // Nonce emitted by the sidebar "new conversation" button; a changing value
  // remounts ChatInterface so a fresh chat starts even when already on /chat.
  const newChatNonce = searchParams.get('new');

  return (
    <ChatInterface
      key={newChatNonce ?? 'default'}
      externalSessionId={sessionId ?? undefined}
      freshSession={!sessionId}
      headerTitle="Trò chuyện"
      headerSubtitle="Hỏi đáp nha khoa"
    />
  );
}

export default function ChatPage() {
  return (
    <div className="h-full">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Đang tải cuộc trò chuyện...
          </div>
        }
      >
        <ChatView />
      </Suspense>
    </div>
  );
}
