import type { OverviewPublisher, CryptoSession } from '../../service/src/ports.js';

type TelegramResponse = {
  ok: boolean;
  result?: { message_id: number };
  description?: string;
};

export class TelegramPublisher implements OverviewPublisher {
  constructor(
    private readonly botToken: string,
    readonly chatId: string,
  ) {}

  async publish(report: string, _session: CryptoSession): Promise<string[]> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: report,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Telegram API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as TelegramResponse;
    if (!data.ok || data.result === undefined) {
      throw new Error(`Telegram API returned not-ok: ${data.description ?? 'unknown error'}`);
    }

    return [data.result.message_id.toString()];
  }
}
