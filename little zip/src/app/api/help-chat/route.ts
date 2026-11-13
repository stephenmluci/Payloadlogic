import { NextRequest, NextResponse } from 'next/server';
import { askHelpAssistant } from '@/ai/flows/help-assistant';
import { findKnowledgeBaseFallback } from '@/lib/helpKnowledgeBase';

export const runtime = 'nodejs';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
};

export async function POST(req: NextRequest) {
  let userQuestion = '';

  try {
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      // Handle empty or invalid JSON body
    }

    const question = body?.question;
    const history = body?.history;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json(
        {
          error: 'A question is required.',
          answer: 'Please ask a question about PayloadLogic, hotshot trucking, GCWR compliance, or dispatching.',
        },
        { status: 400, headers: JSON_HEADERS }
      );
    }

    userQuestion = question.trim();

    const sanitizedHistory = Array.isArray(history)
      ? history
          .filter(h => (h.role === 'user' || h.role === 'model') && typeof h.content === 'string')
          .slice(-10) // Last 10 messages for context
      : [];

    const result = await askHelpAssistant({
      question: userQuestion,
      history: sanitizedHistory,
    });

    return NextResponse.json(
      {
        answer: result.answer,
      },
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (error: any) {
    console.error('Help Chatbot Route Error:', error);

    // Try knowledge base fallback first so user still receives an accurate answer
    if (userQuestion) {
      const fallback = findKnowledgeBaseFallback(userQuestion);
      if (fallback) {
        return NextResponse.json(
          {
            answer: fallback,
          },
          { status: 200, headers: JSON_HEADERS }
        );
      }
    }

    return NextResponse.json(
      {
        answer:
          "I'm having trouble connecting right now. You can check the Help Topics on the left or reach out directly to support@payloadlogic.app.",
        error: error?.message || 'Internal error',
      },
      { status: 200, headers: JSON_HEADERS }
    );
  }
}
