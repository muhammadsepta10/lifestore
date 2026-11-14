import { type Email, PengirimEmail } from '../../src/email/email.module';

/** Pengganti Resend di tes: menyimpan setiap email yang "dikirim". */
export class PenangkapEmail extends PengirimEmail {
  readonly terkirim: Email[] = [];

  async kirim(email: Email): Promise<void> {
    this.terkirim.push(email);
  }

  terakhirUntuk(ke: string): Email {
    const email = this.terkirim.filter((e) => e.ke === ke.toLowerCase()).at(-1);
    if (!email) throw new Error(`Tidak ada email untuk ${ke}`);
    return email;
  }

  /** Token dari tautan verifikasi di email terakhir untuk alamat ini. */
  tokenVerifikasiUntuk(ke: string): string {
    const token = /\/verifikasi\?token=([\w-]+)/.exec(this.terakhirUntuk(ke).teks)?.[1];
    if (!token) throw new Error(`Email untuk ${ke} tidak berisi tautan verifikasi`);
    return token;
  }

  /** Token dari tautan undangan karyawan di email terakhir untuk alamat ini. */
  tokenUndanganUntuk(ke: string): string {
    const token = /\/undangan\?token=([\w.-]+)/.exec(this.terakhirUntuk(ke).teks)?.[1];
    if (!token) throw new Error(`Email untuk ${ke} tidak berisi tautan undangan`);
    return token;
  }
}
