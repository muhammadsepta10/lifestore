import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import { KONFIGURASI_API, type KonfigurasiApi } from '../konfigurasi';

export interface Email {
  ke: string;
  subjek: string;
  teks: string;
}

/**
 * Port pengiriman email. Production memakai Resend; tes mengganti provider ini dengan
 * penangkap email (lihat `test/support/penangkap-email.ts`).
 */
export abstract class PengirimEmail {
  abstract kirim(email: Email): Promise<void>;
}

@Injectable()
export class PengirimEmailResend extends PengirimEmail {
  private readonly logger = new Logger('Email');

  constructor(@Inject(KONFIGURASI_API) private readonly konfigurasi: KonfigurasiApi) {
    super();
  }

  async kirim(email: Email): Promise<void> {
    const { resendApiKey, emailPengirim } = this.konfigurasi;
    if (!resendApiKey) {
      // Pengembangan lokal tanpa kunci: tulis ke log supaya tautan verifikasi tetap bisa dipakai.
      this.logger.log(`Email ke ${email.ke}: ${email.subjek}\n${email.teks}`);
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: emailPengirim ?? 'Lifestore <onboarding@resend.dev>',
        to: [email.ke],
        subject: email.subjek,
        text: email.teks,
      }),
    });
    if (!res.ok) throw new Error(`Resend menolak email (${res.status}): ${await res.text()}`);
  }
}

@Global()
@Module({
  providers: [{ provide: PengirimEmail, useClass: PengirimEmailResend }],
  exports: [PengirimEmail],
})
export class EmailModule {}
